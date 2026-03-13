from pymongo import MongoClient

client = MongoClient("mongodb+srv://audreychen:peanuts@occupancydata.ie1evjc.mongodb.net/") 
db = client.OccupancyData

def create_indexes():
    print("Creating indexes for faster loading...")
    
    db.occupancy_data.create_index([("building", 1), ("timestamp_iso", -1)])
    
    db.occupancy_data.create_index([("room_id", 1)])
    
    db.trends.create_index([("month", -1)])

    print("Success! Database is now indexed.")

if __name__ == "__main__":
    create_indexes()