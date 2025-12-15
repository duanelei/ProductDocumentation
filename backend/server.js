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

    // AI分阶段分析（使用流式）
    const analysisResults = await documentProcessor.performStagedAnalysis(
      extractedText,
      provider,
      apiKey,
      customApiUrl,
      customModel,
      {
        stream: true,
        onProgress: (stage, chunk, fullContent) => {
          // 对于普通API，我们不需要实时进度反馈
          console.log(`阶段 ${stage}: ${chunk ? '接收数据中...' : '阶段完成'}`);
        }
      }
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
  console.log('收到流式分析请求');
  console.log('请求体字段:', Object.keys(req.body));
  console.log('文件信息:', req.file ? {
    originalname: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  } : '无文件');

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

    // 发送初始状态
    res.write(`data: ${JSON.stringify({
      stage: 'processing',
      message: '正在解析PDF文档...',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // 解析PDF
    const extractedText = await documentProcessor.parsePdf(req.file.buffer);
    console.log(`PDF解析完成，文本长度: ${extractedText.length}`);

    // 设置心跳机制 - 定期发送进度更新
    // 这个机制确保即使AI API响应很慢，前端也能收到更新
    let lastProgressTime = Date.now();
    let heartbeatCounter = 0;
    const heartbeatInterval = setInterval(() => {
      const timeSinceLastProgress = Date.now() - lastProgressTime;
      heartbeatCounter++;
      
      // 每15秒发送一次心跳，无论是否有进度更新
      // 这样可以确保前端知道连接仍然活跃
      try {
        const messages = [
          'AI正在处理中，请耐心等待...',
          '正在分析文档内容，这可能需要几分钟...',
          'AI服务正在响应，请稍候...',
          '分析进行中，请保持连接...'
        ];
        const message = messages[heartbeatCounter % messages.length];
        
        res.write(`data: ${JSON.stringify({
          stage: 'heartbeat',
          message: message,
          timestamp: new Date().toISOString(),
          elapsed: Math.round((Date.now() - lastProgressTime) / 1000) + '秒'
        })}\n\n`);
      } catch (e) {
        // 如果连接已关闭，清除定时器
        console.error('发送心跳失败，连接可能已关闭:', e.message);
        clearInterval(heartbeatInterval);
      }
    }, 15000); // 每15秒发送一次心跳

    // 流式分阶段分析
    try {
      const analysisResults = await documentProcessor.performStagedAnalysis(
        extractedText,
        provider,
        apiKey,
        customApiUrl,
        customModel,
        {
          stream: true,
          onProgress: (stage, chunk, fullContent) => {
            lastProgressTime = Date.now(); // 更新最后进度时间
            console.log(`流式进度: ${stage}, chunk长度: ${chunk ? chunk.length : 0}`);
            
            if (chunk) {
              // 发送流式数据
              const data = {
                stage,
                chunk,
                timestamp: new Date().toISOString()
              };
              const dataStr = `data: ${JSON.stringify(data)}\n\n`;
              console.log(`发送流式数据: ${dataStr.substring(0, 100)}...`);
              try {
                res.write(dataStr);
              } catch (e) {
                console.error('写入流式数据失败:', e);
                clearInterval(heartbeatInterval);
              }
            } else if (stage.includes('_complete')) {
              // 发送阶段完成信号
              const completionData = {
                stage,
                completed: true,
                timestamp: new Date().toISOString()
              };

              // 对于structure_complete，添加更多信息
              if (stage === 'structure_complete' && fullContent) {
                completionData.sectionCount = fullContent.sections?.length || 0;
                completionData.documentSummary = fullContent.document_summary || '';
              }

              try {
                res.write(`data: ${JSON.stringify(completionData)}\n\n`);
              } catch (e) {
                console.error('写入完成数据失败:', e);
                clearInterval(heartbeatInterval);
              }
            } else {
              // 其他类型的进度更新（比如"正在连接AI服务"）
              const progressData = {
                stage,
                chunk: chunk || '',
                message: chunk || '处理中...',
                timestamp: new Date().toISOString()
              };
              try {
                res.write(`data: ${JSON.stringify(progressData)}\n\n`);
              } catch (e) {
                console.error('写入进度数据失败:', e);
                clearInterval(heartbeatInterval);
              }
            }
          }
        }
      );

      // 清除心跳定时器
      clearInterval(heartbeatInterval);

      // 发送最终结果
      // 确保 usage 信息被包含在结果中，并且总是存在（即使是 null）
      const finalResults = {
        ...analysisResults,
        usage: (analysisResults && analysisResults.usage) ? analysisResults.usage : null
      };
      
      // 确保 finalResults 包含所有必需的字段
      if (!finalResults.processedDoc) {
        console.warn('finalResults 缺少 processedDoc');
      }
      
      console.log('发送最终结果，包含字段:', Object.keys(finalResults));
      console.log('usage 信息:', finalResults.usage);
      
      res.write(`data: ${JSON.stringify({
        stage: 'complete',
        results: finalResults,
        timestamp: new Date().toISOString()
      })}\n\n`);

      // 结束流
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (analysisError) {
      // 清除心跳定时器
      clearInterval(heartbeatInterval);
      throw analysisError;
    }

    // 这部分代码已经移到上面的try块中

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
