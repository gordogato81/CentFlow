# FROM postgres:15.3-alpine

# ENV POSTGRES_DB="AIRBIO_DB"
# ENV POSTGRES_USER="AIRBIO_USER"
# ENV POSTGRES_PASSWORD="SJY1!@BCU3YB#%@!#"

# FROM postgres:15.3-alpine
FROM postgis/postgis:15-3.4-alpine

COPY AirBioDB.sql /docker-entrypoint-initdb.d/

# ENV POSTGRES_DB_FILE=/run/secrets/postgres-db
# ENV POSTGRES_USER_FILE=/run/secrets/postgres-user
# ENV POSTGRES_PASSWORD_FILE=/run/secrets/postgres-passwd