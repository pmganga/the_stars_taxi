import pandas as pd
import sqlite3

trips = pd.read_csv("data/engineered_trips.csv")
print("Rows to insert:", len(trips))

conn = sqlite3.connect("db/taxi.db")
cursor = conn.cursor()

cursor.execute("""
    CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER,
        pickup_datetime TEXT,
        dropoff_datetime TEXT,
        passenger_count INTEGER,
        trip_distance REAL,
        pickup_location_id INTEGER,
        dropoff_location_id INTEGER,
        payment_type INTEGER,
        fare_amount REAL,
        tip_amount REAL,
        total_amount REAL,
        pickup_borough TEXT,
        pickup_zone TEXT,
        dropoff_borough TEXT,
        dropoff_zone TEXT,
        trip_duration_mins REAL,
        avg_speed_mph REAL,
        cost_per_mile REAL,
        pickup_hour INTEGER,
        day_of_week INTEGER
    )
""")

trips = trips.rename(columns={
    "VendorID": "vendor_id",
    "tpep_pickup_datetime": "pickup_datetime",
    "tpep_dropoff_datetime": "dropoff_datetime",
    "PULocationID": "pickup_location_id",
    "DOLocationID": "dropoff_location_id"
})

columns_we_need = [
    "vendor_id", "pickup_datetime", "dropoff_datetime",
    "passenger_count", "trip_distance", "pickup_location_id",
    "dropoff_location_id", "payment_type", "fare_amount",
    "tip_amount", "total_amount", "pickup_borough", "pickup_zone",
    "dropoff_borough", "dropoff_zone", "trip_duration_mins",
    "avg_speed_mph", "cost_per_mile", "pickup_hour", "day_of_week"
]

trips = trips[columns_we_need]


batch_size = 10000
total = len(trips)

for i in range(0, total, batch_size):
    batch = trips.iloc[i:i + batch_size]
    batch.to_sql("trips", conn, if_exists="append", index=False)
    print(f"Inserted {min(i + batch_size, total):,} of {total:,} rows", end="\r")

conn.commit()
conn.close()

print("\nDone! Database saved to db/taxi.db")
