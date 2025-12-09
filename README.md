# AI 产品文档审查系统（Cloudflare Pages + Worker）

## 快速开始（本地预览前端）
1. 安装依赖：无需构建工具，纯静态页面。
2. 本地起一个静态服务（任选其一）：
   - `npx serve frontend`
   - 或 VS Code Live Server 打开 `frontend/index.html`
3. 打开页面，上传 PDF，前端用 pdf.js 解析并调用 `/api/ai-analyze`。

## 部署到 Cloudflare
- 前端：`frontend/` 直接部署到 Cloudflare Pages，路由根指向首页。
- 后端：`worker/worker.js` 作为 Cloudflare Worker，绑定路由 `/api/ai-analyze*`。
- 环境变量：在 Worker 设置 `OPENAI_API_KEY`（或兼容 OpenAI 的模型密钥）。

## 目录
- `frontend/index.html`：单页应用，包含上传校验、pdf.js 解析、进度状态机、结果面板、导出/复制。
- `worker/worker.js`：AI 代理，无状态转发大模型，返回结构化 JSON。

## 交互流程
1) 选择 PDF（前端校验类型/大小）。  
2) pdf.js 解析文本（不上传原文件）。  
3) 单次调用 `/api/ai-analyze`，携带全部需求。  
4) 前端渲染结果，支持导出 JSON、复制摘要、重新分析。  
5) 无数据库，刷新即清空。  

## 提示
- 如果 PDF 很大，可在 `buildRequest` 截断或分段摘要后再拼接。
- 若需严格来源控制，可在 Worker 中校验 `Origin`，或要求简单 token。  
- 如需替换模型，请调整 `model` 字段与上游 API 域名。