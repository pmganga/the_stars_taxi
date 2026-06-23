# NYC Mobility Explorer

## Overview

NYC Mobility Explorer is a full-stack dashboard for analyzing NYC Yellow Taxi trip records from January 2019. It processes 7.49 million trips and provides interactive charts, maps, and filters to explore urban mobility patterns across New York City's boroughs.

---

## Features

### Dashboard
- KPI Cards: Total trips, fare revenue, average fare, average distance, average tip percentage, peak hour
- Hourly Trip Volume: Bar/line chart showing trips by hour
- Top Pickup Zones: Horizontal bar chart of highest-volume locations
- Fare vs Distance: Scatter plot with trendline
- Payment Split: Donut chart of payment methods

### Trips Explorer
- Filters: Date, borough, fare range, distance range, time of day
- Trips Table: View filtered records
- CSV Export: Export filtered data

### Interactive Map
- Choropleth Map: Color-coded zones by pickup volume, dropoff volume, or average fare
- Per-Borough Scaling: Each borough has its own color gradient
- Interactive Popups: Click zones for details
- Filter Controls: Metric and borough filters

### Theme Support
- Toggle between light and dark mode
- Theme preference persists across page reloads

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.x, Flask, SQLite |
| Frontend | HTML5/CSS3, Vanilla JS, Chart.js, Leaflet.js |
| Data Processing | Pandas, CSV |
| Caching | SessionStorage |
| Algorithm | Manual Selection Sort (O(K*N)) |

---

## Project Structure

```
the_stars_taxi/
├── backend/
│   ├── app.py              
│   └── dsa/
│       └── top_routes.py   
├── data/
│   ├── clean_pipeline.py
│   ├── feature_engineering.py
│   ├── yellow_tripdata_2019-01.csv
│   └── taxi_zone_lookup.csv
├── db/
│   ├── schema.sql
│   ├── setup_db.py
│   ├── insert_trips.py
│   └── mobility.db
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── data.js
│   ├── charts.js
│   ├── filters.js
│   ├── map.js
│   ├── nav.js
│   └── taxi_zones.geojson
└── README.md
```

---

## Setup Instructions

### Prerequisites

- Python 3.8+
- pip
- Modern web browser
- ~2GB disk space
- 4GB RAM minimum

### Installation

**1. Install Python dependencies**

```bash
pip install -r requirements.txt
```

**2. Place data files in `data/` folder**

- `yellow_tripdata_2019-01.csv`
- `taxi_zone_lookup.csv`

**3. Set up the database**

```bash
python3 db/setup_db.py
```

**4. Insert trip data**

```bash
python3 db/insert_trips.py
```

**5. Start the application**

```bash
python3 backend/app.py
```

**6. Open dashboard**

```
http://localhost:5000
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/trips` | Filtered trip records |
| `GET /api/zones` | Zone metrics |
| `GET /api/summary/borough` | Borough statistics |
| `GET /api/summary/hourly` | Hourly distribution |
| `GET /api/summary/payment` | Payment methods |
| `GET /api/top-routes?k=8` | Top pickup zones |

### Trip Filters

- `date` - YYYY-MM-DD
- `borough` - Borough name
- `min_fare` / `max_fare`
- `min_distance` / `max_distance`
- `time_of_day` - morning, afternoon, night

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 5000 in use | `sudo lsof -t -i:5000 \| xargs kill -9` |
| Flask not found | `pip install flask` |
| No such table: zones | `python3 db/setup_db.py` |
| Map shows no colors | Check zones: `sqlite3 db/mobility.db "SELECT COUNT(*) FROM zones;"` |
| Dashboard shows NaN | Rebuild DB: `rm db/mobility.db* && python3 db/setup_db.py` |

---

## Appendix A: Create Test Data

If you don't have the full dataset, create `data/create_test_data.py`:

```python
import pandas as pd
import random
from datetime import datetime, timedelta

def create_test_data():
    zones = pd.read_csv("data/taxi_zone_lookup.csv")
    location_ids = zones['LocationID'].tolist()
    
    n_trips = 10000
    data = []
    start_date = datetime(2019, 1, 1, 0, 0, 0)
    
    for i in range(n_trips):
        pickup_dt = start_date + timedelta(
            days=random.randint(0, 30),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59)
        )
        duration = random.randint(5, 45)
        dropoff_dt = pickup_dt + timedelta(minutes=duration)
        
        pu_location = random.choice(location_ids)
        do_location = random.choice(location_ids)
        trip_distance = round(random.uniform(0.5, 15.0), 2)
        fare_amount = round(3.50 + trip_distance * 2.50 + random.uniform(-1, 3), 2)
        fare_amount = max(fare_amount, 2.50)
        
        data.append({
            'VendorID': random.choice([1, 2]),
            'tpep_pickup_datetime': pickup_dt,
            'tpep_dropoff_datetime': dropoff_dt,
            'passenger_count': random.randint(1, 6),
            'trip_distance': trip_distance,
            'RatecodeID': random.choice([1, 2, 3, 4, 5, 6]),
            'store_and_fwd_flag': random.choice(['N', 'Y']),
            'PULocationID': pu_location,
            'DOLocationID': do_location,
            'payment_type': random.choices([1, 2, 3, 4, 5, 6], weights=[0.6, 0.3, 0.05, 0.02, 0.02, 0.01])[0],
            'fare_amount': fare_amount,
            'extra': round(random.uniform(0, 1), 2),
            'mta_tax': 0.50,
            'tip_amount': round(random.uniform(0, fare_amount * 0.25), 2),
            'tolls_amount': round(random.uniform(0, 2), 2),
            'improvement_surcharge': 0.30,
            'total_amount': round(fare_amount + tip_amount + random.uniform(0, 2), 2),
            'congestion_surcharge': random.choice([0, 2.50, 0.75])
        })
    
    pd.DataFrame(data).to_csv("data/yellow_tripdata_2019-01.csv", index=False)
    print(f"Created {n_trips} test trips")

if __name__ == "__main__":
    create_test_data()
```

Run it:

```bash
python3 data/create_test_data.py
```

---

## Custom Algorithm: Top K Routes

```python
def top_k_routes(zone_counts: dict, k: int) -> list:
    """Manual selection sort - O(K * N) time, O(N) space"""
    if not zone_counts or k <= 0:
        return []
    
    items = [[name, cnt] for name, cnt in zone_counts.items()]
    n = len(items)
    k = min(k, n)
    used = [False] * n
    result = []
    
    for _ in range(k):
        best_idx = -1
        best_val = -1
        for i in range(n):
            if not used[i] and items[i][1] > best_val:
                best_val = items[i][1]
                best_idx = i
        if best_idx == -1:
            break
        used[best_idx] = True
        result.append((items[best_idx][0], items[best_idx][1]))
    
    return result
```

---

## Video Walkthrough

Watch our video walkthrough [here](https://www.youtube.com/@DavineUwase)

---

## Team Members

| Name | Role |
|------|------|
| Davine Uwase | Backend / Data Engineer |
| Philip Mbogo | Backend / API Developer |
| Joseph Marube | Frontend Developer |

---

---

## Team Participation Sheet

You can view our [Team Participation Sheet](https://docs.google.com/spreadsheets/d/1V8Yre67fQdMM7BKJ0Pfw79jlBEsOlj7nYS3mHivdDYk/edit?usp=sharing)

---

## License

Educational purposes only.
```
