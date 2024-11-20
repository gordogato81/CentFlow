from crypt import methods
from multiprocessing import connection

import psycopg2.sql
from flask import Flask, jsonify, request
from flask_cors import CORS

import os
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
CORS(app)

TABLE = 'cluster_data'
HOST = os.environ['DB_HOST']
DB = os.environ['POSTGRES_DB']
DB_USER = os.environ['POSTGRES_USER']
DB_PASS = os.environ['POSTGRES_PASSWORD']
PORT = os.environ['DB_PORT']


@app.route('/getClusterDots', methods=["GET", "POST"])
def getClusterDots():
    connection = psycopg2.connect(
        host=HOST, port=5432, dbname=DB, user=DB_USER, password=DB_PASS)

    start = request.args.get("start", "2020-01-01", type=str)
    end = request.args.get("end", "2020-01-05", type=str)
    cid = request.args.get("cid", 56, type=int)
    query = psycopg2.sql.SQL("""
    select lat, lon, sum(tfh) as tfh
    from {table}
    where cid = {CID}
    and date between {start_date} and {end_date}
    group by lat, lon
    order by lat, lon asc
    """).format(table=psycopg2.sql.Identifier(TABLE) ,CID=psycopg2.sql.Literal(cid), start_date=psycopg2.sql.Literal(start), end_date=psycopg2.sql.Literal(end))

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        # query = cursor.mogrify(query, (cid, start, end))
        cursor.execute(query)
        results = cursor.fetchall()

    return jsonify(results), 200


@app.route('/getCentroids', methods=['GET', 'POST'])
def getCentroids():
    connection = psycopg2.connect(host=HOST, port=5432,
                                  dbname=DB, user=DB_USER, password=DB_PASS)

    start = request.args.get("start", "2020-01-01", type=str)
    end = request.args.get("end", "2020-12-31", type=str)
    split = request.args.get("split", "week", type=str)
    query = psycopg2.sql.SQL("""
    with mp as (
        select to_char(date_trunc({splt}, TO_DATE("date", 'YYYY-MM-DD')), 'YYYY-MM-DD') as startDate, 
        to_char(((date_trunc({splt}, TO_DATE("date", 'YYYY-MM-DD'))::date) + interval {inter} - interval '1 day'), 'YYYY-MM-DD') as endDate,
        ST_collect(ST_Point(lon, lat)) as multi, cid, sum(tfh) as tfh
        from {table}
        where TO_DATE("date", 'YYYY-MM-DD') between {start_date} and {end_date} 
        and cid != -1
        group by cid, startDate, endDate
        order by startDate asc
    )

    select cid, ST_X(ST_Centroid(multi)) as lon, ST_Y(ST_Centroid(multi)) as lat, startDate, endDate, tfh
    from mp 
    group by cid, startDate, endDate, lon, lat, tfh
    order by cid, startDate
    """).format(table=psycopg2.sql.Identifier(TABLE), splt=psycopg2.sql.Literal(split), inter=psycopg2.sql.Literal("1 " + split), start_date=psycopg2.sql.Literal(start), end_date=psycopg2.sql.Literal(end))

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        # query = cursor.mogrify(query, (split, split, "1 " + split, start, end))
        cursor.execute(query)
        results = cursor.fetchall()

    return jsonify(results), 200


@app.route('/getClusterGraph', methods=['GET', 'POST'])
def getClusterGraph():
    connection = psycopg2.connect(host=HOST, port=5432,
                                  dbname=DB, user=DB_USER, password=DB_PASS)
    # start = request.args.get("start", "2020-01-01", type=str)
    # end = request.args.get("end", "2020-12-31", type=str)
    split = request.args.get("split", "week", type=str)
    cid = request.args.get("cid", 56, type=int)
    query = psycopg2.sql.SQL("""
    select 
        to_char(DATE_TRUNC({splt}, TO_DATE("date", 'YYYY-MM-DD')), 'YYYY-MM-DD') as startDate, 
        to_char(((DATE_TRUNC({splt}, TO_DATE("date", 'YYYY-MM-DD'))::date) + interval {inter} - interval '1 day'), 'YYYY-MM-DD') as endDate,
        sum(tfh) as tfh
    from {table}
    where cid = {CID}
    group by startDate, endDate
    order by startDate
    """).format(table=psycopg2.sql.Identifier(TABLE), splt=psycopg2.sql.Literal(split), inter=psycopg2.sql.Literal("1 " + split), CID=psycopg2.sql.Literal(cid))

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        query = cursor.mogrify(query, (split, split, "1 " + split, cid))
        cursor.execute(query)
        results = cursor.fetchall()

    return jsonify(results), 200


@app.route('/getClusterHull', methods=['GET', 'POST'])
def getClusterHull():
    connection = psycopg2.connect(host=HOST, port=5432,
                                  dbname=DB, user=DB_USER, password=DB_PASS)
    start1 = request.args.get("start1", "2019-12-30", type=str)
    end1 = request.args.get("end1", "2020-01-05", type=str)
    start2 = request.args.get("start2", "2020-01-13", type=str)
    end2 = request.args.get("end2", "2020-01-19", type=str)
    split = request.args.get("split", "week", type=str)
    cid = request.args.get("cid", 5, type=int)
    query = psycopg2.sql.SQL("""
    with mp as (
        select date_trunc({splt}, TO_DATE("date", 'YYYY-MM-DD'))::date as startDate, 
        ((date_trunc({splt}, TO_DATE("date", 'YYYY-MM-DD'))::date) + interval {inter} - interval '1 day')::date as endDate,
        ST_collect(ST_Point(lon, lat)) as multi
        from {table}
        where (TO_DATE("date", 'YYYY-MM-DD') between {startd1} and {endd1} 
        or TO_DATE("date", 'YYYY-MM-DD') between {startd2} and {endd2})
        and cid = {CID}
        group by cid, startDate
        order by startDate asc
    )

    select ST_AsGeoJSON(ST_ConcaveHull(multi, 0.95)) as hull, startDate, endDate
    from mp 
    group by startDate, endDate, hull
    order by startDate
    """).format(table=psycopg2.sql.Identifier(TABLE), splt=psycopg2.sql.Literal(split), inter=psycopg2.sql.Literal("1 " + split), startd1=psycopg2.sql.Literal(start1), endd1=psycopg2.sql.Literal(end1), startd2=psycopg2.sql.Literal(start2), endd2=psycopg2.sql.Literal(end2), CID=psycopg2.sql.Literal(cid))

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        # query = cursor.mogrify(query, (split, split, "1 " + split, start1, end1, start2, end2, cid))
        cursor.execute(query)
        results = cursor.fetchall()

    return jsonify(results), 200

if __name__ == "__main__":
    # app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
    app.run()