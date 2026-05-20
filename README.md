# LifeOS 个人复盘系统

LifeOS 是一个本地优先的个人复盘 Web App，用来记录每天的时间投入、项目任务、资产分类、每日复盘和趋势仪表盘。

这个项目的交付目标很简单：

```bash
解压 -> cd 项目目录 -> ./run.sh -> 自动跑起来
```

## 一键启动

```bash
./run.sh
```

脚本会自动完成：

- 检查本机是否有 Node.js 和 npm
- 安装前端依赖
- 启动本地开发服务
- 自动打开浏览器

默认访问地址是：

```text
http://127.0.0.1:5173/
```

如果 5173 端口被占用，脚本会自动寻找后续可用端口。

## 项目结构

```text
LifeOS/
├── README.md
├── 使用指南.md
├── 设计方案.md
├── run.sh
├── .env.example
├── .gitignore
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── index.html
│   ├── vite.config.js
│   └── src/
├── backend/
│   └── cloudflare-worker/
├── data/
├── docs/
│   └── assets/
└── scripts/
```

## 常用命令

启动项目：

```bash
./run.sh
```

只安装前端依赖：

```bash
cd frontend
npm ci
```

本地开发：

```bash
cd frontend
npm run dev
```

构建静态网页：

```bash
cd frontend
npm run build
```

预览构建结果：

```bash
cd frontend
npm run preview
```

生成可导入的演示数据：

```bash
node scripts/seed_demo.mjs
```

打一个干净的分享 zip：

```bash
./scripts/package_share.sh
```

## 数据和隐私

这个项目默认不需要登录、不连接数据库、不接 Supabase，也不上传个人数据。

用户数据保存在浏览器自己的 `localStorage` 里，key 是：

```text
app:review-system:v1
```

清除浏览器数据、更换浏览器、更换设备，都会导致本地数据不可见。请在 App 的“备份”页面定期导出 JSON。

## AI 解析

“今日”页的大文本框可以接入 DeepSeek V4 Flash，把流水账整理成多条待确认记录，并自动匹配到现有分类、项目和任务。

前端不会保存或暴露 DeepSeek API Key。线上请求会先发到 Cloudflare Worker：

```text
backend/cloudflare-worker/worker.js
```

Worker 再调用 DeepSeek。部署 Worker 前需要配置：

```bash
npx wrangler secret put DEEPSEEK_API_KEY
```

## 部署说明

本项目支持 GitHub Pages。GitHub Actions workflow 位于：

```text
.github/workflows/deploy.yml
```

发布流程会进入 `frontend/` 安装依赖、运行构建，并上传 `frontend/dist` 到 GitHub Pages。

当前 Vite 子路径配置在：

```text
frontend/vite.config.js
```

默认值：

```js
base: "/first-principles-review-system/"
```

如果仓库名变了，需要同步修改这个 `base`。

## 交给别人或 agent 接手时

优先阅读：

1. `README.md`
2. `使用指南.md`
3. `设计方案.md`

不要把以下内容放进分享 zip：

- `node_modules/`
- `frontend/node_modules/`
- `dist/`
- `frontend/dist/`
- `.env`
- `.env.local`
- 真实个人备份数据

可直接运行：

```bash
./scripts/package_share.sh
```

它会自动排除依赖、构建产物、真实环境变量和 Git 历史，生成一个更适合分享的 zip。
