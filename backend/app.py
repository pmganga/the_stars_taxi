# backend/app.py

import os
import sqlite3
import time
from functools import lru_cache
from flask import Flask, jsonify, request, g, send_from_directory

app = Flask(__name__, static_folder='../frontend', static_url_path='')

# path matches DEFAULT_DB_PATH in db/setup_db.py
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db", "mobility.db")

# Serve frontend files
@app.route('/')
def serve_frontend():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)


# database helpers

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
        # Enable WAL mode for better concurrent reads
        g.db.execute("PRAGMA journal_mode=WAL")
        # Increase cache size for better performance
        g.db.execute("PRAGMA cache_size=-100000")
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


# Simple cache
cache = {}
CACHE_TTL = 300  # 5 minutes

def get_cached(key, func, *args, **kwargs):
    current_time = time.time()
    if key in cache:
        data, timestamp = cache[key]
        if current_time - timestamp < CACHE_TTL:
            return data
    data = func(*args, **kwargs)
    cache[key] = (data, current_time)
    return data


# CORS - required so fetch() calls from index.html are not blocked by the browser

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return response


# GET /api/trips
@app.route("/api/trips")
def get_trips():
    borough      = request.args.get("borough")
    min_fare     = request.args.get("min_fare",     type=float)
    max_fare     = request.args.get("max_fare",     type=float)
    min_distance = request.args.get("min_distance", type=float)
    max_distance = request.args.get("max_distance", type=float)
    time_of_day  = request.args.get("time_of_day")
    date         = request.args.get("date")

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

    if date:
        sql += " AND DATE(t.pickup_datetime) = ?"
        params.append(date)
    
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

    sql += " LIMIT 200"

    try:
        return jsonify(query_db(sql, params)), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# GET /api/zones
@app.route("/api/zones")
def get_zones():
    metric  = request.args.get("metric", "pickup_count")
    borough = request.args.get("borough")

    if metric not in ("pickup_count", "dropoff_count", "avg_fare"):
        metric = "pickup_count"

    # CHANGED: cache key includes metric+borough since, unlike the other
    # cached routes below, this one takes query params that change the
    # result. Without this, every dropdown change re-runs the correlated
    # subquery per zone from scratch (slow on ~7.49M trip rows).
    cache_key = f"zones_{metric}_{borough or 'all'}"
    if cache_key in cache:
        data, timestamp = cache[cache_key]
        if time.time() - timestamp < CACHE_TTL:
            return jsonify(data), 200

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
            {metric_sql} AS metric_value
        FROM zones z
        WHERE z.zone_id IS NOT NULL
    """
    params = []

    if borough and borough != "":
        sql += " AND z.borough = ?"
        params.append(borough)

    sql += " LIMIT 300"

    try:
        # CHANGED: store result in cache before returning
        data = query_db(sql, params)
        cache[cache_key] = (data, time.time())
        return jsonify(data), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# GET /api/summary/borough
@app.route("/api/summary/borough")
def summary_borough():
    cache_key = 'summary_borough'
    if cache_key in cache:
        data, timestamp = cache[cache_key]
        if time.time() - timestamp < CACHE_TTL:
            return jsonify(data), 200
    
    sql = """
        SELECT 
            COALESCE(pz.borough, 'Unknown') AS borough,
            COUNT(*) AS trip_count,
            ROUND(AVG(t.fare_amount), 2) AS avg_fare,
            ROUND(SUM(t.total_amount), 2) AS total_revenue,
            ROUND(AVG(t.trip_distance), 2) AS avg_distance,
            ROUND(AVG(t.tip_amount * 100.0 / NULLIF(t.fare_amount, 0)), 2) AS avg_tip_pct
        FROM trips t
        LEFT JOIN zones pz ON t.pu_location_id = pz.zone_id
        WHERE pz.borough IS NOT NULL
        GROUP BY pz.borough
        ORDER BY trip_count DESC
    """
    try:
        data = query_db(sql)
        cache[cache_key] = (data, time.time())
        return jsonify(data), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# GET /api/summary/hourly
@app.route("/api/summary/hourly")
def summary_hourly():
    cache_key = 'summary_hourly'
    if cache_key in cache:
        data, timestamp = cache[cache_key]
        if time.time() - timestamp < CACHE_TTL:
            return jsonify(data), 200
    
    sql = """
        SELECT
            CAST(strftime('%H', pickup_datetime) AS INTEGER) AS hour,
            COUNT(*) AS trip_count
        FROM trips
        WHERE pickup_datetime IS NOT NULL
        GROUP BY hour
        ORDER BY hour
    """
    try:
        data = query_db(sql)
        cache[cache_key] = (data, time.time())
        return jsonify(data), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# GET /api/top-routes
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
@app.route("/api/summary/payment")
def summary_payment():
    cache_key = 'summary_payment'
    if cache_key in cache:
        data, timestamp = cache[cache_key]
        if time.time() - timestamp < CACHE_TTL:
            return jsonify(data), 200
    
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
        data = query_db(sql)
        cache[cache_key] = (data, time.time())
        return jsonify(data), 200
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500


# error handlers
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
