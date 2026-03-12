FROM python:3.9-slim

ENV APP_DIR=/var/opt/centflow
RUN mkdir -p ${APP_DIR}
WORKDIR ${APP_DIR}

COPY requirements-prod.txt /tmp/requirements-prod.txt
RUN pip3 install --upgrade pip \
    && pip3 install --no-cache-dir -r /tmp/requirements-prod.txt \
    && pip3 install --no-cache-dir OSMPythonTools

ENV FLASK_APP app.py
ENV FLASK_DEBUG 1
ENV FLASK_ENV development
ENV FLASK_RUN_HOST 0.0.0.0

CMD [ "python", "-m", "flask", "run", "--host=0.0.0.0" ]
