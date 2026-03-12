from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.server_api import ServerApi
from dotenv import load_dotenv
import os
import pandas as pd
import threading
import time
from datetime import datetime, timedelta

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
# Historical logging
#
# Stores validated pipeline records in a long-term history collection.
# This does NOT affect the main collections used by availability.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Collections to skip when querying building data
# ---------------------------------------------------------------------------
SKIP_COLLECTIONS = {"historical_logs", "room_occupancy", "OccupancyInfo"}


def _building_collections():
    """Return list of collection names that contain building occupancy data."""
    return [c for c in db.list_collection_names() if c not in SKIP_COLLECTIONS]


# ---------------------------------------------------------------------------
# Date range endpoint
# Returns the earliest and latest timestamp across all building collections
# so the frontend can default the end date to real data, not today.
# GET /trends/date-range
# ---------------------------------------------------------------------------
@app.route("/trends/date-range")
def trends_date_range():
    try:
        overall_earliest = None
        overall_latest   = None
        for cname in _building_collections():
            col = db[cname]
            latest_doc = col.find_one(
                {"timestamp_iso": {"$exists": True, "$ne": None}},
                {"_id": 0, "timestamp_iso": 1},
                sort=[("timestamp_iso", -1)],
            )
            earliest_doc = col.find_one(
                {"timestamp_iso": {"$exists": True, "$ne": None}},
                {"_id": 0, "timestamp_iso": 1},
                sort=[("timestamp_iso", 1)],
            )
            if latest_doc:
                ts = latest_doc["timestamp_iso"][:10]
                if overall_latest is None or ts > overall_latest:
                    overall_latest = ts
            if earliest_doc:
                ts = earliest_doc["timestamp_iso"][:10]
                if overall_earliest is None or ts < overall_earliest:
                    overall_earliest = ts
        return jsonify({"earliest": overall_earliest, "latest": overall_latest}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Trends endpoint
#
# Queries the building collections DIRECTLY — no backfill, no intermediate
# collection. Each building collection is queried in a parallel thread so
# all buildings return at the same time.
#
# Query params:
#   end_date -- YYYY-MM-DD (defaults to latest date in data)
#   building -- collection name e.g. "StudentLearningCenter" (optional)
#              if omitted, all buildings are aggregated together
# ---------------------------------------------------------------------------
@app.route("/trends")
def trends():
    try:
        building_id  = request.args.get("building")
        end_date_str = request.args.get("end_date")

        if end_date_str:
            try:
                end_dt = datetime.strptime(end_date_str, "%Y-%m-%d")
            except ValueError:
                end_dt = datetime.utcnow()
        else:
            end_dt = datetime.utcnow()

        start_dt     = end_dt - timedelta(days=90)
        cutoff_start = start_dt.strftime("%Y-%m-%dT00:00:00")
        cutoff_end   = end_dt.strftime("%Y-%m-%dT23:59:59")

        # Decide which collections to query
        if building_id:
            cnames = [building_id]
        else:
            cnames = _building_collections()

        # Query each collection in parallel
        all_docs = []
        lock = threading.Lock()

        def _query_collection(cname):
            try:
                docs = list(db[cname].find(
                    {
                        "validated":     {"$in": [True, 1, "true"]},
                        "timestamp_iso": {"$gte": cutoff_start, "$lte": cutoff_end},
                    },
                    {"_id": 0, "occupied": 1, "booking_duration": 1, "timestamp_iso": 1}
                ))
                # Tag each doc with building name so we can filter later if needed
                for doc in docs:
                    doc["building_id"] = cname
                with lock:
                    all_docs.extend(docs)
            except Exception as e:
                print(f"[trends] Error querying {cname}: {e}")

        threads = [threading.Thread(target=_query_collection, args=(c,)) for c in cnames]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        if not all_docs:
            return jsonify([])

        df = pd.DataFrame(all_docs)
        df["occupied"] = pd.to_numeric(df["occupied"], errors="coerce")
        if "booking_duration" in df.columns:
            df["booking_duration"] = pd.to_numeric(df["booking_duration"], errors="coerce")
        else:
            df["booking_duration"] = None

        df["ts"] = pd.to_datetime(df["timestamp_iso"], errors="coerce")
        df = df.dropna(subset=["ts", "occupied"])
        df = df[(df["ts"] >= pd.Timestamp(start_dt)) & (df["ts"] <= pd.Timestamp(end_dt))]

        if df.empty:
            return jsonify([])

        df["month"] = df["ts"].dt.to_period("M").astype(str)
        grouped = (
            df.groupby("month")
            .agg(avg_occupancy=("occupied", "mean"),
                 total_records=("occupied", "count"),
                 avg_duration_h=("booking_duration", "mean"))
            .reset_index().sort_values("month")
        )

        return jsonify([{
            "month":          row["month"],
            "avg_occupancy":  None if pd.isna(row["avg_occupancy"])  else round(float(row["avg_occupancy"]),  4),
            "total_records":  int(row["total_records"]),
            "avg_duration_h": None if pd.isna(row["avg_duration_h"]) else round(float(row["avg_duration_h"]), 2),
        } for _, row in grouped.iterrows()])

    except Exception as e:
        print(f"[trends] Error: {e}")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Room insights endpoint
#
# For a given building + list of room_ids + hour, returns historical
# occupancy stats so the frontend can show "usually empty at this time".
#
# GET /room-insights/<collection_name>
#   hour     -- 0-23 (the hour to analyse, e.g. 9 for 9:00)
#   day      -- 0-6  (weekday: 0=Mon … 6=Sun)
#   rooms    -- comma-separated room_ids e.g. "R09,R11,R16"
# ---------------------------------------------------------------------------
@app.route("/room-insights/<collection_name>")
def room_insights(collection_name):
    try:
        col      = db[collection_name]
        hour     = int(request.args.get("hour",  9))
        day      = int(request.args.get("day",   0))
        rooms_qs = request.args.get("rooms", "")
        room_ids = [r.strip() for r in rooms_qs.split(",") if r.strip()]

        if not room_ids:
            return jsonify({}), 200

        # Anchor the 90-day window to the latest timestamp in this collection
        # so it always covers real data regardless of when the server is running.
        latest_doc = col.find_one(
            {"timestamp_iso": {"$exists": True, "$ne": None}},
            {"_id": 0, "timestamp_iso": 1},
            sort=[("timestamp_iso", -1)],
        )
        if latest_doc:
            end_dt = datetime.strptime(latest_doc["timestamp_iso"][:10], "%Y-%m-%d")
        else:
            end_dt = datetime.utcnow()
        start_dt = end_dt - timedelta(days=90)
        cutoff   = start_dt.strftime("%Y-%m-%dT00:00:00")

        docs = list(col.find(
            {
                "validated":     {"$in": [True, 1, "true"]},
                "room_id":       {"$in": room_ids},
                "timestamp_iso": {"$gte": cutoff},
            },
            {"_id": 0, "room_id": 1, "occupied": 1, "timestamp_iso": 1}
        ))

        if not docs:
            return jsonify({}), 200

        df = pd.DataFrame(docs)
        df["ts"]       = pd.to_datetime(df["timestamp_iso"], errors="coerce")
        df["occupied"] = pd.to_numeric(df["occupied"], errors="coerce")
        df = df.dropna(subset=["ts", "occupied"])

        result = {}
        for room_id, grp in df.groupby("room_id"):
            # Records matching this weekday and hour (±1 hour window)
            same_slot = grp[
                (grp["ts"].dt.weekday == day) &
                (grp["ts"].dt.hour.between(max(0, hour - 1), min(23, hour + 1)))
            ]
            if same_slot.empty:
                result[room_id] = {"label": "No historical data", "pct": None}
                continue

            pct_occupied = same_slot["occupied"].mean()  # 0.0 – 1.0
            total        = len(same_slot)

            if pct_occupied < 0.20:
                label = "Usually empty at this time"
                color = "#15803D"
            elif pct_occupied < 0.50:
                label = "Often available at this time"
                color = "#65A30D"
            elif pct_occupied < 0.75:
                label = "Sometimes busy at this time"
                color = "#D97706"
            else:
                label = "Usually busy at this time"
                color = "#DC2626"

            result[room_id] = {
                "label": label,
                "color": color,
                "pct":   round(float(pct_occupied) * 100, 1),
                "samples": total,
            }

        return jsonify(result), 200

    except Exception as e:
        print(f"[room-insights] Error: {e}")
        return jsonify({"error": str(e)}), 500


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