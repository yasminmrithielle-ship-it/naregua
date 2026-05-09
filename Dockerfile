FROM node:20-bookworm-slim AS build

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY chatbot/package.json chatbot/package.json

RUN npm ci

COPY . .

ARG VITE_API_URL=
ARG VITE_CHATBOT_URL=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_CHATBOT_URL=${VITE_CHATBOT_URL}

RUN npm run build --workspace frontend
RUN npm prune --omit=dev --workspaces

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend ./backend
COPY --from=build /app/chatbot ./chatbot
COPY --from=build /app/frontend/dist ./frontend/dist

EXPOSE 5000

CMD ["npm", "run", "start", "--workspace", "backend"]
