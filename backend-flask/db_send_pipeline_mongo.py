import os
import time
import threading
import requests
from datetime import datetime
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration -- all values can be overridden via .env
# ---------------------------------------------------------------------------
PIPELINE_URL  = os.getenv("PIPELINE_URL", "http://127.0.0.1:5000/occupancy/update")
HEALTH_URL    = os.getenv("HEALTH_URL",   "http://127.0.0.1:5000/health")
DB_NAME       = os.getenv("DB_NAME",      "OccupancyData")

# Seconds between full database scans when nothing is left to send
POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "2"))
# Seconds between individual document sends -- 0.05s allows ~20 sends/sec
SEND_DELAY    = float(os.getenv("SEND_DELAY", "0.05"))
# Max documents fetched per collection per scan
BATCH_LIMIT   = int(os.getenv("BATCH_LIMIT", "1000"))

# ---------------------------------------------------------------------------
# Collections the sender should never touch
# ---------------------------------------------------------------------------
EXCLUDED_COLLECTIONS = {"OccupancyInfo", "room_occupancy", "historical_logs"}

# ---------------------------------------------------------------------------
# Verbose mode
#
# When AUTO_START_SENDER=true the sender runs inside the Flask process and
# must stay silent so it does not pollute app.py terminal output.
# When run directly (python db_send_pipeline_mongo.py) it prints normally.
# ---------------------------------------------------------------------------
_auto_start = os.getenv("AUTO_START_SENDER", "false").lower() == "true"
VERBOSE = not _auto_start


def _log(msg: str):
    # Only prints when running in standalone mode
    if VERBOSE:
        print(msg)


# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------
def get_db():
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        raise RuntimeError("MONGO_URI is not set in .env")
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    client.server_info()
    return client[DB_NAME], client


# ---------------------------------------------------------------------------
# Timestamp normalisation
#
# Converts any timestamp format stored in MongoDB into an ISO 8601 string
# with a Z suffix so the pipeline always receives a consistent format.
# ---------------------------------------------------------------------------
def normalize_timestamp(ts):
    if ts is None:
        return datetime.utcnow().isoformat() + "Z"
    if isinstance(ts, datetime):
        return ts.isoformat() + "Z"
    if isinstance(ts, str):
        if ts.endswith("Z"):
            return ts
        if " " in ts:
            return ts.replace(" ", "T") + ":00Z"
        return ts + "Z"
    return datetime.utcnow().isoformat() + "Z"


# ---------------------------------------------------------------------------
# Sequence ID
#
# Built entirely from the ObjectId so it is stable across restarts.
# ObjectId encodes a millisecond timestamp in its first bytes and a unique
# counter in the last bytes -- combining them produces a number that is
# monotonically increasing with insertion order without any extra state.
# ---------------------------------------------------------------------------
def objectid_to_sequence(oid: ObjectId) -> int:
    ts_ms = int(oid.generation_time.timestamp() * 1000)
    tail  = int.from_bytes(oid.binary[-3:], "big")
    return ts_ms * 16777216 + tail


# ---------------------------------------------------------------------------
# Unsent document helpers
# ---------------------------------------------------------------------------
def ensure_sent_field(collection):
    # Add sent=False to any documents that are missing the field
    collection.update_many(
        {"sent": {"$exists": False}},
        {"$set": {"sent": False}}
    )


def fetch_unsent_batch(collection):
    # Sort by _id ascending to preserve insertion order, keeping sequence_ids
    # monotonically increasing per room without needing a per-room time gate
    return list(
        collection.find({"sent": False})
        .sort("_id", 1)
        .limit(BATCH_LIMIT)
    )


def update_doc_status(collection, doc_id, *, sent=None, validated=None, reason=None):
    # Update sent/validated flags on the raw document after processing
    update = {}
    if sent      is not None: update["sent"]              = sent
    if validated is not None: update["validated"]         = validated
    if reason    is not None: update["validation_reason"] = reason
    if update:
        collection.update_one({"_id": doc_id}, {"$set": update})


def build_payload(doc):
    building_id = doc.get("building_id")
    room_id     = doc.get("room_id")
    if not building_id or not room_id:
        return None
    return {
        "timestamp":       normalize_timestamp(doc.get("timestamp_iso")),
        "building_id":     building_id,
        "room_id":         room_id,
        "occupancy_state": int(doc.get("occupied", 0)),
        "source_id":       "mongodb_sender",
        # Derived from ObjectId -- monotonic and restart-safe
        "sequence_id":     objectid_to_sequence(doc["_id"]),
    }


