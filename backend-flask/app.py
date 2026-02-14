from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from dotenv import load_dotenv
import os
import pandas as pd
from datetime import datetime
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# Pipeline imports
from pipeline.transmission_pipeline import (
    validate_update,
    process_update,
    check_fallback,
    get_room,
    tracked_rooms_count,
)

import threading
import time
from db_send_pipeline_mongo import run_sender as run_db_sender

# ----------------------
# Setup
# ----------------------
load_dotenv()
app = Flask(__name__)
CORS(app)

mongo_uri = os.getenv("MONGO_URI")
if not mongo_uri:
    raise RuntimeError("MONGO_URI is not set in .env")

client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
client.server_info()  # force real connection now (fails fast if wrong)
db = client["OccupancyData"]

print("Connected to MongoDB Atlas!")

# ----------------------
# Model training
# ----------------------
def train_model(collection_name):
    if collection_name not in db.list_collection_names():
        return None

    collection = db[collection_name]

    # IMPORTANT: only train/predict on validated records
    data = list(collection.find({"validated": True}, {"_id": 0}))
    if not data:
        return None

    df = pd.DataFrame(data)

    required = [
        "temperature_c",
        "co2_ppm",
        "humidity_ratio",
        "light_lux",
        "relative_humidity",
        "occupied",
    ]

    if not all(col in df.columns for col in required):
        return None

    for col in required:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=required)

    X = df[required[:-1]]
    y = df["occupied"]

    if len(set(y)) < 2:
        df["predicted"] = y
        return df

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression())
    ])
    model.fit(X, y)
    df["predicted"] = model.predict(X)

    return df

# ----------------------
# Existing endpoint (used by frontend)
# ----------------------
@app.route("/availability/<collection_name>")
def availability(collection_name):
    try:
        target_date = request.args.get("date")
        target_time = request.args.get("time")
        target_floor = request.args.get("floor")
        people = request.args.get("people")

        df = train_model(collection_name)
        if df is None or df.empty:
            return jsonify([])

        if target_date:
            df = df[df["date_str"] == target_date]

        if target_floor:
            df = df[df["floor_id"] == f"F{target_floor}"]

        if people:
            df["capacity"] = pd.to_numeric(df["capacity"], errors="coerce")
            df = df[df["capacity"] >= int(people)]

        if target_time and not df.empty:
            sel_t = datetime.strptime(target_time, "%I:%M %p").time()

            def in_window(row_t_str):
                try:
                    row_t = datetime.strptime(row_t_str, "%H:%M").time()
                    return sel_t.hour == row_t.hour and sel_t.minute <= row_t.minute < (sel_t.minute + 30)
                except Exception:
                    return False

            df = df[df["time_str"].apply(in_window)]

        formatted = []
        for _, row in df.iterrows():
            raw_t = row.get("time_str")
            disp_t = (
                datetime.strptime(raw_t, "%H:%M").strftime("%I:%M %p").lstrip("0")
                if raw_t else "N/A"
            )

            formatted.append({
                "room_id": row.get("room_id"),
                "floor_id": row.get("floor_id"),
                "capacity": row.get("capacity"),
                "time": disp_t,
                "predicted": int(row.get("predicted", 0))
            })

        return jsonify(formatted)

    except Exception as e:
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

    # duplicate/out-of-order should be a warning (HTTP 200), not a hard failure
    if isinstance(result, dict) and "error" in result:
        return jsonify({"warning": result["error"]}), 200

    return jsonify(result), 200


# ----------------------
# Background fallback monitor
# ----------------------
def fallback_monitor():
    while True:
        check_fallback()
        time.sleep(1)


# ----------------------
# Optional auto-start sender inside Flask process
# ----------------------
def start_sender_if_enabled():
    """
    Optional: start MongoDB sender inside the Flask process.
    Controlled by env var AUTO_START_SENDER=true
    """
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

    # use_reloader=False prevents Flask from starting twice (which would start sender twice)
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=False, threaded=True)
