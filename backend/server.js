const express = require('express');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const documentProcessor = require('./services/documentProcessor');
const aiService = require('./services/aiService');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件配置
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true
}));

// 请求限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// AI分析请求的特殊限制
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5 // limit each IP to 5 AI requests per minute
});
app.use('/api/analyze', aiLimiter);

// 解析请求体
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 文件上传配置
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('只支持PDF文件'), false);
    }
  }
});

// API路由
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 测试连接
app.post('/api/test-connection', async (req, res) => {
  try {
    const { provider, apiKey, customApiUrl, customModel } = req.body;

    const result = await aiService.testConnection(provider, apiKey, customApiUrl, customModel);

    res.json({
      success: true,
      message: result ? '连接测试成功' : '连接测试失败'
    });
  } catch (error) {
    console.error('连接测试失败:', error);
    res.status(500).json({
      success: false,
      message: `连接测试失败: ${error.message}`
    });
  }
});

// 文档分析（标准模式）
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    const {
      provider,
      apiKey,
      customApiUrl,
      customModel
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传PDF文件'
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: '请提供API密钥'
      });
    }

    console.log(`开始分析文档: ${req.file.originalname}, 大小: ${req.file.size} bytes`);

    // 解析PDF
    const extractedText = await documentProcessor.parsePdf(req.file.buffer);
    console.log(`PDF解析完成，文本长度: ${extractedText.length}`);

    // AI分阶段分析
    const analysisResults = await documentProcessor.performStagedAnalysis(
      extractedText,
      provider,
      apiKey,
      customApiUrl,
      customModel
    );

    res.json({
      success: true,
      data: analysisResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('文档分析失败:', error);
    res.status(500).json({
      success: false,
      message: `文档分析失败: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

// 文档分析（流式模式）
app.post('/api/analyze/stream', upload.single('file'), async (req, res) => {
  try {
    const {
      provider,
      apiKey,
      customApiUrl,
      customModel
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传PDF文件'
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: '请提供API密钥'
      });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:8080');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    console.log(`开始流式分析文档: ${req.file.originalname}, 大小: ${req.file.size} bytes`);

    // 解析PDF
    const extractedText = await documentProcessor.parsePdf(req.file.buffer);
    console.log(`PDF解析完成，文本长度: ${extractedText.length}`);

    // 流式分阶段分析
    const analysisResults = await documentProcessor.performStagedAnalysis(
      extractedText,
      provider,
      apiKey,
      customApiUrl,
      customModel,
      {
        stream: true,
        onProgress: (stage, chunk, fullContent) => {
          if (chunk) {
            // 发送流式数据
            res.write(`data: ${JSON.stringify({
              stage,
              chunk,
              timestamp: new Date().toISOString()
            })}\n\n`);
          } else if (stage.includes('_complete')) {
            // 发送阶段完成信号
            res.write(`data: ${JSON.stringify({
              stage,
              completed: true,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        }
      }
    );

    // 发送最终结果
    res.write(`data: ${JSON.stringify({
      stage: 'complete',
      results: analysisResults,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // 结束流
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('流式文档分析失败:', error);

    // 发送错误信息
    res.write(`data: ${JSON.stringify({
      stage: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    })}\n\n`);

    res.end();
  }
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('服务器错误:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: '文件大小超过20MB限制'
      });
    }
  }

  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    timestamp: new Date().toISOString()
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`前端URL: ${process.env.FRONTEND_URL || 'http://localhost:8080'}`);
});

module.exports = app;
