# hacg-web 后端镜像：Node 服务（8201），数据目录 /data（compose 中挂载持久化）
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci -w backend

COPY backend/ backend/

ENV NODE_ENV=production \
    HACG_DATA_DIR=/data

EXPOSE 8201
CMD ["node", "backend/src/index.js"]