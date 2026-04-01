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

SKIP_COLLECTIONS = {"historical_logs", "room_occupancy", "OccupancyInfo"}

def building_collections():
    return [c for c in db.list_collection_names() if c not in SKIP_COLLECTIONS]

# ----------------------------------------------------
# Date Range
# ----------------------------------------------------

@app.route("/trends/date-range")
def trends_date_range():
    earliest = None
    latest = None

    for cname in building_collections():
        doc_min = db[cname].find_one(
            {"timestamp_iso": {"$exists": True}},
            {"timestamp_iso": 1},
            sort=[("timestamp_iso", 1)]
        )
        if doc_min:
            d = doc_min["timestamp_iso"][:10]
            if earliest is None or d < earliest:
                earliest = d

        doc_max = db[cname].find_one(
            {"timestamp_iso": {"$exists": True}},
            {"timestamp_iso": 1},
            sort=[("timestamp_iso", -1)]
        )
        if doc_max:
            d = doc_max["timestamp_iso"][:10]
            if latest is None or d > latest:
                latest = d

    return jsonify({"earliest": earliest, "latest": latest})

# ----------------------------------------------------
# Historical Logs
# ----------------------------------------------------

@app.route("/trends")
def trends():
    try:
        building = request.args.get("building")
        end_date = request.args.get("end_date")

        if end_date:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        else:
            end_dt = datetime.utcnow()

        start_dt = end_dt - timedelta(days=90)
        collections = [building] if building and building != "ALL" else building_collections()
        results = []

        pipeline = [
            {"$addFields": {"ts": {"$dateFromString": {"dateString": "$timestamp_iso"}}}},
            {"$match": {"ts": {"$gte": start_dt, "$lte": end_dt}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$ts"}},
                "avg_occupancy": {"$avg": "$occupied"},
                "total_records": {"$sum": 1},
                "avg_duration_h": {"$avg": "$booking_duration"}
            }},
            {"$sort": {"_id": 1}}
        ]

        for cname in collections:
            data = list(db[cname].aggregate(pipeline))
            for row in data:
                results.append({
                    "month": row["_id"],
                    "avg_occupancy": round(row["avg_occupancy"], 4) if row.get("avg_occupancy") else None,
                    "total_records": int(row["total_records"]),
                    "avg_duration_h": round(row["avg_duration_h"], 2) if row.get("avg_duration_h") else None
                })

        return jsonify(results)

    except Exception as e:
        print("Trends error:", e)
        return jsonify({"error": str(e)})

# ----------------------------------------------------
# Availability Endpoint
# ----------------------------------------------------

@app.route("/availability/<building>")
def availability(building):
    try:
        date = request.args.get("date")
        time = request.args.get("time")
        floor = request.args.get("floor")

        if building == "ALL":
            target_collections = building_collections()
        else:
            if building not in db.list_collection_names():
                return jsonify([])
            target_collections = [building]

        query = {}
        if date:
            query["timestamp_iso"] = {"$regex": f"^{date}"}
        if floor:
            query["floor_id"] = floor

        results = []
        for col_name in target_collections:
            docs = list(db[col_name].find(query, {"_id": 0}))
            for doc in docs:
                ts = doc.get("timestamp_iso", "")
                if time and time not in ts:
                    continue
                if "building" not in doc:
                    doc["building"] = col_name
                results.append(doc)

        return jsonify(results)

    except Exception as e:
        print("Availability error:", e)
        return jsonify({"error": str(e)})

# ----------------------------------------------------
# Room Insights
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

        latest_doc = col.find_one(
            {"timestamp_iso": {"$exists": True, "$ne": None}},
            {"timestamp_iso": 1},
            sort=[("timestamp_iso", -1)],
        )
        if latest_doc:
            end_dt = datetime.strptime(latest_doc["timestamp_iso"][:10], "%Y-%m-%d")
        else:
            end_dt = datetime.utcnow()
        start_dt = end_dt - timedelta(days=90)
        cutoff = start_dt.strftime("%Y-%m-%dT00:00:00")

        docs = list(col.find(
            {"room_id": {"$in": room_ids}, "timestamp_iso": {"$gte": cutoff}},
            {"_id": 0, "room_id": 1, "occupied": 1, "timestamp_iso": 1}
        ))

        if not docs:
            return jsonify({})

        df = pd.DataFrame(docs)
        df["ts"] = pd.to_datetime(df["timestamp_iso"], errors="coerce")
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

            if pct < 0.2: label, color = "Usually empty", "#15803D"
            elif pct < 0.5: label, color = "Often available", "#65A30D"
            elif pct < 0.75: label, color = "Sometimes busy", "#D97706"
            else: label, color = "Usually busy", "#DC2626"

            result[full_room] = {
                "label": label,
                "color": color,
                "pct": round(float(pct) * 100, 1),
                "samples": int(len(same_slot))
            }

        return jsonify(result)

    except Exception as e:
        print("Room insights error:", e)
        return jsonify({"error": str(e)})

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

@app.route("/book", methods=["POST"])
def book_room():
    try:
        data = request.json
        building = data.get("building")
        room_id = data.get("room_id")
        timestamp = data.get("timestamp_iso")

        if not building or not room_id:
            return jsonify({"error": "Missing data"}), 400

        db[building].update_one(
            {"room_id": room_id, "timestamp_iso": timestamp},
            {"$set": {"occupied": 1, "booking_duration": 1}}
        )

        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)})

# ----------------------------------------------------
# Execution
# ----------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5000)),
        debug=False
    )
