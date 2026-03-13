from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.server_api import ServerApi
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta
import urllib.parse
# ----------------------------------------------------
# Setup
# ----------------------------------------------------

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise RuntimeError("MONGO_URI not set")

app = Flask(__name__)
CORS(app)

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
# Date Range (used by frontend calendar)
# ----------------------------------------------------

@app.route("/trends/date-range")
def trends_date_range():

    earliest = None
    latest = None

    for cname in building_collections():

        doc = db[cname].find_one(
            {"timestamp_iso": {"$exists": True}},
            {"timestamp_iso": 1},
            sort=[("timestamp_iso", 1)]
        )

        if doc:
            d = doc["timestamp_iso"][:10]
            if earliest is None or d < earliest:
                earliest = d

        doc = db[cname].find_one(
            {"timestamp_iso": {"$exists": True}},
            {"timestamp_iso": 1},
            sort=[("timestamp_iso", -1)]
        )

        if doc:
            d = doc["timestamp_iso"][:10]
            if latest is None or d > latest:
                latest = d

    return jsonify({
        "earliest": earliest,
        "latest": latest
    })


# ----------------------------------------------------
# Historical Logs (LAST 90 DAYS)
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

        collections = [building] if building else building_collections()

        results = []

        pipeline = [

            {
                "$addFields": {
                    "ts": {
                        "$dateFromString": {
                            "dateString": "$timestamp_iso"
                        }
                    }
                }
            },

            {
                "$match": {
                    "ts": {
                        "$gte": start_dt,
                        "$lte": end_dt
                    }
                }
            },

            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": "%Y-%m",
                            "date": "$ts"
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

            col = db[cname]

            data = list(col.aggregate(pipeline))

            for row in data:

                results.append({

                    "month": row["_id"],

                    "avg_occupancy":
                    round(row["avg_occupancy"], 4)
                    if row.get("avg_occupancy") else None,

                    "total_records":
                    int(row["total_records"]),

                    "avg_duration_h":
                    round(row["avg_duration_h"], 2)
                    if row.get("avg_duration_h") else None

                })

        return jsonify(results)

    except Exception as e:

        print("trends error:", e)

        return jsonify({"error": str(e)})


# ----------------------------------------------------
# Availability endpoint
# ----------------------------------------------------

@app.route("/availability/<building>")
def availability(building):

    try:

        if building not in db.list_collection_names():
            return jsonify([])

        date = request.args.get("date")
        time = request.args.get("time")
        floor = request.args.get("floor")

        query = {}

        if date:
            query["timestamp_iso"] = {"$regex": f"^{date}"}

        if floor:
            query["floor_id"] = floor

        docs = list(db[building].find(query, {"_id": 0}))

        results = []

        for doc in docs:

            ts = doc.get("timestamp_iso", "")

            if time and time not in ts:
                continue

            results.append(doc)

        return jsonify(results)

    except Exception as e:

        return jsonify({"error": str(e)})


# ----------------------------------------------------
# Room Insights
# ----------------------------------------------------
@app.route("/room-insights/<building>")
def room_insights(building):

    try:
        import urllib.parse
        import pandas as pd

        if building not in db.list_collection_names():
            return jsonify({})

        col = db[building]

        # hour/day should come from frontend's CURRENT time
        hour = int(request.args.get("hour", datetime.now().hour))
        day = int(request.args.get("day", datetime.now().weekday()))

        rooms = request.args.get("rooms", "")
        rooms = [r for r in urllib.parse.unquote(rooms).split(",") if r.strip()]

        if not rooms:
            return jsonify({})

        room_ids = [r.split("-")[-1] for r in rooms]

        # only load the last 90 days from Mongo first
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
                "timestamp_iso": 1,
                "timestamp": 1
            }
        ))

        if not docs:
            return jsonify({})

        df = pd.DataFrame(docs)

        # use real timestamp field if present, otherwise fall back to timestamp_iso
        if "timestamp" in df.columns:
            df["ts"] = pd.to_datetime(df["timestamp"], errors="coerce")
        else:
            df["ts"] = pd.to_datetime(df["timestamp_iso"], errors="coerce")

        df["occupied"] = pd.to_numeric(df["occupied"], errors="coerce")
        df = df.dropna(subset=["ts", "occupied"])

        if df.empty:
            return jsonify({})

        result = {}

        for full_room in rooms:
            rid = full_room.split("-")[-1]

            grp = df[df["room_id"] == rid]

            if grp.empty:
                result[full_room] = {
                    "label": "No historical data",
                    "pct": None
                }
                continue

            # compare against CURRENT weekday/current hour window
            same_slot = grp[
                (grp["ts"].dt.weekday == day) &
                (grp["ts"].dt.hour.between(max(0, hour - 1), min(23, hour + 1)))
            ]

            if same_slot.empty:
                result[full_room] = {
                    "label": "No historical data",
                    "pct": None
                }
                continue

            pct = same_slot["occupied"].mean()

            if pct < 0.2:
                label = "Usually empty"
                color = "#15803D"
            elif pct < 0.5:
                label = "Often available"
                color = "#65A30D"
            elif pct < 0.75:
                label = "Sometimes busy"
                color = "#D97706"
            else:
                label = "Usually busy"
                color = "#DC2626"

            result[full_room] = {
                "label": label,
                "color": color,
                "pct": round(float(pct) * 100, 1),
                "samples": int(len(same_slot))
            }

        return jsonify(result)

    except Exception as e:
        print("room insights error:", e)
        return jsonify({"error": str(e)})

# ----------------------------------------------------
# Health Check
# ----------------------------------------------------

@app.route("/health")
def health():

    return jsonify({
        "status": "healthy",
        "collections": building_collections()
    })


# ----------------------------------------------------
# Run Server
# ----------------------------------------------------

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )