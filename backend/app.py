# backend/app.py

import os
import sqlite3
from flask import Flask, jsonify, request, g

app = Flask(__name__)

# path matches DEFAULT_DB_PATH in db/setup_db.py
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "db", "mobility.db")


# database helpers

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(error):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def query_db(sql, params=()):
    cur = get_db().execute(sql, params)
    rows = cur.fetchall()
    return [dict(row) for row in rows]


# CORS - required so fetch() calls from index.html are not blocked by the browser

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return response


# GET /api/trips
# query params map to filter controls in frontend/index.html:
#   borough      <- #borough-filter   -> zones.borough via pickup zone JOIN
#   min_fare     <- #min-fare         -> trips.fare_amount
#   max_fare     <- #max-fare         -> trips.fare_amount
#   min_distance <- #min-distance     -> trips.trip_distance
#   max_distance <- #max-distance     -> trips.trip_distance
#   time_of_day  <- #hour-filter      -> trips.time_of_day
#   date         <- #global-date      -> DATE(trips.pickup_datetime)

@app.route("/api/trips")
def get_trips():
    borough      = request.args.get("borough")
    min_fare     = request.args.get("min_fare",     type=float)
    max_fare     = request.args.get("max_fare",     type=float)
    min_distance = request.args.get("min_distance", type=float)
    max_distance = request.args.get("max_distance", type=float)
    time_of_day  = request.args.get("time_of_day")
    date         = request.args.get("date")

    # index.html #hour-filter has an "evening" option
    # feature_engineering.py only writes morning, afternoon, night to the database
    # evening has no matching rows so it is treated as no filter
    if time_of_day in ("all", "evening", None, ""):
        time_of_day = None

    sql = """
        SELECT
            t.trip_id,
            t.pickup_datetime,
            t.dropoff_datetime,
            t.trip_distance,
            t.fare_amount,
            t.tip_amount,
            t.total_amount,
            t.passenger_count,
            t.payment_type,
            t.time_of_day,
            t.is_weekend,
            t.trip_speed_mph,
            t.fare_per_mile,
            pz.zone_name  AS pickup_zone,
            pz.borough    AS pickup_borough,
            dz.zone_name  AS dropoff_zone,
            dz.borough    AS dropoff_borough
        FROM trips t
        LEFT JOIN zones pz ON t.pu_location_id = pz.zone_id
        LEFT JOIN zones dz ON t.do_location_id = dz.zone_id
        WHERE 1=1
    """
    params = []

    if borough and borough != "all":
        sql += " AND pz.borough = ?"
        params.append(borough)
    if min_fare is not None:
        sql += " AND t.fare_amount >= ?"
        params.append(min_fare)
    if max_fare is not None:
        sql += " AND t.fare_amount <= ?"
        params.append(max_fare)
    if min_distance is not None:
        sql += " AND t.trip_distance >= ?"
        params.append(min_distance)
    if max_distance is not None:
        sql += " AND t.trip_distance <= ?"
        params.append(max_distance)
    if time_of_day:
        sql += " AND t.time_of_day = ?"
        params.append(time_of_day)
    if date:
        sql += " AND DATE(t.pickup_datetime) = ?"
        params.append(date)

    sql += " LIMIT 500"

    try:
        return jsonify(query_db(sql, params)), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# GET /api/zones
# used by frontend/map.js for the Leaflet choropleth layer
# metric param maps to #map-metric in index.html:
#   pickup_count  -> COUNT trips where pu_location_id matches
#   dropoff_count -> COUNT trips where do_location_id matches
#   avg_fare      -> AVG fare_amount for pickup zone
# borough param maps to #map-borough

@app.route("/api/zones")
def get_zones():
    metric  = request.args.get("metric", "pickup_count")
    borough = request.args.get("borough")

    if metric not in ("pickup_count", "dropoff_count", "avg_fare"):
        metric = "pickup_count"

    if metric == "pickup_count":
        metric_sql = "(SELECT COUNT(*) FROM trips WHERE pu_location_id = z.zone_id)"
    elif metric == "dropoff_count":
        metric_sql = "(SELECT COUNT(*) FROM trips WHERE do_location_id = z.zone_id)"
    else:
        metric_sql = "(SELECT ROUND(AVG(fare_amount), 2) FROM trips WHERE pu_location_id = z.zone_id)"

    sql = f"""
        SELECT
            z.zone_id,
            z.borough,
            z.zone_name,
            z.service_zone,
            zg.geojson,
            {metric_sql} AS metric_value
        FROM zones z
        LEFT JOIN zone_geometry zg ON z.zone_id = zg.zone_id
        WHERE zg.geojson IS NOT NULL
    """
    params = []

    if borough and borough != "":
        sql += " AND z.borough = ?"
        params.append(borough)

    try:
        return jsonify(query_db(sql, params)), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# GET /api/summary/borough
