import pandas as pd
import os

trips = pd.read_csv("yellow_tripdata_2019-01.csv")
zones = pd.read_csv("taxi_zone_lookup.csv")

print("Rows loaded:", len(trips))

trips = trips.merge(
    zones[["LocationID", "Borough", "Zone"]].rename(columns={
        "LocationID": "PULocationID",
        "Borough": "pickup_borough",
        "Zone": "pickup_zone"
    }),
    on="PULocationID",
    how="left"
)

trips = trips.merge(
    zones[["LocationID", "Borough", "Zone"]].rename(columns={
        "LocationID": "DOLocationID",
        "Borough": "dropoff_borough",
        "Zone": "dropoff_zone"
    }),
    on="DOLocationID",
    how="left"
)

before = len(trips)
trips = trips.drop_duplicates()
print("Duplicates removed:", before - len(trips))

trips["tpep_pickup_datetime"] = pd.to_datetime(trips["tpep_pickup_datetime"])
trips["tpep_dropoff_datetime"] = pd.to_datetime(trips["tpep_dropoff_datetime"])

excluded_records = []

bad_time = trips["tpep_dropoff_datetime"] <= trips["tpep_pickup_datetime"]
excluded_records.append(trips[bad_time].copy().assign(reason="dropoff before pickup"))
trips = trips[~bad_time]

bad_distance = trips["trip_distance"] <= 0
excluded_records.append(trips[bad_distance].copy().assign(reason="invalid distance"))
trips = trips[~bad_distance]

bad_fare = trips["fare_amount"] <= 0
excluded_records.append(trips[bad_fare].copy().assign(reason="invalid fare"))
trips = trips[~bad_fare]

bad_passengers = (trips["passenger_count"] <= 0) | (trips["passenger_count"] > 6)
excluded_records.append(trips[bad_passengers].copy().assign(reason="invalid passenger count"))
trips = trips[~bad_passengers]

wrong_year = trips["tpep_pickup_datetime"].dt.year != 2019
excluded_records.append(trips[wrong_year].copy().assign(reason="wrong year"))
trips = trips[~wrong_year]

print("Clean rows remaining:", len(trips))

all_excluded = pd.concat(excluded_records, ignore_index=True)
all_excluded.to_csv("exclusion_log.csv", index=False)
print("Excluded rows saved to exclusion_log.csv:", len(all_excluded))

trips.to_csv("cleaned_trips.csv", index=False)
print("Cleaned data saved to cleaned_trips.csv")
