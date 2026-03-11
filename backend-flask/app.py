from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.server_api import ServerApi
from dotenv import load_dotenv
import os
import threading
import time

# Pipeline imports (your pipeline section — keep these)
from pipeline.transmission_pipeline import (
    validate_update,
    process_update,
    check_fallback,
    get_room,
    tracked_rooms_count,
)
from db_send_pipeline_mongo import run_sender as run_db_sender

# ----------------------
# Setup
# ----------------------
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI not set in .env")

app = Flask(__name__)
CORS(app)

client = MongoClient(MONGO_URI, server_api=ServerApi("1"))
db = client["OccupancyData"]

print("Connected to MongoDB Atlas!")

# ----------------------
# Availability endpoint (updated — no ML, direct DB query)
# ----------------------
@app.route("/availability/<collection_name>")
def availability(collection_name):
    try:
        collection = db[collection_name]

        # Get query params
        target_date = request.args.get("date")   # YYYY-MM-DD
        target_time = request.args.get("time")   # HH:MM
        target_floor = request.args.get("floor") # "F1", "F2", etc.

        query = {}

        # Filter by date using regex on timestamp_iso
        if target_date:
            query["timestamp_iso"] = {"$regex": f"^{target_date}"}

        # Only return validated documents
        query["validated"] = True

        docs = list(collection.find(query, {"_id": 0}))

        results = []

        for doc in docs:
            # Floor filter
            if target_floor and doc.get("floor_id") != target_floor:
                continue

            # Time filter (matches substring of timestamp_iso)
            if target_time and target_time not in doc.get("timestamp_iso", ""):
                continue

            # Convert booking_duration to minutes for frontend
            if "booking_duration" in doc and doc["booking_duration"] is not None:
                doc["duration"] = int(doc["booking_duration"] * 60)
            else:
                doc["duration"] = None

            results.append(doc)

        return jsonify(results)

    except Exception as e:
        print("Error:", e)
        return jsonify({"error": str(e)}), 500


# ----------------------
# Occupancy read endpoint (in-memory, from pipeline)
# ----------------------
@app.route("/occupancy/<building_id>/<room_id>", methods=["GET"])
def occupancy_read(building_id, room_id):
    info = get_room(building_id, room_id)
    if info is None:
        return jsonify({"error": "No data available"}), 404
    return jsonify(info), 200


# ----------------------
# Health endpoint (used by sender)
# ----------------------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "tracked_rooms": tracked_rooms_count()}), 200


# ----------------------
# Pipeline ingestion endpoint (used by sender)
# ----------------------
@app.route("/occupancy/update", methods=["POST"])
def occupancy_update():
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Invalid JSON"}), 400

    err = validate_update(data)
    if err:
        return jsonify({"error": err}), 400

    try:
        result = process_update(data)
    except Exception as e:
        return jsonify({"error": f"{type(e).__name__}: {e}"}), 500

    # Duplicate/out-of-order should be a warning (HTTP 200), not a hard failure
    if isinstance(result, dict) and "error" in result:
        return jsonify({"warning": result["error"]}), 200

    return jsonify(result), 200


# ----------------------
# Home route
# ----------------------
@app.route("/")
def home():
    return "Backend Running"


# ----------------------
# Background fallback monitor (your pipeline section)
# ----------------------
def fallback_monitor():
    while True:
        check_fallback()
        time.sleep(1)


# ----------------------
# Optional auto-start sender inside Flask process
# ----------------------
def start_sender_if_enabled():
    flag = os.getenv("AUTO_START_SENDER", "false").lower()
    if flag == "true":
        t = threading.Thread(target=run_db_sender, daemon=True)
        t.start()
        print("AUTO_START_SENDER enabled: sender thread started")
    else:
        print("AUTO_START_SENDER disabled: sender not started")


# ----------------------
# Run App
# ----------------------
if __name__ == "__main__":
    # Start fallback monitor thread
    t = threading.Thread(target=fallback_monitor, daemon=True)
    t.start()

    # Optional: auto-start the DB sender
    start_sender_if_enabled()

    # use_reloader=False prevents Flask from starting twice
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=False, threaded=True)