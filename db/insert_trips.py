import pandas as pd
import sqlite3

# Load the engineered data
trips = pd.read_csv("data/engineered_trips.csv")
print("Rows to insert:", len(trips))

# Connect to the database
conn = sqlite3.connect("db/taxi.db")
cursor = conn.cursor()

# Rename columns to match schema.sql exactly
trips = trips.rename(columns={
    "VendorID": "vendor_id",
    "tpep_pickup_datetime": "pickup_datetime",
    "tpep_dropoff_datetime": "dropoff_datetime",
    "RatecodeID": "rate_code_id",
    "store_and_fwd_flag": "store_and_fwd_flag",
    "PULocationID": "pu_location_id",
    "DOLocationID": "do_location_id",
    "payment_type": "payment_type",
    "fare_amount": "fare_amount",
    "extra": "extra",
    "mta_tax": "mta_tax",
    "tip_amount": "tip_amount",
    "tolls_amount": "tolls_amount",
    "improvement_surcharge": "improvement_surcharge",
    "total_amount": "total_amount",
    "congestion_surcharge": "congestion_surcharge",
    "trip_speed_mph": "trip_speed_mph",
    "time_of_day": "time_of_day",
    "fare_per_mile": "fare_per_mile",
    "is_weekend": "is_weekend"
})

# Pick only the columns that match the schema
columns_we_need = [
    "vendor_id", "pickup_datetime", "dropoff_datetime",
    "passenger_count", "trip_distance", "rate_code_id",
    "store_and_fwd_flag", "pu_location_id", "do_location_id",
    "payment_type", "fare_amount", "extra", "mta_tax",
    "tip_amount", "tolls_amount", "improvement_surcharge",
    "total_amount", "congestion_surcharge", "trip_speed_mph",
    "time_of_day", "fare_per_mile", "is_weekend"
]