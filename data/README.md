# data 目录说明

这里可以放示例数据、演示备份或本地测试数据。

不要放真实个人隐私数据。

浏览器真实运行数据不在这个目录里，而是在浏览器 `localStorage` 中：

```text
app:review-system:v1
```

生成演示备份：

```bash
node scripts/seed_demo.mjs
```

生成后会得到：

```text
data/demo-backup.json
```

可以在 App 的“备份”页面导入这个文件。
