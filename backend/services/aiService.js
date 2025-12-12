const axios = require('axios');

/**
 * AI服务模块 - 处理与AI API的交互
 */
class AIService {
  /**
   * 测试API连接
   */
  async testConnection(provider, apiKey, customApiUrl, customModel) {
    try {
      const payload = {
        model: this.getModelName(provider, customModel),
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5
      };

      const response = await this.makeRequest(
        this.getApiUrl(provider, customApiUrl),
        payload,
        apiKey
      );

      return response.status === 200;
    } catch (error) {
      console.error('API连接测试失败:', error.message);
      return false;
    }
  }

  /**
   * 调用AI API（标准模式）
   */
  async callAI(provider, apiKey, customApiUrl, customModel, messages, maxTokens = 4000) {
    // 检查消息总长度，避免超出API限制
    const totalLength = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    console.log(`Total message length: ${totalLength} characters`);

    // 如果消息太长，尝试截断
    let processedMessages = messages;
    if (totalLength > 100000) { // DeepSeek可能有长度限制
      console.warn('Messages too long, truncating...');
      // 保留系统消息和最新的用户消息
      processedMessages = [
        messages[0], // 系统消息
        ...messages.slice(-2) // 最后两条消息
      ];
    }

    const payload = {
      model: this.getModelName(provider, customModel),
      messages: processedMessages,
      max_tokens: Math.min(maxTokens, 2000), // 减少输出长度
      temperature: provider === 'deepseek' ? 0.7 : 0.2
    };

    return await this.makeRequest(
      this.getApiUrl(provider, customApiUrl),
      payload,
      apiKey
    );
  }

  /**
   * 调用AI API（流式模式）
   */
  async callAIStream(provider, apiKey, customApiUrl, customModel, messages, maxTokens = 4000, onChunk) {
    // 检查消息总长度，避免超出API限制
    const totalLength = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    console.log(`Stream mode - Total message length: ${totalLength} characters`);

    // 如果消息太长，尝试截断
    let processedMessages = messages;
    if (totalLength > 100000) {
      console.warn('Messages too long, truncating...');
      processedMessages = [
        messages[0], // 系统消息
        ...messages.slice(-2) // 最后两条消息
      ];
    }

    const payload = {
      model: this.getModelName(provider, customModel),
      messages: processedMessages,
      max_tokens: Math.min(maxTokens, 2000),
      temperature: provider === 'deepseek' ? 0.7 : 0.2,
      stream: true // 启用流式输出
    };

    return await this.makeStreamRequest(
      this.getApiUrl(provider, customApiUrl),
      payload,
      apiKey,
      onChunk
    );
  }

  /**
   * 发送流式HTTP请求
   */
  async makeStreamRequest(url, payload, apiKey, onChunk) {
    const headers = {
      'Content-Type': 'application/json',
    };

    // 根据提供商设置认证头
    if (url.includes('api.openai.com') || url.includes('api.deepseek.com')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await axios.post(url, payload, {
        headers,
        timeout: 180000, // 3分钟超时（流式需要更长时间）
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        responseType: 'stream' // 启用流式响应
      });

      return new Promise((resolve, reject) => {
        let fullContent = '';
        let buffer = '';

        response.data.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // 保留不完整的行

          for (const line of lines) {
            if (line.trim() === '') continue;
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                // 流式响应结束
                resolve({ content: fullContent, usage: null });
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  // 调用chunk回调
                  if (onChunk) {
                    onChunk(delta, fullContent);
                  }
                }
              } catch (e) {
                // 忽略解析错误，继续处理下一行
                console.warn('Failed to parse stream chunk:', e.message);
              }
            }
          }
        });

        response.data.on('end', () => {
          if (!fullContent) {
            resolve({ content: '', usage: null });
          }
        });

        response.data.on('error', (error) => {
          console.error('Stream error:', error);
          reject(new Error(`流式请求失败: ${error.message}`));
        });
      });

    } catch (error) {
      console.error('AI流式API请求失败:', error.response?.data || error.message);

      // 提供更友好的错误信息
      let friendlyMessage = 'AI流式服务请求失败';
      if (error.response) {
        const status = error.response.status;
        switch (status) {
          case 401:
            friendlyMessage = 'API密钥无效或过期';
            break;
          case 403:
            friendlyMessage = 'API密钥权限不足';
            break;
          case 429:
            friendlyMessage = '请求过于频繁，请稍后再试';
            break;
          case 500:
          case 502:
          case 503:
            friendlyMessage = 'AI流式服务暂时不可用，请稍后再试';
            break;
          default:
            friendlyMessage = `AI流式服务错误 (${status})`;
        }
      } else if (error.code === 'ECONNABORTED') {
        friendlyMessage = '流式请求超时，请检查网络连接';
      }

      throw new Error(friendlyMessage);
    }
  }

  /**
   * 获取API URL
   */
  getApiUrl(provider, customApiUrl) {
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com/v1/chat/completions';
      case 'deepseek':
        return 'https://api.deepseek.com/v1/chat/completions';
      case 'custom':
        return customApiUrl;
      default:
        throw new Error(`不支持的AI提供商: ${provider}`);
    }
  }

  /**
   * 获取模型名称
   */
  getModelName(provider, customModel) {
    switch (provider) {
      case 'openai':
        return 'gpt-4o-mini';
      case 'deepseek':
        return 'deepseek-chat';
      case 'custom':
        return customModel;
      default:
        return 'gpt-4o-mini';
    }
  }

  /**
   * 发送HTTP请求
   */
  async makeRequest(url, payload, apiKey) {
    const headers = {
      'Content-Type': 'application/json',
    };

    // 根据提供商设置认证头
    if (url.includes('api.openai.com') || url.includes('api.deepseek.com')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      // 自定义API可能使用不同的认证方式
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    console.log(`Making API request to: ${url}`);
    console.log(`Payload size: ${JSON.stringify(payload).length} characters`);
    console.log(`Messages count: ${payload.messages.length}`);

    // 实现重试机制
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Attempt ${attempt}/3 - Making API request to: ${url}`);

        const response = await axios.post(url, payload, {
          headers,
          timeout: 120000, // 120秒超时（增加超时时间）
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });

        console.log(`API response status: ${response.status}`);
        return {
          status: response.status,
          data: response.data
        };

      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt}/3 failed:`, error.message);

        // 如果不是最后一次尝试，等待后重试
        if (attempt < 3) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避，最多5秒
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 所有重试都失败了
    throw lastError;
  }
}

module.exports = new AIService();
