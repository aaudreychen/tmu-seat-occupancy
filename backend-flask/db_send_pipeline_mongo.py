"""
db_send_pipeline_mongodb.py - Continuous Transmission Sender for MongoDB (Dynamic Collections)

- Continuously polls MongoDB for documents where sent=False
- Automatically discovers collections from the database 
- Sends each document to the transmission pipeline every 2-3 seconds
- Tracks sequence IDs per (building_id, room_id)
- Marks documents as sent so they aren't resent

"""


import os
import time
import requests
from datetime import datetime
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

PIPELINE_URL = os.getenv("PIPELINE_URL", "http://127.0.0.1:5000/occupancy/update")
HEALTH_URL = os.getenv("HEALTH_URL", "http://127.0.0.1:5000/health")
DB_NAME = os.getenv("DB_NAME", "OccupancyData")

POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "2"))
MIN_INTERVAL_PER_ROOM = float(os.getenv("MIN_INTERVAL_PER_ROOM", "2"))
BATCH_LIMIT = int(os.getenv("BATCH_LIMIT", "200"))

EXCLUDED_COLLECTIONS = {"OccupancyInfo", "room_occupancy"}


def get_db():
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        raise RuntimeError("MONGO_URI is not set in .env")

    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    client.server_info()  # fail fast if auth/network is wrong
    db = client[DB_NAME]
    return db, client


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


def objectid_to_sequence(oid: ObjectId) -> int:
    """
    Stable monotonic sequence_id derived from MongoDB ObjectId.
    This prevents sequence reset problems across restarts.
    """
    ts_ms = int(oid.generation_time.timestamp() * 1000)
    tail = int.from_bytes(oid.binary[-3:], "big")
    return ts_ms * 16777216 + tail


def ensure_sent_field(collection):
    # Add sent=False to any docs missing the field
    collection.update_many(
        {"sent": {"$exists": False}},
        {"$set": {"sent": False}}
    )


def fetch_unsent_batch(collection):
    return list(
        collection.find({"sent": False})
        .sort("_id", 1)
        .limit(BATCH_LIMIT)
    )


def update_doc_status(collection, doc_id, *, sent=None, validated=None, reason=None):
    """
    Updates status fields on the RAW document.
    - validated is only set after processing; otherwise remains missing.
    """
    update = {}
    if sent is not None:
        update["sent"] = sent
    if validated is not None:
        update["validated"] = validated
    if reason is not None:
        update["validation_reason"] = reason
    if update:
        collection.update_one({"_id": doc_id}, {"$set": update})


def build_payload(doc):
    building_id = doc.get("building_id")
    room_id = doc.get("room_id")
    if not building_id or not room_id:
        return None

    payload = {
        "timestamp": normalize_timestamp(doc.get("timestamp_iso")),
        "building_id": building_id,
        "room_id": room_id,
        "occupancy_state": int(doc.get("occupied", 0)),
        "source_id": "mongodb_sender",
        "sequence_id": objectid_to_sequence(doc["_id"]),
    }
    return payload


def post_to_pipeline(payload):
    """
    Returns (ok_http_200: bool, http_code: int, kind: str, message: str)

    kind:
      - "accepted" -> pipeline accepted update
      - "warning"  -> pipeline ignored it (duplicate/out-of-order)
      - "error"    -> pipeline rejected (400/500) or request failed
    """
    try:
        r = requests.post(PIPELINE_URL, json=payload, timeout=10)
        code = r.status_code

        try:
            data = r.json()
        except Exception:
            data = {}

        if code == 200:
            if isinstance(data, dict) and "status" in data:
                # success
                msg = data.get("message", "Update processed")
                return True, code, "accepted", f"{msg} ({data.get('status')})"
            if isinstance(data, dict) and "warning" in data:
                return True, code, "warning", str(data.get("warning"))
            # HTTP 200 but unexpected
            return True, code, "warning", "HTTP 200 but missing status/warning"
        else:
            msg = ""
            if isinstance(data, dict):
                msg = str(data.get("error", "")) or str(data.get("message", ""))
            if not msg:
                msg = f"HTTP {code}"
            return False, code, "error", msg

    except Exception as e:
        return False, 0, "error", str(e)



