# AI 产品文档审查系统（纯前端版本）

一个完全在浏览器中运行的AI产品文档审查工具，无需后端服务器。

## 功能特点
- 📄 PDF文档解析（使用pdf.js）
- 🤖 AI分析（直接调用OpenAI API）
- 🎯 多维度审查（设计缺陷、逻辑一致性、技术方案、风险评估）
- 💾 本地存储API密钥
- 📊 结果可视化与导出
- 🔄 无状态设计，刷新即清空

## 快速开始

### 1. 获取OpenAI API密钥
访问 [OpenAI平台](https://platform.openai.com/api-keys) 获取API密钥。

### 2. 运行项目
```bash
# 安装依赖（可选，用于本地开发服务器）
npm install

# 启动本地服务器
npm start
# 或直接使用npx
npx serve frontend -l 3000
```

### 3. 使用步骤
1. 在页面顶部输入您的OpenAI API密钥并点击"保存密钥"
2. 上传PDF文档（最大20MB）
3. 点击"开始分析"进行AI审查
4. 查看分析结果，支持导出JSON或复制摘要

## 部署方式

### 静态托管
直接将 `frontend/` 目录部署到任意静态网站托管服务：
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- 任何支持静态文件的服务器

### 本地运行
使用任意静态文件服务器：
```bash
# 使用Python
python -m http.server 8000

# 使用Node.js
npx serve frontend -l 3000

# 或直接在浏览器中打开index.html
```

## 项目结构
```
.
├── frontend/
│   └── index.html          # 单页应用主文件
├── package.json            # 项目配置和脚本
└── README.md              # 项目说明
```

## 安全说明
- API密钥仅存储在浏览器本地存储中
- 不会上传PDF文件内容到任何服务器
- 所有AI分析都在客户端完成
- 适合个人使用，不建议在公共环境中部署

## 技术栈
- **前端框架**: 原生JavaScript + HTML5
- **PDF解析**: pdf.js
- **AI服务**: OpenAI GPT-4o-mini
- **样式**: 原生CSS
- **部署**: 纯静态文件

## 浏览器兼容性
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 自定义配置
如需修改AI分析提示词或模型，请编辑 `frontend/index.html` 中的 `buildOpenAIRequest` 函数。

## 许可证
MIT License