 db/insert_trips.py
import os
import sqlite3
import pandas as pd
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
csv_path = os.path.join(BASE_DIR, "data", "engineered_trips.csv")
db_path = os.path.join(BASE_DIR, "db", "mobility.db")

print(f"[INFO] Source CSV: {csv_path}")
print(f"[INFO] Target DB:  {db_path}")

# Connect to the SQLite database
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# --- OPTIMIZATION 1: SQLite Speed PRAGMAs ---
cursor.execute("PRAGMA synchronous = OFF;")
cursor.execute("PRAGMA journal_mode = MEMORY;")
cursor.execute("PRAGMA cache_size = -20000;")  # Allocates ~20MB cache size buffer

# --- OPTIMIZATION 2: Drop Indexes Temporarily ---
print("[INFO] Dropping existing indexes to maximize write speeds...")
indexes_to_drop = [
    "idx_trips_pu_location", "idx_trips_do_location", "idx_trips_pickup_dt",
    "idx_trips_fare_amount", "idx_trips_time_of_day", "idx_trips_total_amount"
]
for idx in indexes_to_drop:
    cursor.execute(f"DROP INDEX IF EXISTS {idx};")

column_mapping = {
    "VendorID": "vendor_id", "tpep_pickup_datetime": "pickup_datetime",
    "tpep_dropoff_datetime": "dropoff_datetime", "RatecodeID": "rate_code_id",
    "store_and_fwd_flag": "store_and_fwd_flag", "PULocationID": "pu_location_id",
    "DOLocationID": "do_location_id", "payment_type": "payment_type",
    "fare_amount": "fare_amount", "extra": "extra", "mta_tax": "mta_tax",
    "tip_amount": "tip_amount", "tolls_amount": "tolls_amount",
    "improvement_surcharge": "improvement_surcharge", "total_amount": "total_amount",
    "congestion_surcharge": "congestion_surcharge", "trip_speed_mph": "trip_speed_mph",
    "time_of_day": "time_of_day", "fare_per_mile": "fare_per_mile", "is_weekend": "is_weekend"
}

columns_we_need = [
    "vendor_id", "pickup_datetime", "dropoff_datetime", "passenger_count",
    "trip_distance", "rate_code_id", "store_and_fwd_flag", "pu_location_id",
    "do_location_id", "payment_type", "fare_amount", "extra", "mta_tax",
    "tip_amount", "tolls_amount", "improvement_surcharge", "total_amount",
    "congestion_surcharge", "trip_speed_mph", "time_of_day", "fare_per_mile", "is_weekend"
]

# Larger chunk size (100k rows is optimal for speed while remaining low-RAM)
chunk_size = 100000
print("\nStarting high-velocity chunked database ingestion...")
start_time = time.time()

try:
    # --- OPTIMIZATION 3: Single Explicit Transaction Context ---
    cursor.execute("BEGIN TRANSACTION;")
    
    for chunk_idx, chunk in enumerate(pd.read_csv(csv_path, chunksize=chunk_size)):
        chunk = chunk.rename(columns=column_mapping)
        for col in columns_we_need:
            if col not in chunk.columns:
                chunk[col] = None
        
        if "time_of_day" in chunk.columns:
            chunk["time_of_day"] = chunk["time_of_day"].replace("evening", "night")

        chunk_to_insert = chunk[columns_we_need]
        
        # Write to SQL without letting Pandas handle individual transactions
        chunk_to_insert.to_sql("trips", conn, if_exists="append", index=False)
        
        print(f"  -> Processed Batch {chunk_idx + 1} ({(chunk_idx + 1) * chunk_size} cumulative rows)...")

    # Securely commit everything at once
    conn.commit()
    print(f"\n[OK] Data streaming finished in {time.time() - start_time:.2f} seconds!")

    # --- OPTIMIZATION 4: Rebuild Indexes at the End ---
    print("\n[INFO] Rebuilding structural indexes. Standby...")
    index_start = time.time()
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trips_pu_location ON trips(pu_location_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trips_do_location ON trips(do_location_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trips_pickup_dt ON trips(pickup_datetime);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trips_fare_amount ON trips(fare_amount);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trips_time_of_day ON trips(time_of_day);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trips_total_amount ON trips(total_amount);")
    conn.commit()
    print(f"[OK] Indexes built successfully in {time.time() - index_start:.2f} seconds!")

except Exception as e:
    print(f"\n[ERROR] Transaction failed, rolling back: {e}")
    conn.rollback()

finally:
    conn.close()
    print(f"\nTotal Pipeline Execution Time: {time.time() - start_time:.2f} seconds.")