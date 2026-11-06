# Một image chạy toàn bộ hệ thống: backend FastAPI phục vụ API, ảnh và bản dựng giao diện React trên cùng một địa chỉ.
# Dùng cho Render (render.yaml). Chạy bằng Docker Compose thì xem infra/.

FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
ARG VITE_DEMO_ACCOUNTS=false
ENV VITE_API_URL=/api/v1 VITE_DEMO_ACCOUNTS=$VITE_DEMO_ACCOUNTS
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FRONTEND_DIR=/app/frontend
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/alembic.ini .
COPY backend/migrations ./migrations
COPY backend/app ./app
COPY --from=frontend /app/dist ./frontend

RUN useradd --create-home appuser
USER appuser

EXPOSE 10000
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed auto && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips='*'"]