# used by KPI cards in index.html (total-trips, total-revenue, avg-fare,
# avg-distance, avg-tip-pct) and the bar chart of average fare per borough

@app.route("/api/summary/borough")
def summary_borough():
    sql = """
        SELECT
            pz.borough,
            COUNT(*)                                             AS trip_count,
            ROUND(AVG(t.fare_amount), 2)                        AS avg_fare,
            ROUND(SUM(t.total_amount), 2)                       AS total_revenue,
            ROUND(AVG(t.trip_distance), 2)                      AS avg_distance,
            ROUND(AVG(t.tip_amount * 100.0 / t.fare_amount), 2) AS avg_tip_pct
        FROM trips t
        LEFT JOIN zones pz ON t.pu_location_id = pz.zone_id
        WHERE pz.borough IS NOT NULL
        GROUP BY pz.borough
        ORDER BY trip_count DESC
    """
    try:
        return jsonify(query_db(sql)), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# GET /api/summary/hourly
# used by #hourly-chart in index.html - trips by hour of day
# pickup_hour is not a stored column so hour is extracted with strftime
# from the TEXT pickup_datetime field at query time

@app.route("/api/summary/hourly")
def summary_hourly():
    sql = """
        SELECT
            CAST(strftime('%H', pickup_datetime) AS INTEGER) AS hour,
            COUNT(*)                                         AS trip_count,
            ROUND(AVG(fare_amount), 2)                       AS avg_fare
        FROM trips
        WHERE pickup_datetime IS NOT NULL
        GROUP BY hour
        ORDER BY hour
    """
    try:
        return jsonify(query_db(sql)), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# GET /api/top-routes
# used by #top-zones-chart in index.html
# does NOT use SQL ORDER BY - raw counts go to dsa/top_routes.py
# which finds top K using a hand-built hash map and manual selection sort
# k param controls how many zones to return, default 10

@app.route("/api/top-routes")
def top_routes():
    k = request.args.get("k", default=10, type=int)
    if k < 1 or k > 50:
        return jsonify({"error": "k must be between 1 and 50"}), 400

    sql = """
        SELECT
            t.pu_location_id,
            z.zone_name,
            z.borough,
            COUNT(*) AS trip_count
        FROM trips t
        LEFT JOIN zones z ON t.pu_location_id = z.zone_id
        WHERE z.zone_name IS NOT NULL
        GROUP BY t.pu_location_id
    """
    try:
        rows = query_db(sql)
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500

    counts = {row["zone_name"]: row["trip_count"] for row in rows}
    meta   = {row["zone_name"]: row["borough"]    for row in rows}

    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "dsa"))
    from top_routes import top_k_routes

    result = top_k_routes(counts, k)

    output = [
        {"zone_name": zone, "borough": meta.get(zone, ""), "trip_count": count}
        for zone, count in result
    ]
    return jsonify(output), 200


# GET /api/summary/payment
# used by #payment-chart in index.html (Card vs cash vs other)
# payment_type is stored as integer in schema.sql:
#   1 = Credit card, 2 = Cash, 3 = No charge, 4 = Dispute, 5 = Unknown, 6 = Voided
# charts.js maps integer codes to labels when rendering the donut chart

@app.route("/api/summary/payment")
def summary_payment():
    sql = """
        SELECT
            payment_type,
            COUNT(*) AS trip_count
        FROM trips
        WHERE payment_type IS NOT NULL
        GROUP BY payment_type
        ORDER BY trip_count DESC
    """
    try:
        return jsonify(query_db(sql)), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# error handlers - all return JSON so charts.js and filters.js
# can parse the message rather than receiving an HTML error page

@app.errorhandler(400)
def bad_request(e):
    return jsonify({"error": "Bad request", "message": str(e)}), 400


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found", "message": str(e)}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Server error", "message": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
