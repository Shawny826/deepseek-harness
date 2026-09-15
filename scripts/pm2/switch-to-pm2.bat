@echo off
chcp 65001 >nul
echo 正在停止前台命令行进程并释放 3080 端口...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3080" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo 正在由 PM2 接管启动 dsh-web...
call pm2 start dsh-web
call pm2 save
echo.
echo ======================================================
echo 切换完成！dsh-web 已由 PM2 在后台静默托管运行。
echo 请直接刷新浏览器（http://127.0.0.1:3080）继续使用。
echo ======================================================
timeout /t 3 >nul
