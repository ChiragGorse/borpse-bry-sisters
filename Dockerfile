# The Borpse Bry Sisters game server: serves the game and runs multiplayer rooms.
#   docker build -t borpse . && docker run -p 8080:8080 borpse
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run server:build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
EXPOSE 8080
USER node
CMD ["node", "dist-server/server.mjs"]
