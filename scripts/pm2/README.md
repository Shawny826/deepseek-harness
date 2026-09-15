# DeepSeek Harness PM2 托管运维脚本集

提供在 Windows 平台下将 DeepSeek Harness 从前台命令行切换为 PM2 后台常驻服务的工具。

## 文件说明

- `switch-to-pm2.bat`:
  自动检测并清理占用 3080 端口的前台进程，启动 PM2 `dsh-web` 托管并保存进程状态。
- `dsh-pm2-runner.mjs`:
  供 PM2 直接加载全局 DSH 二进制的 ESM 引导入口。

## 使用方法

1. 确保全局已安装 PM2:
   ```bash
   npm install -g pm2
   ```
2. 双击运行 `switch-to-pm2.bat`，即可实现前后台一键平滑切换。
