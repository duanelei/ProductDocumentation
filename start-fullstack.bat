@echo off
echo ============================================
echo AI产品文档审查系统 - 前后端启动脚本
echo ============================================

echo [1/4] 检查Node.js安装...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js未安装，请先安装Node.js 16+
    pause
    exit /b 1
)

echo [2/4] 启动后端API服务...
cd backend
if not exist node_modules (
    echo 安装后端依赖...
    npm install
)

echo 启动后端服务 (端口: 3001)...
start "Backend API" cmd /k "npm start"

cd ..

echo [3/4] 启动前端服务...
cd frontend
echo 启动前端服务 (端口: 8080)...

python -m http.server 8080
if errorlevel 1 (
    echo Python未找到，尝试使用Node.js serve...
    npx serve . -l 8080
)

echo [4/4] 服务启动完成！
echo ============================================
echo 前端访问地址: http://localhost:8080
echo 后端API地址:  http://localhost:3001
echo 健康检查:     http://localhost:3001/api/health
echo ============================================
pause
