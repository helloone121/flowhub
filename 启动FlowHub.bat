@echo off
chcp 65001 >nul
title FlowHub 本地服务
cd /d "%~dp0"

echo ============================================
echo   FlowHub 本地启动
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js LTS
  echo 下载地址: https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] 首次运行，正在安装依赖，请耐心等待...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重试
    pause
    exit /b 1
  )
) else (
  echo [1/3] 依赖已就绪
)

if not exist ".next\BUILD_ID" (
  echo [2/3] 首次运行，正在构建生产版本，约 1-2 分钟...
  call npm run build
  if errorlevel 1 (
    echo [错误] 构建失败
    pause
    exit /b 1
  )
) else (
  echo [2/3] 构建已存在，直接启动
)

echo [3/3] 启动服务...
echo.
echo 服务地址: http://localhost:3000
echo 关闭此窗口即停止服务
echo.

start "" "http://localhost:3000"
call npm run start
pause
