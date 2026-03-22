FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for psycopg2
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=5000
ENV EVENTLET_NO_GREENDNS=yes

EXPOSE 5000

# Use gunicorn with eventlet workers for production
CMD ["gunicorn", "-b", "0.0.0.0:5000", "-k", "eventlet", "server:app"]
