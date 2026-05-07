# 第一性原则复盘系统

一个公开访问、本地数据保存的个人复盘 Web App。它适合部署到 Vercel，任何人打开公网链接即可使用；不需要登录，不连接数据库，不连接 Supabase，也不调用后端 API。

## 技术栈

- Vite
- React
- localStorage
- html2canvas
- Vercel 静态部署

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址，通常是 `http://localhost:5173`。

## 构建方式

```bash
npm run build
```

Vite 会生成 `dist` 目录，Vercel 部署时的 Output Directory 填 `dist`。

## GitHub 上传方式

第一步：上传 GitHub

```bash
git init
git add .
git commit -m "init review system"
git branch -M main
git remote add origin 仓库地址
git push -u origin main
```

注意：不要提交 `node_modules`、`dist`、`.env`、`.env.local`。

## Vercel 部署方式

第二步：进入 Vercel

- Import Git Repository
- 选择 GitHub 仓库
- Framework Preset 选择 Vite
- Build Command 填 `npm run build`
- Output Directory 填 `dist`
- 点击 Deploy

第三步：部署完成后获得公网链接

例如：

```text
https://review-system.vercel.app
```

本项目包含 `vercel.json`，刷新页面会回退到 `index.html`，避免静态前端路由刷新 404。

## localStorage 数据说明

所有用户数据都保存在当前浏览器的 localStorage 中，统一 key 为：

```text
app:review-system:v1
```

数据结构：

```json
{
  "projects": [],
  "tasks": [],
  "ideas": [],
  "events": [],
  "categories": [],
  "reviews": [],
  "settings": {
    "theme": "dark-purple",
    "activeProjectId": null,
    "lastOpenDate": ""
  }
}
```

页面初始化时会读取该 key。没有数据时会生成默认结构和预设分类；数据损坏或 JSON 解析失败时，会自动回退到默认结构，避免页面崩溃。

## 用户隐私说明

本系统无需登录，所有复盘数据仅保存在你的浏览器本地，不会上传服务器。清除浏览器数据或更换设备可能导致数据丢失，建议定期导出备份。

不同用户、不同浏览器、不同设备之间的 localStorage 互相隔离。Vercel 只托管静态网页文件，不接收你的复盘数据。

## 已知限制

- 换浏览器、换设备或清除浏览器数据后，本地数据会丢失。
- localStorage 容量有限，不适合保存大量图片或超长历史数据。
- 多设备之间不会自动同步。
- 当前导出 JSON / 导入 JSON 是手动备份能力，不是云端同步。
- 导出 PNG 依赖浏览器渲染，若浏览器禁止下载，可能需要允许下载权限。
