# AI产品文档审查系统

一个基于AI的智能文档质量分析工具，支持PDF文档的自动解析和多维度质量评估。

## 架构概述

本项目采用前后端分离架构：

- **前端**：纯静态HTML/CSS/JavaScript，负责用户界面和交互
- **后端**：Node.js + Express，提供API服务和AI分析功能
- **部署**：支持腾讯云服务器部署

## 功能特性

### 核心功能
- 📄 **智能文档解析**：自动解析PDF文档结构
- 🔍 **设计缺陷检查**：识别UI/UX和交互逻辑问题
- 🧠 **逻辑一致性分析**：检查文档逻辑矛盾和不一致
- ⚠️ **风险评估**：评估技术风险和业务风险
- 📊 **统计报告**：提供详细的分析统计和使用情况

### AI支持
- OpenAI GPT-4o-mini
- DeepSeek
- 自定义API支持

## 快速开始

### 环境要求
- Node.js >= 16.0.0
- npm 或 yarn

### 后端部署

1. **安装依赖**
```bash
cd backend
npm install
```

2. **配置环境变量**
```bash
cp env.example .env
# 编辑 .env 文件，配置相关参数
```

3. **启动后端服务**
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

后端默认运行在 `http://localhost:3001`

### 前端部署

1. **启动前端服务**
```bash
# 使用Python简单HTTP服务器
cd frontend
python -m http.server 8080

# 或使用其他静态文件服务器
```

前端默认运行在 `http://localhost:8080`

### 完整部署

确保后端服务正在运行，然后访问前端页面即可。

## API接口

### POST /api/analyze
文档分析接口

**请求参数：**
- `file`: PDF文件（multipart/form-data）
- `provider`: AI提供商 ('openai' | 'deepseek' | 'custom')
- `apiKey`: API密钥
- `customApiUrl`: 自定义API地址（可选）
- `customModel`: 自定义模型名称（可选）

**响应格式：**
```json
{
  "success": true,
  "data": {
    "processedDoc": {...},
    "documentStructure": "...",
    "设计缺陷检查": "...",
    "逻辑一致性分析": "...",
    "风险评估": "...",
    "usage": {...}
  }
}
```

### POST /api/test-connection
测试API连接

**请求参数：**
```json
{
  "provider": "openai",
  "apiKey": "your-api-key",
  "customApiUrl": "optional",
  "customModel": "optional"
}
```

### GET /api/health
健康检查接口

## 腾讯云部署

### 1. 服务器准备
- 购买腾讯云CVM实例（推荐配置：2核4G以上）
- 选择Ubuntu 20.04 LTS系统
- 配置安全组，开放80/443端口

### 2. 环境配置
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装PM2进程管理器
sudo npm install -g pm2

# 安装Nginx
sudo apt install nginx -y
```

### 3. 部署应用
```bash
# 克隆代码
git clone <your-repo-url>
cd ProductDocumentation

# 安装后端依赖
cd backend
npm install --production

# 配置环境变量
cp env.example .env
# 编辑 .env 文件，设置生产环境配置
```

### 4. 配置Nginx反向代理
```nginx
# /etc/nginx/sites-available/product-docs
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/ProductDocumentation/frontend;
        try_files $uri $uri/ /index.html;
    }

    # 后端API代理
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5. 启动服务
```bash
# 启动后端服务
cd /path/to/ProductDocumentation/backend
pm2 start server.js --name "product-docs-api"
pm2 save
pm2 startup

# 启动Nginx
sudo ln -s /etc/nginx/sites-available/product-docs /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. SSL证书配置（可选）
```bash
# 使用Let's Encrypt免费证书
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

## 开发说明

### 项目结构
```
ProductDocumentation/
├── backend/                 # 后端代码
│   ├── server.js           # 主服务器文件
│   ├── services/           # 业务逻辑服务
│   │   ├── aiService.js    # AI服务接口
│   │   └── documentProcessor.js  # 文档处理逻辑
│   ├── package.json        # 后端依赖
│   └── .env                # 环境变量配置
├── frontend/               # 前端代码
│   └── index.html          # 单页应用
├── README.md               # 项目文档
└── start-server.bat       # Windows启动脚本
```

### 环境变量
```env
# 服务器配置
PORT=3001
NODE_ENV=production

# 前端URL（用于CORS）
FRONTEND_URL=https://your-domain.com

# 腾讯云配置
TENCENT_CLOUD_APP_ID=your_app_id
TENCENT_CLOUD_SECRET_ID=your_secret_id
TENCENT_CLOUD_SECRET_KEY=your_secret_key
TENCENT_CLOUD_COS_BUCKET=your_bucket_name
TENCENT_CLOUD_REGION=your_region
```

## 注意事项

1. **API密钥安全**：生产环境建议使用环境变量，不要硬编码在代码中
2. **文件上传限制**：默认限制20MB，可根据需要调整
3. **并发处理**：考虑服务器资源限制，避免过多并发请求
4. **日志监控**：生产环境建议配置日志收集和监控
5. **备份策略**：定期备份数据和配置文件

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！