import pandas as pd

# Load the cleaned data
trips = pd.read_csv("data/cleaned_trips.csv")
print("Rows loaded:", len(trips))

# Convert timestamps
trips["tpep_pickup_datetime"] = pd.to_datetime(trips["tpep_pickup_datetime"])
trips["tpep_dropoff_datetime"] = pd.to_datetime(trips["tpep_dropoff_datetime"])

# Feature 1: Trip speed in mph
# trip_distance divided by duration in hours
trips["trip_duration_hours"] = (
    trips["tpep_dropoff_datetime"] - trips["tpep_pickup_datetime"]
).dt.total_seconds() / 3600

trips["trip_speed_mph"] = trips["trip_distance"] / trips["trip_duration_hours"]

# Feature 2: Time of day based on pickup hour
# morning = 06:00-11:59, afternoon = 12:00-17:59, night = 18:00-05:59
def get_time_of_day(hour):
    if 6 <= hour <= 11:
        return "morning"
    elif 12 <= hour <= 17:
        return "afternoon"
    else:
        return "night"

trips["pickup_hour"] = trips["tpep_pickup_datetime"].dt.hour
trips["time_of_day"] = trips["pickup_hour"].apply(get_time_of_day)

# Feature 3: Fare per mile
# uses fare_amount not total_amount
trips["fare_per_mile"] = trips["fare_amount"] / trips["trip_distance"]

# Feature 4: Is weekend
# 1 = Saturday or Sunday, 0 = weekday
trips["day_of_week"] = trips["tpep_pickup_datetime"].dt.dayofweek
trips["is_weekend"] = trips["day_of_week"].apply(lambda x: 1 if x >= 5 else 0)

# Remove rows where division produced invalid results
trips = trips.replace([float("inf"), float("-inf")], None)
trips = trips.dropna(subset=["trip_speed_mph", "fare_per_mile"])

print("Rows after feature engineering:", len(trips))

# Save
trips.to_csv("data/engineered_trips.csv", index=False)
print("Saved: data/engineered_trips.csv")