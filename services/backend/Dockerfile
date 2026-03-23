FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    gdal-bin \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy project
COPY . .

# Collect static files for WhiteNoise
RUN python manage.py collectstatic --noinput

# SAFETY NET 1: Syntax & Configuration
# Instantly catches missing imports, bad syntax, or broken URL patterns.
RUN DB_ENGINE=django.db.backends.dummy python manage.py check

# SAFETY NET 2: Database Integrity
# Fails the build immediately if someone forgot to run `makemigrations` locally.
RUN DB_ENGINE=django.db.backends.dummy python manage.py makemigrations --check --dry-run || \
    (echo "--- MIGRATION MISMATCH DETECTED ---" && \
    echo "The following uncommitted changes were found:" && \
    DB_ENGINE=django.db.backends.dummy python manage.py makemigrations --dry-run && \
    exit 1)

EXPOSE 8000

# We run migrations before starting the web server with uvicorn for async/SSE support
CMD ["sh", "-c", "python manage.py migrate && gunicorn config.asgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --worker-class uvicorn.workers.UvicornWorker"]
