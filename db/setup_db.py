import sqlite3
import argparse
import os
import sys


# defaults 
DEFAULT_DB_PATH     = os.path.join(os.path.dirname(__file__), "mobility.db")
DEFAULT_SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

EXPECTED_TABLES = ["zones", "zone_geometry", "trips"]

EXPECTED_INDEXES = [
    "idx_trips_pu_location",
    "idx_trips_do_location",
    "idx_trips_pickup_dt",
    "idx_trips_fare_amount",
    "idx_trips_time_of_day",
    "idx_trips_total_amount",
    "idx_geometry_zone_id",
]


# helpers 
def read_schema(schema_path: str) -> str:
    if not os.path.exists(schema_path):
        print(f"[ERROR] Schema file not found: {schema_path}")
        sys.exit(1)
    with open(schema_path, "r", encoding="utf-8") as f:
        return f.read()


def get_existing_tables(cursor: sqlite3.Cursor) -> list[str]:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    return [row[0] for row in cursor.fetchall()]


def get_existing_indexes(cursor: sqlite3.Cursor) -> list[str]:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index';")
    return [row[0] for row in cursor.fetchall()]


def verify(cursor: sqlite3.Cursor) -> bool:
    print("\n Verification ...")

    all_ok = True

    # tables
    existing_tables = get_existing_tables(cursor)
    for table in EXPECTED_TABLES:
        status = "[OK]" if table in existing_tables else "[MISSING]"
        if table not in existing_tables:
            all_ok = False
        print(f"  table  {status:9}  {table}")

    # indexes
    existing_indexes = get_existing_indexes(cursor)
    for index in EXPECTED_INDEXES:
        status = "[OK]" if index in existing_indexes else "[MISSING]"
        if index not in existing_indexes:
            all_ok = False
        print(f"  index  {status:9}  {index}")

    print("------------------------------------------------------------------------------")
    return all_ok


def print_table_info(cursor: sqlite3.Cursor) -> None:
    """Print column info for each table so other devs can confirm the schema."""
    print("\nTable columns : ")
    for table in EXPECTED_TABLES:
        cursor.execute(f"PRAGMA table_info({table});")
        cols = cursor.fetchall()
        print(f"\n  {table} ({len(cols)} columns)")
        for col in cols:
            cid, name, col_type, notnull, default, pk = col
            pk_marker  = " PK"  if pk      else ""
            nn_marker  = " NOT NULL" if notnull else ""
            def_marker = f" DEFAULT {default}" if default is not None else ""
            print(f"    [{cid}] {name:30} {col_type:10}{pk_marker}{nn_marker}{def_marker}")
    print("------------------------------------------------------------------------------")


# main 
def setup(db_path: str, schema_path: str) -> None:
    print(f"[INFO] Database : {db_path}")
    print(f"[INFO] Schema   : {schema_path}")

    schema_sql = read_schema(schema_path)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        print("[INFO] Executing schema ...")
        # executescript handles multiple statements and implicit commits
        conn.executescript(schema_sql)
        print("[INFO] Schema executed successfully.")

        ok = verify(cursor)
        print_table_info(cursor)

        if ok:
            print("\n[OK] Database is ready. All tables and indexes confirmed.\n")
        else:
            print("\n[WARN] Some tables or indexes are missing. Check schema.sql.\n")
            sys.exit(1)

    except sqlite3.Error as e:
        print(f"\n[ERROR] SQLite error during setup: {e}")
        sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Set up the Urban Mobility SQLite database.")
    parser.add_argument(
        "--db",
        default=DEFAULT_DB_PATH,
        help=f"Path to the SQLite database file (default: {DEFAULT_DB_PATH})",
    )
    parser.add_argument(
        "--schema",
        default=DEFAULT_SCHEMA_PATH,
        help=f"Path to the SQL schema file (default: {DEFAULT_SCHEMA_PATH})",
    )
    args = parser.parse_args()

    setup(db_path=args.db, schema_path=args.schema)