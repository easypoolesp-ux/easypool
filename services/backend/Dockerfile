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

# Collect static files for WhiteNoise (with dummy DB URL to bypass connection during build)
RUN python manage.py collectstatic --noinput

EXPOSE 8000

# We use gunicorn for prod. Listen on the dynamic PORT system variable.
CMD ["sh", "-c", "gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --threads 4 --worker-class gthread"]
