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
import random
import requests
from datetime import datetime
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

# -----------------------------
# Configuration
# -----------------------------
PIPELINE_URL = "http://127.0.0.1:5000/occupancy/update"
HEALTH_URL = "http://127.0.0.1:5000/health"

DB_NAME = "OccupancyData"

POLL_INTERVAL = 2
MIN_SEND_INTERVAL = 2
MAX_SEND_INTERVAL = 3

# Collections that should NOT be processed
EXCLUDED_COLLECTIONS = {"OccupancyInfo", "room_occupancy"}

# -----------------------------
# MongoDB Connection
# -----------------------------
def get_db():
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        raise RuntimeError("MONGO_URI missing in .env")

    client = MongoClient(mongo_uri)
    client.server_info()  # fail fast if auth is wrong
    return client[DB_NAME], client


# -----------------------------
# Stable Sequence ID
# -----------------------------
def objectid_to_sequence(oid: ObjectId) -> int:
    ts_ms = int(oid.generation_time.timestamp() * 1000)
    tail = int.from_bytes(oid.binary[-3:], "big")
    return ts_ms * 16777216 + tail


# -----------------------------
# Normalize Timestamp
# -----------------------------
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


# -----------------------------
# Build Payload
# -----------------------------
def build_payload(doc):
    building_id = doc.get("building_id")
    room_id = doc.get("room_id")

    if not building_id or not room_id:
        return None

    occupancy = int(doc.get("occupied", 0))
    timestamp = normalize_timestamp(doc.get("timestamp_iso"))
    sequence_id = objectid_to_sequence(doc["_id"])

    return {
        "timestamp": timestamp,
        "building_id": building_id,
        "room_id": room_id,
        "occupancy_state": occupancy,
        "source_id": "mongodb_sender",
        "sequence_id": sequence_id
    }


# -----------------------------
# Fetch Unsent Documents
# -----------------------------
def fetch_unsent(collection):
    collection.update_many(
        {"sent": {"$exists": False}},
        {"$set": {"sent": False}}
    )
    return list(collection.find({"sent": False}).sort("_id", 1))


# -----------------------------
# Send to Pipeline
# -----------------------------
def send(payload):
    try:
        response = requests.post(PIPELINE_URL, json=payload, timeout=10)
        data = response.json()
        message = data.get("status") or data.get("error") or ""
        return response.status_code == 200, message
    except Exception as e:
        return False, str(e)


# -----------------------------
# Main Loop
# -----------------------------
def run_sender():

    print("MongoDB Continuous Sender Started")

    # Check backend health
    try:
        requests.get(HEALTH_URL, timeout=5)
    except:
        print("Backend not running on port 5000")
        return

    db, client = get_db()
    print("Connected to MongoDB")

    try:
        while True:

            collections = [
                name for name in db.list_collection_names()
                if not name.startswith("system.")
                and name not in EXCLUDED_COLLECTIONS
            ]

            for name in collections:

                collection = db[name]
                docs = fetch_unsent(collection)

                if docs:
                    print(f"{name}: Found {len(docs)} unsent documents")

                for doc in docs:

                    payload = build_payload(doc)
                    if payload is None:
                        continue

                    ok, msg = send(payload)

                    if ok:
                        collection.update_one(
                            {"_id": doc["_id"]},
                            {"$set": {"sent": True}}
                        )
                        print(
                            f"  SENT {payload['building_id']}/"
                            f"{payload['room_id']} -> {msg}"
                        )
                    else:
                        print(
                            f"  FAILED {payload['building_id']}/"
                            f"{payload['room_id']} -> {msg}"
                        )
                        break

                    time.sleep(random.uniform(MIN_SEND_INTERVAL, MAX_SEND_INTERVAL))

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print("Stopping sender")

    finally:
        client.close()


if __name__ == "__main__":
    run_sender()