# ---------------------------------------------------------------------------
# Pipeline POST
#
# Sends one document to the pipeline endpoint and returns a result tuple:
#   (ok: bool, http_code: int, kind: str, message: str)
#
# kind values:
#   accepted -- pipeline stored the update
#   warning  -- pipeline ignored it (duplicate or out-of-order)
#   error    -- pipeline rejected it or the request failed
# ---------------------------------------------------------------------------
def post_to_pipeline(payload):
    try:
        r    = requests.post(PIPELINE_URL, json=payload, timeout=2)
        code = r.status_code
        try:
            data = r.json()
        except Exception:
            data = {}

        if code == 200:
            if isinstance(data, dict) and "status" in data:
                return True, code, "accepted", data.get("message", "Update processed")
            if isinstance(data, dict) and "warning" in data:
                return True, code, "warning", str(data.get("warning"))
            return True, code, "warning", "HTTP 200 but missing status/warning"
        else:
            msg = ""
            if isinstance(data, dict):
                msg = str(data.get("error", "")) or str(data.get("message", ""))
            return False, code, "error", msg or f"HTTP {code}"

    except Exception as e:
        return False, 0, "error", str(e)


# ---------------------------------------------------------------------------
# Collection discovery -- returns all processable collection names
# ---------------------------------------------------------------------------
def get_dynamic_collections(db):
    return [
        name for name in db.list_collection_names()
        if not name.startswith("system.") and name not in EXCLUDED_COLLECTIONS
    ]


# ---------------------------------------------------------------------------
# Batch processor
#
# Sends all unsent documents in a collection one at a time in _id order.
# No per-room time gate is needed because the ObjectId sort guarantees
# sequence_ids are monotonically increasing across same-room records.
# SEND_DELAY adds a small pause between sends to keep server load stable.
# ---------------------------------------------------------------------------
def process_collection_batch(db, collection_name):
    collection = db[collection_name]
    ensure_sent_field(collection)

    docs = fetch_unsent_batch(collection)
    if not docs:
        return None

    _log(f"{collection_name}: {len(docs)} unsent documents in batch")

    sent_count    = 0
    failed_count  = 0
    skipped_count = 0

    for doc in docs:
        payload = build_payload(doc)

        if payload is None:
            # Missing required fields -- mark done so it is not retried
            update_doc_status(
                collection, doc["_id"],
                sent=True, validated=False,
                reason="Missing building_id or room_id",
            )
            skipped_count += 1
            continue

        _log(f"  -> {payload['building_id']}/{payload['room_id']} seq={payload['sequence_id']}")
        ok, code, kind, msg = post_to_pipeline(payload)

        if ok:
            update_doc_status(
                collection, doc["_id"],
                sent=True, validated=(kind == "accepted"), reason=msg,
            )
            sent_count += 1
            _log(f"     {kind}: {msg}")
        else:
            failed_count += 1
            _log(f"     FAILED (HTTP {code}): {msg}")
            # Stop this collection if the backend is actively rejecting requests
            break



    return {
        "collection": collection_name,
        "sent":       sent_count,
        "failed":     failed_count,
        "skipped":    skipped_count,
    }


# ---------------------------------------------------------------------------
# Collection worker
#
# Each collection runs in its own thread so all buildings send in parallel.
# Each thread gets its own MongoDB client to avoid cross-thread cursor issues.
# ---------------------------------------------------------------------------
def _collection_worker(collection_name, stop_event):
    db_local, client_local = get_db()
    try:
        while not stop_event.is_set():
            summary = process_collection_batch(db_local, collection_name)

            if summary is not None and VERBOSE:
                s, f, sk = summary["sent"], summary["failed"], summary["skipped"]
                if f > 0:
                    print(f"{collection_name}: processed={s}, failed={f}, skipped={sk}")
                else:
                    print(f"{collection_name}: processed={s}, skipped={sk}")

            # Wait before scanning for new unsent documents
            time.sleep(POLL_INTERVAL)
    finally:
        client_local.close()


# ---------------------------------------------------------------------------
# Main sender loop
#
# Spawns one worker thread per collection so all buildings validate and send
# simultaneously. With 4 buildings this is roughly 4x faster than sequential.
# ---------------------------------------------------------------------------
def run_sender():
    # Confirm backend is reachable before doing anything
    try:
        requests.get(HEALTH_URL, timeout=5)
    except Exception:
        _log(f"Backend not reachable at {HEALTH_URL}")
        return

    db_main, client_main = get_db()
    collections = get_dynamic_collections(db_main)
    client_main.close()

    if not collections:
        _log("No collections found to process.")
        return

    _log(f"Starting {len(collections)} parallel sender threads: {collections}")

    stop_event = threading.Event()
    threads = []

    for cname in collections:
        t = threading.Thread(
            target=_collection_worker,
            args=(cname, stop_event),
            daemon=True,
            name=f"sender-{cname}",
        )
        t.start()
        threads.append(t)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        _log("Stopping sender (Ctrl+C).")
        stop_event.set()
        for t in threads:
            t.join(timeout=5)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    run_sender()