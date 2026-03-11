from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.server_api import ServerApi
from dotenv import load_dotenv
import os
import pandas as pd
import threading
import time

# ML imports -- used by train_model when sensor columns are present
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline as SklearnPipeline

# Pipeline imports (data transmission layer)
from pipeline.transmission_pipeline import (
    validate_update,
    process_update,
    check_fallback,
    get_room,
    tracked_rooms_count,
)
from db_send_pipeline_mongo import run_sender as run_db_sender

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI not set in .env")

app = Flask(__name__)
CORS(app)

client = MongoClient(MONGO_URI, server_api=ServerApi("1"))
db = client["OccupancyData"]

print("Connected to MongoDB Atlas!")

# ---------------------------------------------------------------------------
# Sensor feature columns required for logistic regression.
# train_model checks for these before attempting to fit.
# ---------------------------------------------------------------------------
SENSOR_FEATURES = [
    "temperature_c",
    "co2_ppm",
    "humidity_ratio",
    "light_lux",
    "relative_humidity",
]


# ---------------------------------------------------------------------------
# Model training
#
# Trains a logistic regression model on validated records from the given
# collection. Not called from the availability endpoint -- kept here for
# historical logging when that is added.
#
# If all sensor columns are present, the model fits and writes predictions
# into a 'predicted' column. If any sensor column is missing, 'occupied'
# is copied into 'predicted' directly so the output shape stays the same.
# Returns None if the collection does not exist or has no validated records.
# ---------------------------------------------------------------------------
def train_model(collection_name):
    if collection_name not in db.list_collection_names():
        return None

    collection = db[collection_name]

    # Only train on records that passed pipeline validation
    data = list(collection.find({"validated": True}, {"_id": 0}))
    if not data:
        return None

    df = pd.DataFrame(data)

    if "occupied" not in df.columns:
        return None

    df["occupied"] = pd.to_numeric(df["occupied"], errors="coerce")
    df = df.dropna(subset=["occupied"])

    if df.empty:
        return None

    # Break timestamp_iso into date and time columns for filtering later
    if "timestamp_iso" in df.columns:
        df["timestamp_parsed"] = pd.to_datetime(df["timestamp_iso"], errors="coerce")
        df["date_str"] = df["timestamp_parsed"].dt.strftime("%Y-%m-%d")
        df["time_str"] = df["timestamp_parsed"].dt.strftime("%H:%M")

    # Confirm all sensor columns exist and contain at least some numeric data
    available_features = [
        col for col in SENSOR_FEATURES
        if col in df.columns
        and pd.to_numeric(df[col], errors="coerce").notna().any()
    ]

    use_model = len(available_features) == len(SENSOR_FEATURES)

    if use_model:
        # Sensor data is present -- run logistic regression
        for col in available_features:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df = df.dropna(subset=available_features)

        X = df[available_features]
        y = df["occupied"]

        if len(set(y)) < 2:
            # Only one occupancy class in the data -- model cannot fit
            df["predicted"] = y
            print(f"[train_model] Single class in '{collection_name}' "
                  f"-- skipping fit, using raw occupied.")
        else:
            model = SklearnPipeline([
                ("scaler", StandardScaler()),
                ("clf", LogisticRegression()),
            ])
            model.fit(X, y)
            df["predicted"] = model.predict(X)
            print(f"[train_model] Model trained on '{collection_name}' "
                  f"({len(df)} records).")
    else:
        # Sensor columns not available -- use raw occupied as the prediction
        missing = [col for col in SENSOR_FEATURES if col not in df.columns]
        print(f"[train_model] Sensor columns missing ({missing}) "
              f"-- using raw 'occupied' as prediction.")
        df["predicted"] = df["occupied"]

    return df


# ---------------------------------------------------------------------------
# Availability endpoint
#
# Uses a direct MongoDB query -- the same approach that was confirmed working.
# train_model is intentionally NOT called here to avoid pandas type
# serialization issues (numpy.int64 etc.) breaking the JSON response.
#
# When historical logging is added, train_model will be called from a
# separate /history endpoint, not from here.
# ---------------------------------------------------------------------------
@app.route("/availability/<collection_name>")
def availability(collection_name):
    try:
        collection = db[collection_name]

        target_date  = request.args.get("date")   # YYYY-MM-DD
        target_time  = request.args.get("time")   # HH:MM
        target_floor = request.args.get("floor")  # "F1", "F2", etc.

        query = {"validated": True}

        # Filter by date using a regex match on the timestamp_iso string
        if target_date:
            query["timestamp_iso"] = {"$regex": f"^{target_date}"}

        docs = list(collection.find(query, {"_id": 0}))
        results = []

        for doc in docs:
            # Floor filter applied here since it is faster than a regex in Mongo
            if target_floor and doc.get("floor_id") != target_floor:
                continue

            # Time filter matches a substring of the timestamp_iso string
            if target_time and target_time not in doc.get("timestamp_iso", ""):
                continue

            # Convert booking_duration (fractional hours) to whole minutes
            if "booking_duration" in doc and doc["booking_duration"] is not None:
                doc["duration"] = int(doc["booking_duration"] * 60)
            else:
                doc["duration"] = None

            results.append(doc)

        return jsonify(results)

    except Exception as e:
        print(f"[availability] Error: {e}")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Occupancy read endpoint (in-memory, from pipeline)
# ---------------------------------------------------------------------------
@app.route("/occupancy/<building_id>/<room_id>", methods=["GET"])
def occupancy_read(building_id, room_id):
    info = get_room(building_id, room_id)
    if info is None:
        return jsonify({"error": "No data available"}), 404
    return jsonify(info), 200


# ---------------------------------------------------------------------------
# Health endpoint (used by sender)
# ---------------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "tracked_rooms": tracked_rooms_count()}), 200


# ---------------------------------------------------------------------------
# Pipeline ingestion endpoint (used by sender)
# ---------------------------------------------------------------------------
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

    # Duplicate or out-of-order records are a warning, not a hard failure
    if isinstance(result, dict) and "error" in result:
        return jsonify({"warning": result["error"]}), 200

    return jsonify(result), 200


# ---------------------------------------------------------------------------
# Home route
# ---------------------------------------------------------------------------
@app.route("/")
def home():
    return "Backend Running"


# ---------------------------------------------------------------------------
# Background fallback monitor -- checks for stale pipeline updates every second
# ---------------------------------------------------------------------------
def fallback_monitor():
    while True:
        check_fallback()
        time.sleep(1)


# ---------------------------------------------------------------------------
# Optional auto-start DB sender inside the Flask process.
# Controlled by AUTO_START_SENDER=true in .env
# ---------------------------------------------------------------------------
def start_sender_if_enabled():
    flag = os.getenv("AUTO_START_SENDER", "false").lower()
    if flag == "true":
        t = threading.Thread(target=run_db_sender, daemon=True)
        t.start()
        print("AUTO_START_SENDER enabled: sender thread started.")
    else:
        print("AUTO_START_SENDER disabled: sender not started.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Start background fallback monitor thread
    t = threading.Thread(target=fallback_monitor, daemon=True)
    t.start()

    # Optionally start the DB sender in this process
    start_sender_if_enabled()

    # use_reloader=False prevents Flask from spawning duplicate threads
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=False, threaded=True)