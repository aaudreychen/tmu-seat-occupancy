from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.server_api import ServerApi
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta
import urllib.parse
import pandas as pd
from flask_compress import Compress

# ----------------------------------------------------
# Setup & Configuration
# ----------------------------------------------------
load_dotenv()

app = Flask(__name__)
Compress(app)
CORS(app)

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI not set in .env file")

client = MongoClient(MONGO_URI, server_api=ServerApi("1"))
db = client["OccupancyData"]

print("Connected to MongoDB Atlas")

# ----------------------------------------------------
# Helper functions
# ----------------------------------------------------

SKIP_COLLECTIONS = {
    "historical_logs",
    "room_occupancy",
    "OccupancyInfo",
    "occupancy_data",
    "trends"
}

def building_collections():
    """Returns only the valid building collection names."""
    return [c for c in db.list_collection_names() if c not in SKIP_COLLECTIONS]

def parse_date_time_range(date_str=None, time_str=None):
    """
    Builds a MongoDB datetime range query using the indexed 'timestamp' field.
    - If date and time are given: one 30-minute slot
    - If only date is given: whole day
    - If neither is given: no timestamp filter
    """
    if date_str and time_str:
        start_dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
        end_dt = start_dt + timedelta(minutes=30)
        return {"$gte": start_dt, "$lt": end_dt}

    if date_str:
        start_dt = datetime.strptime(date_str, "%Y-%m-%d")
        end_dt = start_dt + timedelta(days=1)
        return {"$gte": start_dt, "$lt": end_dt}

    return None

# ----------------------------------------------------
# Date Range (Used by Frontend Calendar)
# ----------------------------------------------------

@app.route("/trends/date-range")
def trends_date_range():
    earliest = None
    latest = None

    for cname in building_collections():
        # earliest timestamp
        doc_min = db[cname].find_one(
            {"timestamp": {"$exists": True}},
            {"timestamp": 1},
            sort=[("timestamp", 1)]
        )
        if doc_min and doc_min.get("timestamp"):
            d = doc_min["timestamp"].strftime("%Y-%m-%d")
            if earliest is None or d < earliest:
                earliest = d

        # latest timestamp
        doc_max = db[cname].find_one(
            {"timestamp": {"$exists": True}},
            {"timestamp": 1},
            sort=[("timestamp", -1)]
        )
        if doc_max and doc_max.get("timestamp"):
            d = doc_max["timestamp"].strftime("%Y-%m-%d")
            if latest is None or d > latest:
                latest = d

    return jsonify({
        "earliest": earliest,
        "latest": latest
    })

# ----------------------------------------------------
# Historical Logs (Aggregated Trends)
# ----------------------------------------------------

@app.route("/trends")
def trends():
    try:
        building = request.args.get("building")
        end_date = request.args.get("end_date")

        if end_date:
            # include full selected date
            end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        else:
            end_dt = datetime.utcnow()

        start_dt = end_dt - timedelta(days=90)

        collections = [building] if building and building != "ALL" else building_collections()
        results = []

        pipeline = [
            {
                "$match": {
                    "timestamp": {
                        "$gte": start_dt,
                        "$lt": end_dt
                    }
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": "%Y-%m",
                            "date": "$timestamp"
                        }
                    },
                    "avg_occupancy": {"$avg": "$occupied"},
                    "total_records": {"$sum": 1},
                    "avg_duration_h": {"$avg": "$booking_duration"}
                }
            },
            {"$sort": {"_id": 1}}
        ]

        for cname in collections:
            data = list(db[cname].aggregate(pipeline))
            for row in data:
                results.append({
                    "month": row["_id"],
                    "avg_occupancy": round(row["avg_occupancy"], 4) if row.get("avg_occupancy") is not None else None,
                    "total_records": int(row["total_records"]),
                    "avg_duration_h": round(row["avg_duration_h"], 2) if row.get("avg_duration_h") is not None else None
                })

        return jsonify(results)

    except Exception as e:
        print("Trends error:", e)
        return jsonify({"error": str(e)}), 500

# ----------------------------------------------------
# Availability Endpoint
# ----------------------------------------------------

