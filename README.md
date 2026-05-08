# 第一性原则复盘系统

一个纯前端个人复盘 Web App。项目代码托管在 GitHub，使用 GitHub Actions 构建，并通过 GitHub Pages 发布为公网网页。

本项目不需要登录、不连接数据库、不接 Supabase、不提供后端接口。所有复盘数据只保存在访问者自己浏览器的 localStorage 中，不会上传服务器。

## 技术栈

- Vite
- React
- localStorage
- html2canvas
- GitHub Actions
- GitHub Pages

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址，通常是 `http://localhost:5173`。

## 本地构建

```bash
npm run build
```

Vite 会生成 `dist` 目录。GitHub Actions 会上传 `dist` 并发布到 GitHub Pages。

## 本地预览

```bash
npm run preview
```

## GitHub 上传方式

```bash
git init
git add .
git commit -m "init review system"
git branch -M main
git remote add origin 仓库地址
git push -u origin main
```

注意：不要提交 `node_modules`、`dist`、`.env`、`.env.local`。

## GitHub Pages 部署方式

本仓库包含 GitHub Actions workflow：

```text
.github/workflows/deploy.yml
```

当代码 push 到 `main` 分支后，GitHub Actions 会自动执行：

1. 使用 Node.js 20。
2. 运行 `npm ci` 安装依赖。
3. 运行 `npm run build` 构建项目。
4. 上传 `dist` 目录。
5. 发布到 GitHub Pages。

部署完成后的访问地址格式为：

```text
https://用户名.github.io/仓库名/
```

当前仓库名是 `first-principles-review-system`，因此 Vite 的子路径配置在 `vite.config.js` 中设置为：

```js
base: "/first-principles-review-system/"
```

GitHub 仓库需要在 `Settings -> Pages` 中将 Source 设置为 `GitHub Actions`。

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

本系统无需登录，所有复盘数据仅保存在你的浏览器本地，不会上传服务器。清除浏览器数据或更换设备可能导致数据丢失，建议定期导出 JSON 备份。

不同用户、不同浏览器、不同设备之间的 localStorage 互相隔离。GitHub Pages 只托管静态网页文件，不接收你的复盘数据。

## 已知限制

- 换浏览器、换设备或清除浏览器数据后，本地数据会丢失。
- localStorage 容量有限，不适合保存大量图片或超长历史数据。
- 多设备之间不会自动同步。
- 导出 JSON / 导入 JSON 是手动备份能力，不是云端同步。
- 导出 PNG 依赖浏览器渲染，若浏览器禁止下载，可能需要允许下载权限。