def get_dynamic_collections(db):
    cols = []
    for name in db.list_collection_names():
        if name.startswith("system."):
            continue
        if name in EXCLUDED_COLLECTIONS:
            continue
        cols.append(name)
    return cols


def process_collection_batch(db, collection_name, next_allowed):
    collection = db[collection_name]
    ensure_sent_field(collection)

    docs = fetch_unsent_batch(collection)
    if not docs:
        return None

    print(f"{collection_name}: Found {len(docs)} unsent documents (batch)")

    sent_count = 0
    failed_count = 0
    skipped_count = 0

    # Bucket docs by (building_id, room_id) so we can round-robin across rooms
    buckets = {}  # room_key -> list[(doc, payload)]
    for doc in docs:
        payload = build_payload(doc)
        if payload is None:
            # Missing required raw fields; don't retry forever
            update_doc_status(
                collection,
                doc["_id"],
                sent=True,
                validated=False,
                reason="Missing building_id or room_id in raw document",
            )
            skipped_count += 1
            continue

        room_key = (payload["building_id"], payload["room_id"])
        buckets.setdefault(room_key, []).append((doc, payload))

    # Round-robin: send any eligible room "now"
    while buckets:
        now = time.time()
        sent_any = False

        for room_key in list(buckets.keys()):
            queue = buckets.get(room_key, [])
            if not queue:
                buckets.pop(room_key, None)
                continue

            allowed_at = next_allowed.get(room_key, 0.0)
            if now < allowed_at:
                continue

            doc, payload = queue.pop(0)
            ok200, code, kind, msg = post_to_pipeline(payload)

            if ok200:
                # Mark delivery done either way to avoid infinite retries
                if kind == "accepted":
                    update_doc_status(collection, doc["_id"], sent=True, validated=True, reason=msg)
                    sent_count += 1
                else:
                    # warning: duplicate/out-of-order or other ignored case
                    update_doc_status(collection, doc["_id"], sent=True, validated=False, reason=msg)
                    sent_count += 1  # still counts as "processed/sent"
            else:
                failed_count += 1
                print(
                    f"  FAILED {payload['building_id']}/{payload['room_id']} "
                    f"(HTTP {code}) -> {msg}"
                )
                # Stop this collection for this scan if backend is failing
                buckets.clear()
                break

            next_allowed[room_key] = time.time() + MIN_INTERVAL_PER_ROOM
            sent_any = True

        if not sent_any:
            # No room is eligible right now; let polling loop continue later
            break

    return {
        "collection": collection_name,
        "sent": sent_count,
        "failed": failed_count,
        "skipped": skipped_count,
    }


def run_sender():
    # Health check
    try:
        requests.get(HEALTH_URL, timeout=5)
    except Exception:
        print(f"Backend not reachable at {HEALTH_URL}")
        return

    db, client = get_db()

    ''' print("=" * 60)
        print("  MONGODB CONTINUOUS SENDER - Dynamic Collections")
        print("=" * 60)
        print(f"  Database   : {DB_NAME}")
        print(f"  Pipeline   : {PIPELINE_URL}")
        print(f"  Poll       : every {POLL_INTERVAL} seconds")
        print(f"  Min/room   : {MIN_INTERVAL_PER_ROOM} seconds between sends per room")
        print(f"  Batch limit: {BATCH_LIMIT} docs per collection per scan")
        print("=" * 60)'''

    # next_allowed send time per (building_id, room_id)
    next_allowed = {}

    try:
        while True:
            did_work = False
            collections = get_dynamic_collections(db)

            for cname in collections:
                summary = process_collection_batch(db, cname, next_allowed)
                if summary is None:
                    continue

                did_work = True
                sent = summary["sent"]
                failed = summary["failed"]
                skipped = summary["skipped"]

                if failed > 0:
                    print(f"{cname}: batch summary -> processed={sent}, failed={failed}, skipped={skipped}")
                else:
                    print(f"{cname}: batch summary -> processed={sent}, skipped={skipped}")

            time.sleep(POLL_INTERVAL if not did_work else POLL_INTERVAL)

    except KeyboardInterrupt:
        print("Stopping sender (Ctrl+C).")
    finally:
        client.close()


if __name__ == "__main__":
    run_sender()
