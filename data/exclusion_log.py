import pandas as pd

# Load the raw data
trips = pd.read_csv("data/yellow_tripdata_2019-01.csv")

trips["tpep_pickup_datetime"] = pd.to_datetime(trips["tpep_pickup_datetime"])
trips["tpep_dropoff_datetime"] = pd.to_datetime(trips["tpep_dropoff_datetime"])

excluded_records = []

# Dropoff before pickup
bad_time = trips["tpep_dropoff_datetime"] <= trips["tpep_pickup_datetime"]
excluded_records.append(trips[bad_time].copy().assign(reason="dropoff before pickup"))

# Zero or negative distance
bad_distance = trips["trip_distance"] <= 0
excluded_records.append(trips[bad_distance].copy().assign(reason="invalid distance"))

# Distance over 150 miles
too_far = trips["trip_distance"] > 150
excluded_records.append(trips[too_far].copy().assign(reason="distance over 150 miles"))

# Zero or negative fare
bad_fare = trips["fare_amount"] <= 0
excluded_records.append(trips[bad_fare].copy().assign(reason="invalid fare"))

# Fare over $500
too_expensive = trips["fare_amount"] > 500
excluded_records.append(trips[too_expensive].copy().assign(reason="fare over 500"))

# Invalid passenger count
bad_passengers = (trips["passenger_count"] <= 0) | (trips["passenger_count"] > 6)
excluded_records.append(trips[bad_passengers].copy().assign(reason="invalid passenger count"))

# Wrong year
wrong_year = trips["tpep_pickup_datetime"].dt.year != 2019
excluded_records.append(trips[wrong_year].copy().assign(reason="wrong year"))

# Save the log
all_excluded = pd.concat(excluded_records, ignore_index=True)
all_excluded.to_csv("data/exclusion_log.csv", index=False)

print("Total excluded records:", len(all_excluded))
print("Breakdown by reason:")
print(all_excluded["reason"].value_counts())