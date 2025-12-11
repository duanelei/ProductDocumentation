#!/bin/bash

echo "============================================"
echo "AI产品文档审查系统 - 前后端启动脚本"
echo "============================================"

# 检查Node.js
echo "[1/4] 检查Node.js安装..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js未安装，请先安装Node.js 16+"
    exit 1
fi

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm未安装"
    exit 1
fi

# 启动后端服务
echo "[2/4] 启动后端API服务..."
cd backend

if [ ! -d "node_modules" ]; then
    echo "安装后端依赖..."
    npm install
fi

echo "启动后端服务 (端口: 3001)..."
npm start &
BACKEND_PID=$!

cd ..

# 等待后端启动
echo "[3/4] 等待后端服务启动..."
sleep 3

# 检查后端健康状态
if curl -f http://localhost:3001/api/health &> /dev/null; then
    echo "✅ 后端服务启动成功"
else
    echo "⚠️  后端服务可能未完全启动，请检查日志"
fi

# 启动前端服务
echo "[4/4] 启动前端服务..."
cd frontend

echo "启动前端服务 (端口: 8080)..."

# 尝试多种方式启动前端服务
if command -v python3 &> /dev/null; then
    python3 -m http.server 8080 &
elif command -v python &> /dev/null; then
    python -m http.server 8080 &
elif command -v npx &> /dev/null; then
    npx serve . -l 8080 &
else
    echo "❌ 未找到合适的静态文件服务器"
    echo "请手动启动前端服务，提供frontend目录的静态文件服务"
fi

FRONTEND_PID=$!

cd ..

echo ""
echo "============================================"
echo "🎉 服务启动完成！"
echo ""
echo "📱 前端访问地址: http://localhost:8080"
echo "🔧 后端API地址:  http://localhost:3001"
echo "💚 健康检查:     http://localhost:3001/api/health"
echo ""
echo "🛑 按 Ctrl+C 停止所有服务"
echo "============================================"

# 等待用户中断
trap "echo '正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

wait