@app.route("/availability/<building>")
def availability(building):
    try:
        date = request.args.get("date")
        time = request.args.get("time")
        floor = request.args.get("floor")

        # support ALL building request for map
        if building == "ALL":
            target_collections = building_collections()
        else:
            if building not in db.list_collection_names():
                return jsonify([])
            target_collections = [building]

        query = {}

        ts_range = parse_date_time_range(date, time)
        if ts_range:
            query["timestamp"] = ts_range

        if floor:
            query["floor_id"] = floor

        projection = {
            "_id": 0,
            "timestamp_iso": 1,   # keep for frontend display
            "timestamp": 1,
            "academic_phase": 1,
            "is_weekend": 1,
            "occupied": 1,
            "booking_duration": 1,
            "is_booked": 1,
            "booking_source": 1,
            "building_id": 1,
            "floor_id": 1,
            "room_id": 1,
            "full_room_id": 1,
            "capacity": 1,
            "sent": 1,
            "validated": 1,
            "validation_reason": 1
        }

        results = []

        for col_name in target_collections:
            docs = list(db[col_name].find(query, projection))

            for doc in docs:
                if "building" not in doc:
                    doc["building"] = col_name
                results.append(doc)

        return jsonify(results)

    except Exception as e:
        print("Availability error:", e)
        return jsonify({"error": str(e)}), 500

# ----------------------------------------------------
# Room Insights (Historical Predictions)
# ----------------------------------------------------

@app.route("/room-insights/<building>")
def room_insights(building):
    try:
        if building not in db.list_collection_names():
            return jsonify({})

        col = db[building]
        hour = int(request.args.get("hour", datetime.now().hour))
        day = int(request.args.get("day", datetime.now().weekday()))

        rooms_raw = request.args.get("rooms", "")
        rooms = [r for r in urllib.parse.unquote(rooms_raw).split(",") if r.strip()]

        if not rooms:
            return jsonify({})

        room_ids = [r.split("-")[-1] for r in rooms]
        ninety_days_ago = datetime.now() - timedelta(days=90)

        docs = list(col.find(
            {
                "room_id": {"$in": room_ids},
                "timestamp": {"$gte": ninety_days_ago}
            },
            {
                "_id": 0,
                "room_id": 1,
                "occupied": 1,
                "timestamp": 1,
                "timestamp_iso": 1
            }
        ))

        if not docs:
            return jsonify({})

        df = pd.DataFrame(docs)
        df["ts"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df["occupied"] = pd.to_numeric(df["occupied"], errors="coerce")
        df = df.dropna(subset=["ts", "occupied"])

        result = {}

        for full_room in rooms:
            rid = full_room.split("-")[-1]
            grp = df[df["room_id"] == rid]

            if grp.empty:
                result[full_room] = {"label": "No historical data", "pct": None}
                continue

            same_slot = grp[
                (grp["ts"].dt.weekday == day) &
                (grp["ts"].dt.hour.between(max(0, hour - 1), min(23, hour + 1)))
            ]

            if same_slot.empty:
                result[full_room] = {"label": "No historical data", "pct": None}
                continue

            pct = same_slot["occupied"].mean()

            if pct < 0.2:
                label, color = "Usually empty", "#15803D"
            elif pct < 0.5:
                label, color = "Often available", "#65A30D"
            elif pct < 0.75:
                label, color = "Sometimes busy", "#D97706"
            else:
                label, color = "Usually busy", "#DC2626"

            result[full_room] = {
                "label": label,
                "color": color,
                "pct": round(float(pct) * 100, 1),
                "samples": int(len(same_slot))
            }

        return jsonify(result)

    except Exception as e:
        print("Room insights error:", e)
        return jsonify({"error": str(e)}), 500

# ----------------------------------------------------
# Health Check
# ----------------------------------------------------

@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "database": "OccupancyData",
        "collections": building_collections()
    })

# ----------------------------------------------------
# Booking Endpoint
# ----------------------------------------------------

@app.route("/book", methods=["POST"])
def book_room():
    try:
        data = request.json or {}

        building = data.get("building")
        room_id = data.get("room_id")
        floor_id = data.get("floor_id")
        full_room_id = data.get("full_room_id")
        timestamp_iso = data.get("timestamp_iso")

        if not building or not timestamp_iso:
            return jsonify({"error": "Missing data"}), 400

        ts = datetime.strptime(timestamp_iso, "%Y-%m-%d %H:%M")

        query = {
            "timestamp": ts,
            "occupied": 0
        }

        if full_room_id:
            query["full_room_id"] = full_room_id
        else:
            if not room_id or not floor_id:
                return jsonify({"error": "Missing room identifier"}), 400
            query["room_id"] = room_id
            query["floor_id"] = floor_id

        result = db[building].update_one(
            query,
            {
                "$set": {
                    "occupied": 1,
                    "booking_duration": 1,
                    "is_booked": True,
                    "booking_source": "app"
                }
            }
        )

        if result.matched_count == 0:
            return jsonify({"error": "No matching room/time found"}), 404

        return jsonify({"status": "success"})

    except Exception as e:
        print("Booking error:", e)
        return jsonify({"error": str(e)}), 500
# ----------------------------------------------------
# Execution
# ----------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )