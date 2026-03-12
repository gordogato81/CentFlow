import atexit
import os
from datetime import datetime

from flask import Flask, jsonify, request
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool

app = Flask(__name__)

TABLE = "cluster_data"
HOST = os.environ["DB_HOST"]
DB = os.environ["POSTGRES_DB"]
DB_USER = os.environ["POSTGRES_USER"]
DB_PASS = os.environ["POSTGRES_PASSWORD"]
PORT = int(os.environ.get("DB_PORT", "5432"))

ALLOWED_SPLITS = {"week", "month"}
MAX_QUERY_RANGE_DAYS = int(os.environ.get("MAX_QUERY_RANGE_DAYS", "731"))
DB_CONNECT_TIMEOUT_S = int(os.environ.get("DB_CONNECT_TIMEOUT_S", "5"))
DB_STATEMENT_TIMEOUT_MS = int(os.environ.get("DB_STATEMENT_TIMEOUT_MS", "15000"))
DB_POOL_MINCONN = int(os.environ.get("DB_POOL_MINCONN", "1"))
DB_POOL_MAXCONN = int(os.environ.get("DB_POOL_MAXCONN", "10"))
ALLOWED_CORS_ORIGINS = {
    origin.strip()
    for origin in os.environ.get("ALLOWED_CORS_ORIGINS", "").split(",")
    if origin.strip()
}

DB_POOL = ThreadedConnectionPool(
    minconn=DB_POOL_MINCONN,
    maxconn=DB_POOL_MAXCONN,
    host=HOST,
    port=PORT,
    dbname=DB,
    user=DB_USER,
    password=DB_PASS,
    connect_timeout=DB_CONNECT_TIMEOUT_S,
    options=f"-c statement_timeout={DB_STATEMENT_TIMEOUT_MS}",
)


class ValidationError(ValueError):
    pass


def close_pool():
    if DB_POOL:
        DB_POOL.closeall()


atexit.register(close_pool)


def _parse_date(name, default_value):
    raw_value = request.args.get(name, default_value)
    try:
        return datetime.strptime(raw_value, "%Y-%m-%d").date()
    except ValueError as error:
        raise ValidationError(
            f"Invalid {name} value '{raw_value}'. Expected YYYY-MM-DD."
        ) from error


def _validate_range(start_name, end_name, default_start, default_end):
    start_date = _parse_date(start_name, default_start)
    end_date = _parse_date(end_name, default_end)
    if start_date > end_date:
        raise ValidationError(f"{start_name} must be on or before {end_name}.")
    if (end_date - start_date).days > MAX_QUERY_RANGE_DAYS:
        raise ValidationError(
            f"{start_name}/{end_name} range exceeds {MAX_QUERY_RANGE_DAYS} days."
        )
    return start_date.isoformat(), end_date.isoformat()


def _parse_split(default_value="week"):
    split = request.args.get("split", default_value)
    if split not in ALLOWED_SPLITS:
        raise ValidationError(
            f"Invalid split value '{split}'. Allowed values: week, month."
        )
    return split


def _parse_cid(default_value):
    raw_value = request.args.get("cid")
    if raw_value is None:
        return default_value
    try:
        cid = int(raw_value)
    except ValueError as error:
        raise ValidationError(f"Invalid cid value '{raw_value}'. Expected integer.") from error
    if cid < 0:
        raise ValidationError("cid must be a non-negative integer.")
    return cid


def _execute_query(query):
    connection = DB_POOL.getconn()
    try:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query)
            return cursor.fetchall()
    finally:
        connection.rollback()
        DB_POOL.putconn(connection)


@app.after_request
def apply_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin and origin in ALLOWED_CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.errorhandler(ValidationError)
def handle_validation_error(error):
    return jsonify({"error": str(error)}), 400


@app.route("/getClusterDots", methods=["GET"])
def get_cluster_dots():
    start, end = _validate_range("start", "end", "2020-01-01", "2020-01-05")
    cid = _parse_cid(56)
    query = sql.SQL(
        """
        SELECT lat, lon, SUM(tfh) AS tfh
        FROM {table}
        WHERE cid = {cid}
          AND date BETWEEN {start_date} AND {end_date}
        GROUP BY lat, lon
        ORDER BY lat, lon ASC
        """
    ).format(
        table=sql.Identifier(TABLE),
        cid=sql.Literal(cid),
        start_date=sql.Literal(start),
        end_date=sql.Literal(end),
    )
    return jsonify(_execute_query(query)), 200


