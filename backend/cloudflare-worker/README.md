# Cloudflare Worker 后端说明

这个目录是 AI 解析服务扩展点。默认 `./run.sh` 不会启动它；线上前端会把“今日”页的大文本框提交到这个 Worker，再由 Worker 调用 DeepSeek。

Worker 文件：

```text
backend/cloudflare-worker/worker.js
```

它提供：

```text
GET  /health
POST /api/parse-journal
```

部署前需要配置 DeepSeek API key：

```bash
npx wrangler secret put DEEPSEEK_API_KEY
```

默认模型是 DeepSeek V4 Flash：

```text
deepseek-v4-flash
```

如需覆盖模型，可配置：

```bash
npx wrangler secret put DEEPSEEK_MODEL
```

前端默认请求：

```text
https://lifeos-proxy.gaopengju.workers.dev/api/parse-journal
```

如果 Worker URL 不同，在 `frontend/.env.local` 设置：

```bash
VITE_LIFEOS_AI_PROXY_URL=https://你的-worker域名/api/parse-journal
```

不要把真实 key 写进仓库。根目录 `.env.example` 只用于说明变量名。
