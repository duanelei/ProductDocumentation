# 多阶段构建 - AI产品文档审查系统后端

# 第一阶段：构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖（包括devDependencies，用于构建）
RUN npm ci --only=production && npm cache clean --force

# 第二阶段：生产阶段
FROM node:18-alpine AS production

# 安装系统依赖
RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/*

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# 复制package文件
COPY package*.json ./

# 从构建阶段复制node_modules
COPY --from=builder /app/node_modules ./node_modules

# 复制应用代码
COPY . .

# 更改文件所有权
RUN chown -R nextjs:nodejs /app
USER nextjs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js

# 使用dumb-init启动应用
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
