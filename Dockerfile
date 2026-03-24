FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
EXPOSE 8789
CMD ["node", "src/server.js"]
