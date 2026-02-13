import time
from datetime import datetime

MIN_INTERVAL = 2
MAX_INTERVAL = 3

room_state = {}  # key: (building_id, room_id)


def validate_update(data):
    required_fields = [
        "timestamp", "building_id", "room_id",
        "occupancy_state", "source_id", "sequence_id"
    ]

    for field in required_fields:
        if field not in data:
            return f"Missing required field: {field}"

    if data["occupancy_state"] not in [0, 1]:
        return "occupancy_state must be 0 or 1"

    try:
        datetime.fromisoformat(str(data["timestamp"]).replace("Z", ""))
    except ValueError:
        return "Invalid timestamp format"

    return None


def process_update(data):
    key = (data["building_id"], data["room_id"])
    now = time.time()

    state = room_state.get(key, {
        "last_sequence_id": -1,
        "last_update_time": 0.0,
        "status": "active",
        "last_update": None
    })

    if data["sequence_id"] <= state["last_sequence_id"]:
        return {"error": "Duplicate or out-of-order sequence_id"}

    elapsed = now - state["last_update_time"]
    if state["last_update_time"] != 0 and elapsed < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - elapsed)
        state["status"] = "buffering"
    else:
        state["status"] = "active"

    state["last_sequence_id"] = data["sequence_id"]
    state["last_update_time"] = time.time()
    state["last_update"] = {
        "timestamp": data["timestamp"],
        "building_id": data["building_id"],
        "room_id": data["room_id"],
        "occupancy_state": data["occupancy_state"],
        "source_id": data["source_id"],
        "sequence_id": data["sequence_id"],
        "status": state["status"]
    }

    room_state[key] = state
    return {"message": "Update processed", "status": state["status"]}


def check_fallback():
    now = time.time()
    for key, state in room_state.items():
        if state["last_update_time"] != 0 and (now - state["last_update_time"] > MAX_INTERVAL):
            state["status"] = "fallback"
            if state["last_update"] is not None:
                state["last_update"]["status"] = "fallback"


def get_room(building_id, room_id):
    key = (building_id, room_id)
    state = room_state.get(key)
    if not state or state.get("last_update") is None:
        return None
    return state["last_update"]


def tracked_rooms_count():
    return len(room_state)