@app.route("/getCentroids", methods=["GET"])
def get_centroids():
    start, end = _validate_range("start", "end", "2020-01-01", "2020-12-31")
    split = _parse_split()
    query = sql.SQL(
        """
        WITH mp AS (
            SELECT
                TO_CHAR(DATE_TRUNC({split}, TO_DATE("date", 'YYYY-MM-DD')), 'YYYY-MM-DD') AS startDate,
                TO_CHAR(
                    (
                        (DATE_TRUNC({split}, TO_DATE("date", 'YYYY-MM-DD'))::date)
                        + INTERVAL {interval}
                        - INTERVAL '1 day'
                    ),
                    'YYYY-MM-DD'
                ) AS endDate,
                ST_Collect(ST_Point(lon, lat)) AS multi,
                cid,
                SUM(tfh) AS tfh
            FROM {table}
            WHERE TO_DATE("date", 'YYYY-MM-DD') BETWEEN {start_date} AND {end_date}
              AND cid != -1
            GROUP BY cid, startDate, endDate
            ORDER BY startDate ASC
        )
        SELECT
            cid,
            ST_X(ST_Centroid(multi)) AS lon,
            ST_Y(ST_Centroid(multi)) AS lat,
            startDate,
            endDate,
            tfh
        FROM mp
        GROUP BY cid, startDate, endDate, lon, lat, tfh
        ORDER BY cid, startDate
        """
    ).format(
        table=sql.Identifier(TABLE),
        split=sql.Literal(split),
        interval=sql.Literal(f"1 {split}"),
        start_date=sql.Literal(start),
        end_date=sql.Literal(end),
    )
    return jsonify(_execute_query(query)), 200


@app.route("/getClusterGraph", methods=["GET"])
def get_cluster_graph():
    split = _parse_split()
    cid = _parse_cid(56)
    query = sql.SQL(
        """
        SELECT
            TO_CHAR(DATE_TRUNC({split}, TO_DATE("date", 'YYYY-MM-DD')), 'YYYY-MM-DD') AS startDate,
            TO_CHAR(
                (
                    (DATE_TRUNC({split}, TO_DATE("date", 'YYYY-MM-DD'))::date)
                    + INTERVAL {interval}
                    - INTERVAL '1 day'
                ),
                'YYYY-MM-DD'
            ) AS endDate,
            SUM(tfh) AS tfh
        FROM {table}
        WHERE cid = {cid}
        GROUP BY startDate, endDate
        ORDER BY startDate
        """
    ).format(
        table=sql.Identifier(TABLE),
        split=sql.Literal(split),
        interval=sql.Literal(f"1 {split}"),
        cid=sql.Literal(cid),
    )
    return jsonify(_execute_query(query)), 200


@app.route("/getClusterHull", methods=["GET"])
def get_cluster_hull():
    start1, end1 = _validate_range("start1", "end1", "2019-12-30", "2020-01-05")
    start2, end2 = _validate_range("start2", "end2", "2020-01-13", "2020-01-19")
    split = _parse_split()
    cid = _parse_cid(5)
    query = sql.SQL(
        """
        WITH mp AS (
            SELECT
                DATE_TRUNC({split}, TO_DATE("date", 'YYYY-MM-DD'))::date AS startDate,
                (
                    (DATE_TRUNC({split}, TO_DATE("date", 'YYYY-MM-DD'))::date)
                    + INTERVAL {interval}
                    - INTERVAL '1 day'
                )::date AS endDate,
                ST_Collect(ST_Point(lon, lat)) AS multi
            FROM {table}
            WHERE (
                    TO_DATE("date", 'YYYY-MM-DD') BETWEEN {start1} AND {end1}
                    OR TO_DATE("date", 'YYYY-MM-DD') BETWEEN {start2} AND {end2}
                  )
              AND cid = {cid}
            GROUP BY cid, startDate
            ORDER BY startDate ASC
        )
        SELECT
            ST_AsGeoJSON(ST_ConcaveHull(multi, 0.95)) AS hull,
            startDate,
            endDate
        FROM mp
        GROUP BY startDate, endDate, hull
        ORDER BY startDate
        """
    ).format(
        table=sql.Identifier(TABLE),
        split=sql.Literal(split),
        interval=sql.Literal(f"1 {split}"),
        start1=sql.Literal(start1),
        end1=sql.Literal(end1),
        start2=sql.Literal(start2),
        end2=sql.Literal(end2),
        cid=sql.Literal(cid),
    )
    return jsonify(_execute_query(query)), 200


if __name__ == "__main__":
    app.run()
