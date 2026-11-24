FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements-postgis.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements-postgis.txt || pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY data ./data

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
