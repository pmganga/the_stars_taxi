import pandas as pd

trips = pd.read_csv("cleaned_trips.csv")

print("Rows loaded:", len(trips))

trips["tpep_pickup_datetime"] = pd.to_datetime(trips["tpep_pickup_datetime"])
trips["tpep_dropoff_datetime"] = pd.to_datetime(trips["tpep_dropoff_datetime"])

trips["trip_duration_mins"] = (
    trips["tpep_dropoff_datetime"] - trips["tpep_pickup_datetime"]
).dt.total_seconds() / 60

trips["avg_speed_mph"] = trips["trip_distance"] / (trips["trip_duration_mins"] / 60)

trips["cost_per_mile"] = trips["total_amount"] / trips["trip_distance"]

trips["pickup_hour"] = trips["tpep_pickup_datetime"].dt.hour

trips["day_of_week"] = trips["tpep_pickup_datetime"].dt.dayofweek

trips = trips.replace([float("inf"), float("-inf")], None)
trips = trips.dropna(subset=["trip_duration_mins", "avg_speed_mph", "cost_per_mile"])

print("Rows after feature engineering:", len(trips))

trips.to_csv("engineered_trips.csv", index=False)
print("Saved: engineered_trips.csv")