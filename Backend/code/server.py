from crypt import methods
from multiprocessing import connection
from flask import Flask, jsonify, request
from flask_cors import CORS
import json

import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
CORS(app)

table = 'test_table'


@app.route("/")
def home():
    return "Hello, Flask!"


@app.route('/getClusterDots', methods=["GET", "POST"])
def getClusterDots():
    connection = psycopg2.connect(
        host="charon04.inf.uni-konstanz.de", port=5432, dbname="fishingdb", user="wittekindt", password="HLFiqcjkJLOfcfOysnLR")

    start = request.args.get("start", "2020-01-01", type=str)
    end = request.args.get("end", "2020-01-05", type=str)
    cid = request.args.get("cid", 56, type=int)
    query = """
    select lat, lon, sum(tfh) as tfh
    from test_table
    where cid = %s
    and date between %s and %s
    group by lat, lon
    order by lat, lon asc
    """

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        query = cursor.mogrify(query, (cid, start, end))
        cursor.execute(query)
        results = cursor.fetchall()

    # {"points": pixels}
    return jsonify(results), 200


@app.route('/getCentroids', methods=['GET', 'POST'])
def getCentroids():
    connection = psycopg2.connect(host="charon04.inf.uni-konstanz.de", port=5432,
                                  dbname="fishingdb", user="wittekindt", password="HLFiqcjkJLOfcfOysnLR")

    start = request.args.get("start", "2020-01-01", type=str)
    end = request.args.get("end", "2020-12-31", type=str)
    split = request.args.get("split", "week", type=str)
    query = """
    with mp as (
        select to_char(date_trunc(%s, "date"), 'YYYY-MM-DD') as startDate, 
        to_char(((date_trunc(%s, "date")::date) + interval %s - interval '1 day'), 'YYYY-MM-DD') as endDate,
        ST_collect(ST_Point(lon, lat)) as multi, cid, sum(tfh) as tfh
        from test_table
        where date between %s and %s 
        and cid != -1
        group by cid, startDate, endDate
        order by startDate asc
    )

    select cid, ST_X(ST_Centroid(multi)) as lon, ST_Y(ST_Centroid(multi)) as lat, startDate, endDate, tfh
    from mp 
    group by cid, startDate, endDate, lon, lat, tfh
    order by cid, startDate
    """

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        query = cursor.mogrify(query, (split, split, "1 " + split, start, end))
        cursor.execute(query)
        results = cursor.fetchall()

    return jsonify(results), 200


@app.route('/getClusterGraph', methods=['GET', 'POST'])
def getClusterGraph():
    connection = psycopg2.connect(host="charon04.inf.uni-konstanz.de", port=5432,
                                  dbname="fishingdb", user="wittekindt", password="HLFiqcjkJLOfcfOysnLR")

    # start = request.args.get("start", "2020-01-01", type=str)
    # end = request.args.get("end", "2020-12-31", type=str)
    split = request.args.get("split", "week", type=str)
    cid = request.args.get("cid", 56, type=int)
    query = """
    select to_char(DATE_TRUNC(%s, "date"), 'YYYY-MM-DD') as startDate, to_char(((DATE_TRUNC(%s, "date")::date) + interval %s - interval '1 day'), 'YYYY-MM-DD') as endDate,  sum(tfh) as tfh
    from test_table
    where cid = %s
    group by startDate, endDate
    order by startDate
    """

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        query = cursor.mogrify(query, (split, split, "1 " + split, cid))
        cursor.execute(query)
        results = cursor.fetchall()

    return jsonify(results), 200

@app.route('/getClusterHull', methods=['GET', 'POST'])
def getClusterHull():
    connection = psycopg2.connect(host="charon04.inf.uni-konstanz.de", port=5432,
                                  dbname="fishingdb", user="wittekindt", password="HLFiqcjkJLOfcfOysnLR")

    start1 = request.args.get("start1", "2019-12-30", type=str)
    end1 = request.args.get("end1", "2020-01-05", type=str)
    start2 = request.args.get("start2", "2020-01-13", type=str)
    end2 = request.args.get("end2", "2020-01-19", type=str)
    split = request.args.get("split", "week", type=str)
    cid = request.args.get("cid", 5, type=int)
    query = """
    with mp as (
        select date_trunc(%s, "date")::date as startDate, 
        ((date_trunc(%s, "date")::date) + interval %s - interval '1 day')::date as endDate,
        ST_collect(ST_Point(lon, lat)) as multi
        from test_table
        where (date between %s and %s
        or date between %s and %s)
        and cid = %s
        group by cid, startDate
        order by startDate asc
    )

    select ST_AsGeoJSON(ST_ConcaveHull(multi, 0.95)) as hull, startDate, endDate
    from mp 
    group by startDate, endDate, hull
    order by startDate
    """

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        query = cursor.mogrify(query, (split, split, "1 " + split, start1, end1, start2, end2, cid))
        cursor.execute(query)
        results = cursor.fetchall()

    return jsonify(results), 200