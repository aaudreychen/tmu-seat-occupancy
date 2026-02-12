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

# ----------------------
# Setup
# ----------------------
load_dotenv()
app = Flask(__name__)
CORS(app)

mongo_uri = os.getenv("MONGO_URI")
client = MongoClient(mongo_uri)
db = client["OccupancyData"]

print("Connected to MongoDB Atlas!")

def train_model(collection_name):
    if collection_name not in db.list_collection_names(): return None
    collection = db[collection_name]
    data = list(collection.find({}, {"_id": 0}))
    if not data: return None
    df = pd.DataFrame(data)
    required = ["temperature_c", "co2_ppm", "humidity_ratio", "light_lux", "relative_humidity", "occupied"]
    if not all(col in df.columns for col in required): return None
    for col in required: df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=required)
    X, y = df[required[:-1]], df["occupied"]
    if len(set(y)) < 2: 
        df["predicted"] = y
        return df
    model = Pipeline([("scaler", StandardScaler()), ("clf", LogisticRegression())])
    model.fit(X, y)
    df["predicted"] = model.predict(X)
    return df

@app.route("/availability/<collection_name>")
def availability(collection_name):
    try:
        target_date = request.args.get('date') 
        target_time = request.args.get('time') 
        target_floor = request.args.get('floor') 
        people = request.args.get('people') # New capacity filter

        df = train_model(collection_name)
        if df is None or df.empty: return jsonify([])

        # Date Filter
        if target_date:
            df = df[df['date_str'] == target_date]

        # Floor Filter (Converts "4" to "F4")
        if target_floor:
            df = df[df['floor_id'] == f"F{target_floor}"]

        # Capacity Filter (People)
        if people:
            df["capacity"] = pd.to_numeric(df["capacity"], errors="coerce")
            df = df[df["capacity"] >= int(people)]

        # 30-Minute Window Filter
        if target_time and not df.empty:
            sel_t = datetime.strptime(target_time, "%I:%M %p").time()
            def in_window(row_t_str):
                try:
                    row_t = datetime.strptime(row_t_str, "%H:%M").time()
                    return sel_t.hour == row_t.hour and sel_t.minute <= row_t.minute < (sel_t.minute + 30)
                except: return False
            df = df[df['time_str'].apply(in_window)]

        # Format with 12h AM/PM for UI
        formatted = []
        for _, row in df.iterrows():
            raw_t = row.get("time_str")
            disp_t = datetime.strptime(raw_t, "%H:%M").strftime("%I:%M %p").lstrip('0') if raw_t else "N/A"
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

if __name__ == "__main__":
    app.run(port=5000, debug=True)