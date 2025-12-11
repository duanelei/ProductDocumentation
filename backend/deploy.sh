#!/bin/bash

# 腾讯云自动部署脚本
# 使用方法: ./deploy.sh

set -e

echo "🚀 开始部署AI产品文档审查系统..."

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 16+"
    exit 1
fi

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi

# 安装依赖
echo "📦 安装后端依赖..."
npm install --production

# 创建环境变量文件
if [ ! -f .env ]; then
    echo "📝 创建环境变量文件..."
    cp env.example .env
    echo "⚠️  请编辑 .env 文件配置环境变量"
    echo "   - 设置 FRONTEND_URL"
    echo "   - 配置腾讯云相关参数（如需要）"
fi

# 构建生产版本（如果有构建步骤）
echo "🔨 执行生产构建..."
# 这里可以添加构建步骤

# 创建日志目录
mkdir -p logs

# 设置文件权限
chmod +x deploy.sh

echo "✅ 部署准备完成！"
echo ""
echo "📋 下一步操作："
echo "1. 编辑 .env 文件配置环境变量"
echo "2. 运行: npm start 启动服务"
echo "3. 或运行: pm2 start server.js --name product-docs-api"
echo "4. 配置 Nginx 反向代理"
echo ""
echo "🔗 访问地址: http://your-server-ip"
echo "📊 健康检查: http://your-server-ip/api/health"
