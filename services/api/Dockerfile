FROM python:3.12-slim

# 2. Stop Python from writing .pyc files and prevent stdout buffering
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 3. Set the working directory inside the container
WORKDIR /app

COPY services/api/requirements.txt .

# 5. Install the dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY services/api/ .
COPY ml/artifacts/dwell_model_v2.joblib ml/artifacts/dwell_model_v2.joblib
COPY ml/artifacts/model_metadata_v2.json ml/artifacts/model_metadata_v2.json

ENV MODEL_PATH=/app/ml/artifacts/dwell_model_v2.joblib
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && python -m scripts.seed_reference && python scripts/seed_capacity.py && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
