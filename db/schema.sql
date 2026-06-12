-- db/schema.sql
-- Urban Mobility Data Explorer
-- tables: zones, zone_geometry, trips
-- run: python db/setup_db.py

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS zone_geometry;
DROP TABLE IF EXISTS zones;


-- zones: dimension table from taxi_zone_lookup.csv, 265 rows
CREATE TABLE zones (

    zone_id      INTEGER  PRIMARY KEY,
    -- maps to LocationID in the CSV, TLC defines these so no auto-increment needed

    borough      TEXT     NOT NULL,
    -- Manhattan, Brooklyn, Queens, Bronx, Staten Island, EWR, Unknown, N/A

    zone_name    TEXT     NOT NULL,

    service_zone TEXT     DEFAULT NULL
    -- NULL for two zones that have no service zone in the CSV

);


-- zone_geometry: one GeoJSON polygon per zone, from taxi_zones shapefile
-- 263 rows - two lookup zones have no polygon
CREATE TABLE zone_geometry (

    geometry_id  INTEGER  PRIMARY KEY AUTOINCREMENT,

    zone_id      INTEGER  NOT NULL UNIQUE,
    -- FK to zones, UNIQUE enforces one polygon per zone

    geojson      TEXT     NOT NULL,
    -- full GeoJSON Feature as a string, map.js reads this for the Leaflet layer
    -- OBJECTID, Shape_Leng, Shape_Area dropped - GIS metadata not needed here

    CONSTRAINT fk_geometry_zone
        FOREIGN KEY (zone_id)
        REFERENCES zones(zone_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE

);


-- trips: fact table from yellow_tripdata_2019-01.csv, one row per trip
-- airport_fee not included - confirmed absent from 2019-01 data
-- congestion_surcharge always NULL for Jan 2019, the field was added mid-2019
CREATE TABLE trips (

    trip_id               INTEGER  PRIMARY KEY AUTOINCREMENT,

    -- raw columns from the CSV
    vendor_id             INTEGER  NOT NULL,

    pickup_datetime       TEXT     NOT NULL,
    -- stored as TEXT, ISO 8601 format so string sorting works for date queries

    dropoff_datetime      TEXT     NOT NULL,

    passenger_count       INTEGER  NOT NULL,
    -- clean_pipeline.py drops rows where this is 0

    trip_distance         REAL     NOT NULL,
    -- clean_pipeline.py drops rows where this is > 150

    rate_code_id          INTEGER  DEFAULT NULL,
    store_and_fwd_flag    TEXT     DEFAULT NULL,
    pu_location_id        INTEGER  DEFAULT NULL,
    do_location_id        INTEGER  DEFAULT NULL,
    payment_type          INTEGER  DEFAULT NULL,

    fare_amount           REAL     NOT NULL,
    -- clean_pipeline.py drops rows where this is <= 0 or > 500

    extra                 REAL     NOT NULL DEFAULT 0.0,
    mta_tax               REAL     NOT NULL DEFAULT 0.0,
    tip_amount            REAL     NOT NULL DEFAULT 0.0,
    tolls_amount          REAL     NOT NULL DEFAULT 0.0,
    improvement_surcharge REAL     NOT NULL DEFAULT 0.0,
    total_amount          REAL     NOT NULL,
    congestion_surcharge  REAL     DEFAULT NULL,

    -- derived columns added by feature_engineering.py after the raw insert
    trip_speed_mph        REAL     DEFAULT NULL,
    -- trip_distance / duration in hours, NULL for zero-duration trips

    time_of_day           TEXT     DEFAULT NULL,
    -- morning (06:00-11:59), afternoon (12:00-17:59), night (18:00-05:59)

    fare_per_mile         REAL     DEFAULT NULL,

    is_weekend            INTEGER  DEFAULT NULL,
    -- 1 = Saturday or Sunday, 0 = weekday. INTEGER because SQLite has no BOOLEAN

    CONSTRAINT fk_trips_pu_zone
        FOREIGN KEY (pu_location_id)
        REFERENCES zones(zone_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_trips_do_zone
        FOREIGN KEY (do_location_id)
        REFERENCES zones(zone_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    -- mirrors the drop rules in clean_pipeline.py
    CONSTRAINT chk_fare_positive
        CHECK (fare_amount > 0),

    CONSTRAINT chk_distance_non_negative
        CHECK (trip_distance >= 0),

    CONSTRAINT chk_passenger_positive
        CHECK (passenger_count > 0),

    CONSTRAINT chk_time_of_day
        CHECK (time_of_day IN ('morning', 'afternoon', 'night') OR time_of_day IS NULL),

    CONSTRAINT chk_is_weekend
        CHECK (is_weekend IN (0, 1) OR is_weekend IS NULL)

);


-- indexes: pu_location_id, do_location_id, pickup_datetime, fare_amount required by schema task spec
CREATE INDEX idx_trips_pu_location ON trips(pu_location_id);
CREATE INDEX idx_trips_do_location ON trips(do_location_id);
CREATE INDEX idx_trips_pickup_dt   ON trips(pickup_datetime);
CREATE INDEX idx_trips_fare_amount ON trips(fare_amount);

-- additional indexes for the summary API routes
CREATE INDEX idx_trips_time_of_day  ON trips(time_of_day);
CREATE INDEX idx_trips_total_amount ON trips(total_amount);
CREATE INDEX idx_geometry_zone_id   ON zone_geometry(zone_id);
