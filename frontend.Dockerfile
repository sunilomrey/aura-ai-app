# ---------------------------------------------------------------------------
# Aura React Native / Expo Web Frontend Dockerfile
# ---------------------------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Install Node dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application source code
COPY . .

EXPOSE 8081

ENV CI=1 \
    EXPO_USE_METRO_WORKSPACE_ROOT=1

CMD ["npx", "expo", "start", "--web", "--port", "8081", "--host", "lan"]
