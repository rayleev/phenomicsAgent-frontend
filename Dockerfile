# ── Frontend Dockerfile ──
# 多阶段构建：node 构建 → nginx 托管静态资源
# 使用方式见 frontend/README.md

# ── Stage 1: Build ──
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Stage 2: Serve via nginx ──
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
