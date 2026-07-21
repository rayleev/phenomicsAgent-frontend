# ── Frontend: phenomicsAgent Web (Vue 3 + Vite) ──

## 环境要求

- Node.js ≥ 18

## 本地开发

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173，/api 代理到 localhost:8001）
npm run dev
```

## 构建生产包

```bash
npm run build      # 产物输出到 dist/
npm run preview    # 本地预览生产构建
```

## 目录结构

```
frontend/
├── src/
│   ├── components/    # 公共组件（AppSidebar、Composer）
│   ├── views/         # 页面（ChatView、ImagingView、LoginView…）
│   ├── composables/   # 组合式函数（useChat、useAuth、useConfig）
│   ├── router.ts      # 路由
│   └── main.ts        # 入口
├── index.html
├── vite.config.ts     # 含 /api 代理配置
└── package.json
```

## Docker 构建与运行

```bash
cd frontend

# 构建镜像（多阶段：node 构建 → nginx 托管静态资源）
docker build -t phenomics-agent-frontend .

# 运行
docker run -d --name phenomics-frontend -p 80:80 phenomics-agent-frontend
```

> 生产部署时，需把 `vite.config.ts` 中的 `/api` 代理目标指向实际后端地址，
> 或在 nginx 反向代理中转发 `/api` 到后端服务。
