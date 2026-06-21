# data/feature_engineering.py
import os
import time
import pandas as pd

# Set up dynamic absolute paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
input_file = os.path.join(BASE_DIR, "cleaned_trips.csv")
output_file = os.path.join(BASE_DIR, "engineered_trips.csv")

# Clean start: Delete old output file if it exists
if os.path.exists(output_file):
    os.remove(output_file)

# --- SPEED OPTIMIZATION: High-performance chunk size ---
# 500k rows balances massive speed gains with a tiny memory footprint (~150MB RAM)
chunk_size = 500000  

# Specify only the raw columns we actually need to build our features
# This saves significant RAM by ignoring unused data
columns_to_read = [
    "VendorID", "tpep_pickup_datetime", "tpep_dropoff_datetime",
    "passenger_count", "trip_distance", "RatecodeID", "store_and_fwd_flag",
    "PULocationID", "DOLocationID", "payment_type", "fare_amount", "extra",
    "mta_tax", "tip_amount", "tolls_amount", "improvement_surcharge",
    "total_amount", "congestion_surcharge"
]

print(f"[INFO] Reading from: {input_file}")
print(f"[INFO] Writing to:   {output_file}")
print(f"Starting vectorized feature engineering in batches of {chunk_size:,} rows...\n")

start_time = time.time()

try:
    # Read and process data incrementally
    for chunk_idx, chunk in enumerate(pd.read_csv(input_file, chunksize=chunk_size, usecols=columns_to_read)):
        batch_start = time.time()
        
        # 1. Convert datetimes using vectorization
        pickup_dt = pd.to_datetime(chunk["tpep_pickup_datetime"])
        dropoff_dt = pd.to_datetime(chunk["tpep_dropoff_datetime"])
        
        # 2. Engineer Feature: Trip Speed (MPH)
        duration_hours = (dropoff_dt - pickup_dt).dt.total_seconds() / 3600.0
        # Prevent division by zero if duration is 0
        chunk["trip_speed_mph"] = chunk["trip_distance"] / duration_hours.replace(0, float('inf'))
        
        # 3. Engineer Feature: Time of Day (Limited strictly to morning, afternoon, night)
        pickup_hour = pickup_dt.dt.hour
        chunk["time_of_day"] = "night"  # Default fallback state
        chunk.loc[(pickup_hour >= 5) & (pickup_hour < 12), "time_of_day"] = "morning"
        chunk.loc[(pickup_hour >= 12) & (pickup_hour < 17), "time_of_day"] = "afternoon"
        # Note: 'evening' trips (17:00 to 21:00) fall into 'night' here to respect db constraints
        
        # 4. Engineer Feature: Fare per Mile
        chunk["fare_per_mile"] = chunk["fare_amount"] / chunk["trip_distance"].replace(0, float('inf'))
        
        # 5. Engineer Feature: Weekend Flag (1 = Weekend, 0 = Weekday)
        chunk["is_weekend"] = pickup_dt.dt.weekday.isin([5, 6]).astype(int)
        
        # Save chunk to disk. Only write headers on the very first batch.
        is_first_batch = (chunk_idx == 0)
        chunk.to_csv(output_file, mode='a', index=False, header=is_first_batch)
        
        cumulative_rows = (chunk_idx + 1) * chunk_size
        print(f"  -> Processed batch {chunk_idx + 1:02d} | Cumulative rows: {cumulative_rows:,} | Batch time: {time.time() - batch_start:.2f}s")

    print(f"\n[OK] Feature engineering finished successfully!")
    print(f"Total time elapsed: {time.time() - start_time:.2f} seconds.")

except Exception as e:
    print(f"\n[ERROR] Pipeline interrupted during execution: {e}")