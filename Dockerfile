# ---------------------------------------------------------------------------
# Aura Edge Voice Pipeline — Unified Multi-Stage Production Dockerfile
# ---------------------------------------------------------------------------

# Stage 1: Build Expo Web Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY App.tsx index.ts app.json tsconfig.json ./
COPY src/ ./src/
COPY assets/ ./assets/

# Export static production bundle for Web
RUN npx expo export -p web

# Stage 2: Python Edge AI Pipeline Backend
FROM python:3.11-slim AS runner
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive

# Install native audio synthesis & build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    espeak-ng \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY backend/ ./

# Copy built frontend static web application into dist/
COPY --from=frontend-builder /app/dist ./dist

EXPOSE 8000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
