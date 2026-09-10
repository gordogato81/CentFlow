# Development image.
#
# docker-compose.yml bind-mounts ./Backend/code over the working directory, so
# this image only has to provide the Python dependencies and runtime env.
# Application code is intentionally not copied in.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    APP_DIR=/var/opt/centflow \
    FLASK_APP=app.py \
    FLASK_DEBUG=1 \
    FLASK_ENV=development \
    FLASK_RUN_HOST=0.0.0.0 \
    FLASK_RUN_PORT=5000

WORKDIR ${APP_DIR}

COPY requirements-prod.txt ./

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements-prod.txt

EXPOSE 5000

CMD ["python", "-m", "flask", "run", "--host=0.0.0.0"]
