FROM postgis/postgis:15-3.5-alpine

RUN apk add --no-cache gosu=1.19-r4 \
    && rm /usr/local/bin/gosu

COPY AirBioDB.sql /docker-entrypoint-initdb.d/
