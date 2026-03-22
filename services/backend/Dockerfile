FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Collect static files for WhiteNoise
RUN python manage.py collectstatic --noinput

# SAFETY NET 1: Syntax & Configuration
# Instantly catches missing imports, bad syntax, or broken URL patterns.
RUN python manage.py check

# SAFETY NET 2: Database Integrity
# Fails the build immediately if someone forgot to run `makemigrations` locally.
RUN python manage.py makemigrations --check --dry-run

EXPOSE 8000

# We run migrations before starting the web server
CMD ["sh", "-c", "python manage.py migrate && gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --threads 4 --worker-class gthread"]
