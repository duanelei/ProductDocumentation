const pdfParse = require('pdf-parse');
const aiService = require('./aiService');

/**
 * 文档处理器 - 处理PDF解析和AI分析
 */
class DocumentProcessor {
  /**
   * 解析PDF文件
   */
  async parsePdf(buffer) {
    try {
      console.log('开始解析PDF，缓冲区大小:', buffer.length);

      const data = await pdfParse(buffer);
      console.log('PDF解析完成，页数:', data.numpages, '文本长度:', data.text ? data.text.length : 0);

      let fullText = '';

      // pdf-parse直接提供所有文本内容
      if (data.text && data.text.trim()) {
        // 尝试按页分割（如果PDF有页分隔信息）
        const text = data.text.trim();

        // 如果有明确的页分隔符，尝试分割
        if (text.includes('\f') || text.includes('\n\n\n')) {
          const pages = text.split(/\f|\n\n\n/).filter(page => page.trim());
          console.log('检测到页分隔符，分割为', pages.length, '页');

          for (let i = 0; i < pages.length; i++) {
            const pageContent = pages[i].trim();
            if (pageContent) {
              fullText += `\n[Page ${i + 1}]\n${pageContent}\n`;
            }
          }
        } else {
          // 没有明确的页分隔符，整个作为一页
          fullText = `\n[Page 1]\n${text}\n`;
        }
      } else {
        throw new Error('PDF中没有找到可解析的文本内容');
      }

      console.log('PDF解析完成，总文本长度:', fullText.length);
      return fullText.trim();

    } catch (error) {
      console.error('PDF解析失败:', error);
      throw new Error(`PDF解析失败: ${error.message}`);
    }
  }

  /**
   * 执行分阶段AI分析
   */
  async performStagedAnalysis(text, provider, apiKey, customApiUrl, customModel, options = {}) {
    const { stream = false, onProgress } = options;
    const messages = [
      { role: 'system', content: '你是专业的产品文档质量分析助手。请按阶段逐步分析文档，提供详细、准确的分析结果。' },
      { role: 'user', content: `阶段1：文档结构分析\n\n${this.getStructureAnalysisPrompt(text)}` }
    ];

    try {
      console.log('开始阶段1：文档结构分析');

      // 第一阶段：文档结构分析（明确非流式，先拆分分档）
      // 在调用AI API之前，先通知前端
      if (onProgress && stream) {
        onProgress('structure', '正在分析文档结构，完成后进入流式阶段...', null);
      }

      // 即使整体是流式流程，结构分析也改为非流式调用
      const structureResponse = await aiService.callAI(
        provider,
        apiKey,
        customApiUrl,
        customModel,
        messages,
        3000
      );

      const structureContent = structureResponse.data.choices[0].message.content;
      const structureData = this.extractJsonFromResponse(structureContent);
      const processedDoc = this.validateAndFixResultStructure(structureData, text);

      if (onProgress && stream) {
        onProgress('structure_complete', null, processedDoc);
      }

      console.log(`文档结构分析完成，发现 ${processedDoc.sections.length} 个段落`);

      // 第二阶段：设计缺陷检查
      console.log('开始阶段2：设计缺陷检查');
      const designSections = this.getRelevantSections(processedDoc, { key: '设计缺陷检查' });
      const designContent = this.generateContentForAnalysis(designSections, 2000); // 减少内容长度

      messages.push({ role: 'assistant', content: structureContent });
      messages.push({
        role: 'user',
        content: `阶段2：设计缺陷检查

基于已分析的文档结构，请对设计缺陷进行深入分析：

分析内容：
${designContent}

请重点关注：
1. UI/UX设计问题
2. 交互逻辑缺陷
3. 用户体验问题
4. 界面一致性问题

请用自然语言详细分析，包括：
- 发现的具体设计问题
- 问题的影响和严重程度
- 改进建议和解决方案

请直接回答，不要使用JSON格式或代码块。`
      });

      // 在调用AI API之前，先通知前端
      if (onProgress && stream) {
        onProgress('design', '正在连接AI服务，准备开始设计缺陷检查...', null);
      }

      const designResponse = stream
        ? await aiService.callAIStream(provider, apiKey, customApiUrl, customModel, messages, 2000,
            (chunk, fullContent) => onProgress && onProgress('design', chunk, fullContent))
        : await aiService.callAI(provider, apiKey, customApiUrl, customModel, messages, 2000);

      // 第三阶段：逻辑一致性分析
      console.log('开始阶段3：逻辑一致性分析');
      const logicSections = this.getRelevantSections(processedDoc, { key: '逻辑一致性分析' });
      const logicContent = this.generateContentForAnalysis(logicSections, 2000); // 减少内容长度

      const designResponseContent = stream ? designResponse.content : designResponse.data.choices[0].message.content;
      messages.push({ role: 'assistant', content: designResponseContent });
      messages.push({
        role: 'user',
        content: `阶段3：逻辑一致性分析

基于前面所有分析结果，请分析文档的逻辑一致性：

分析内容：
${logicContent}

请重点关注：
1. 业务逻辑的连贯性
2. 数据流的一致性
3. 规则和约束的统一性
4. 概念定义的一致性

请用自然语言详细分析，包括：
- 发现的逻辑矛盾和不一致之处
- 可能导致的业务风险
- 建议的修正方案

请直接回答，不要使用JSON格式或代码块。`
      });

      // 在调用AI API之前，先通知前端
      if (onProgress && stream) {
        onProgress('logic', '正在连接AI服务，准备开始逻辑一致性分析...', null);
      }

      const logicResponse = stream
        ? await aiService.callAIStream(provider, apiKey, customApiUrl, customModel, messages, 2000,
            (chunk, fullContent) => onProgress && onProgress('logic', chunk, fullContent))
        : await aiService.callAI(provider, apiKey, customApiUrl, customModel, messages, 2000);

      // 第四阶段：风险评估
      console.log('开始阶段4：风险评估');
      const riskSections = this.getRelevantSections(processedDoc, { key: '风险评估' });
      const riskContent = this.generateContentForAnalysis(riskSections, 1500); // 减少内容长度

      const logicResponseContent = stream ? logicResponse.content : logicResponse.data.choices[0].message.content;
      messages.push({ role: 'assistant', content: logicResponseContent });
      messages.push({
        role: 'user',
        content: `阶段4：风险评估

基于前面所有分析结果，请进行全面的风险评估：

分析内容：
${riskContent}

请重点关注：
1. 技术实现风险
2. 业务逻辑风险
3. 安全和合规风险
4. 性能和扩展性风险
5. 维护和运营风险

请用自然语言详细分析，包括：
- 识别出的各类风险及其等级
- 风险的具体描述和可能影响
- 建议的风险缓解措施和应对策略

请直接回答，不要使用JSON格式或代码块。`
      });

      // 在调用AI API之前，先通知前端
      if (onProgress && stream) {
        onProgress('risk', '正在连接AI服务，准备开始风险评估...', null);
      }

      const riskResponse = stream
        ? await aiService.callAIStream(provider, apiKey, customApiUrl, customModel, messages, 1500,
            (chunk, fullContent) => onProgress && onProgress('risk', chunk, fullContent))
        : await aiService.callAI(provider, apiKey, customApiUrl, customModel, messages, 1500);

      // 直接使用AI返回的自然语言内容，不再解析JSON
      // designResponseContent 和 logicResponseContent 已经在上面声明过了
      const riskResponseContent = stream ? riskResponse.content : riskResponse.data.choices[0].message.content;

      // 安全地获取 usage 信息
      let usage = null;
      if (stream) {
        // 流式模式下，尝试从各个响应中收集 usage
        usage = riskResponse.usage || designResponse.usage || logicResponse.usage || null;
      } else {
        // 非流式模式下，从最后一个响应获取 usage
        usage = riskResponse.data?.usage || null;
      }

      return {
        processedDoc,
        usage: usage, // 确保 usage 总是存在（可能是 null）
        documentStructure: `📄 文档摘要：${processedDoc.document_summary}\n\n📊 分析结果：共识别${processedDoc.sections.length}个段落\n\n主要段落：\n${
          processedDoc.sections.slice(0, 5).map(s => `• ${s.title} (${s.category})`).join('\n')
        }${processedDoc.sections.length > 5 ? `\n...还有${processedDoc.sections.length - 5}个段落` : ''}`,
        '设计缺陷检查': designResponseContent,
        '逻辑一致性分析': logicResponseContent,
        '风险评估': riskResponseContent
      };

    } catch (error) {
      console.error('分阶段分析失败:', error);
      // 降级到传统分析方法
      return this.fallbackStagedAnalysis(text, provider, apiKey, customApiUrl, customModel);
    }
  }

  /**
   * 获取文档结构分析提示
   */
  getStructureAnalysisPrompt(text) {
    return `请作为专业的产品文档分析师，深度分析以下文档内容，为后续精确的质量分析做准备。请重点关注文档的逻辑结构、内容完整性和潜在问题点。

分析要求：
1. 识别文档的核心章节和逻辑层次结构
2. 将内容划分为有意义的功能模块或主题段落
3. 为每个段落提供精确的分类标签
4. 评估段落对不同质量分析维度的相关性（0-10分）
5. 考虑文档的上下文关系和依赖性

文档内容：
${text.substring(0, 10000)}

请返回纯JSON格式，不要包含markdown代码块：
{
  "document_summary": "文档整体摘要（150字以内，包含文档类型、主要功能、关键特点）",
  "document_type": "产品需求文档|技术设计文档|用户手册|其他",
  "sections": [
    {
      "id": "section_1",
      "title": "精确的段落标题",
      "content": "段落的完整原文内容",
      "category": "功能需求|设计规范|技术架构|用户体验|数据模型|安全要求|性能指标|测试用例|部署说明|维护指南|其他",
      "hierarchy_level": 1-5,
      "word_count": 0,
      "relevance": {
        "设计缺陷检查": "评估该段落包含UI/UX设计、交互逻辑、可用性问题的程度（0-10）",
        "逻辑一致性分析": "评估该段落涉及业务逻辑、数据流、规则一致性的程度（0-10）",
        "风险评估": "评估该段落涉及技术风险、业务风险、安全隐患的程度（0-10）"
      },
      "tags": ["标签1", "标签2"]
    }
  ],
  "metadata": {
    "total_sections": 0,
    "total_length": 0,
    "document_structure": "层次化|模块化|线性",
    "estimated_complexity": "低|中|高"
  }
}

请确保：
- 段落划分具有逻辑完整性，不要随意截断
- 分类标签准确反映段落内容特征
- 相关性评分基于实际内容分析，而非主观判断
- 考虑文档的完整性和上下文关系`;
  }

  /**
   * 从响应中提取JSON结果
   */
  extractJsonFromResponse(content) {
    console.log('extractJsonFromResponse input length:', content.length);
    console.log('extractJsonFromResponse input preview:', content.substring(0, 200));

    // 确保 cleaned 在整个函数作用域可用，避免 catch 中未定义
    let cleaned = '';

    try {
      cleaned = (content || '').trim();

      // 清理markdown代码块
      cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*$/g, '');
      cleaned = cleaned.replace(/```\w*\s*/gi, '').replace(/```\s*$/g, '');
      cleaned = cleaned.replace(/```\s*/g, '');
      cleaned = cleaned.trim();

      console.log('After markdown cleanup, length:', cleaned.length);

      // 找到JSON开始位置（支持对象和数组）
      let jsonStart = -1;
      const firstBrace = cleaned.indexOf('{');
      const firstBracket = cleaned.indexOf('[');

      if (firstBrace >= 0 && (firstBracket === -1 || firstBrace < firstBracket)) {
        jsonStart = firstBrace;
      } else if (firstBracket >= 0) {
        jsonStart = firstBracket;
      }

      if (jsonStart > 0) {
        // 保留一些上下文，但移除前面的非JSON内容
        const contextStart = Math.max(0, jsonStart - 50);
        cleaned = cleaned.substring(contextStart);
        jsonStart = jsonStart - contextStart;
      }

      console.log('JSON start position:', jsonStart);

      if (jsonStart >= 0) {
        cleaned = cleaned.substring(jsonStart);
      }

      // 改进的括号匹配逻辑，处理转义字符
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;
      let endPos = -1;
      let startChar = cleaned.charAt(0);

      // 确定是对象还是数组
      let isObject = startChar === '{';
      let isArray = startChar === '[';

      console.log('JSON type - Object:', isObject, 'Array:', isArray);

      for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') braceCount++;
          else if (char === '}') braceCount--;
          else if (char === '[') bracketCount++;
          else if (char === ']') bracketCount--;

          // 检查是否回到初始级别
          if ((isObject && braceCount === 0 && char === '}') ||
              (isArray && bracketCount === 0 && char === ']')) {
            endPos = i + 1;
            console.log('Found JSON end at position:', endPos);
            break;
          }
        }
      }

      if (endPos > 0) {
        cleaned = cleaned.substring(0, endPos);
      } else {
        console.warn('Could not find JSON end, using full content');
        // 如果找不到结束位置，尝试截取到一个合理的长度
        if (cleaned.length > 10000) {
          cleaned = cleaned.substring(0, 10000) + '...}';
        }
      }

      // 修复常见的JSON问题
      cleaned = this.repairJsonString(cleaned);

      cleaned = cleaned.trim();
      console.log('Final JSON length:', cleaned.length);
      console.log('Final JSON preview:', cleaned.substring(0, 200));
      console.log('Final JSON end:', cleaned.substring(Math.max(0, cleaned.length - 200)));

      // 尝试解析
      const result = JSON.parse(cleaned);
      console.log('JSON parsing successful');
      return result;

    } catch (error) {
      console.error('JSON解析失败:', error.message);
      console.error('失败内容预览:', cleaned ? cleaned.substring(0, 500) : '[cleaned is empty]');

      // 尝试多种修复策略
      try {
        console.log('尝试修复JSON...');
        let repaired = this.repairJsonString(cleaned);

        if (repaired !== cleaned) {
          console.log('JSON已修复，重新尝试解析...');
          const result = JSON.parse(repaired);
          return result;
        }
      } catch (repairError) {
        console.error('JSON修复也失败:', repairError.message);
      }

      // 如果解析失败，返回一个基本的结构
      return {
        result: 'AI返回的内容格式无法解析，但分析可能已完成。请检查AI的原始响应。'
      };
    }
  }

  /**
   * 修复常见的JSON字符串问题
   */
  repairJsonString(jsonString) {
    let repaired = jsonString;

    // 1. 修复多余的逗号（在对象或数组结束前）
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

    // 2. 修复未闭合的字符串（简单检测）
    const quoteCount = (repaired.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      // 如果引号数量是奇数，尝试在末尾添加引号
      console.log('检测到未闭合的字符串，尝试修复...');
      repaired += '"';
    }

    // 3. 修复未闭合的对象或数组
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    // 添加缺失的闭合符号
    const missingBraces = openBraces - closeBraces;
    const missingBrackets = openBrackets - closeBrackets;

    for (let i = 0; i < missingBraces; i++) {
      repaired += '}';
    }

    for (let i = 0; i < missingBrackets; i++) {
      repaired += ']';
    }

    if (missingBraces > 0 || missingBrackets > 0) {
      console.log(`修复了缺失的符号: ${missingBraces} 个'}', ${missingBrackets} 个']'`);
    }

    // 4. 移除可能的多余内容（在JSON结束后）
    const firstBrace = repaired.indexOf('{');
    const firstBracket = repaired.indexOf('[');

    if (firstBrace >= 0 || firstBracket >= 0) {
      const jsonStart = Math.min(firstBrace >= 0 ? firstBrace : Infinity, firstBracket >= 0 ? firstBracket : Infinity);
      let jsonEnd = -1;

      // 简单查找JSON结束位置
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;

      for (let i = jsonStart; i < repaired.length; i++) {
        const char = repaired[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') braceCount++;
          else if (char === '}') {
            braceCount--;
            if (braceCount === 0 && jsonStart === firstBrace) {
              jsonEnd = i + 1;
              break;
            }
          }
          else if (char === '[') bracketCount++;
          else if (char === ']') {
            bracketCount--;
            if (bracketCount === 0 && jsonStart === firstBracket) {
              jsonEnd = i + 1;
              break;
            }
          }
        }
      }

      if (jsonEnd > 0 && jsonEnd < repaired.length) {
        repaired = repaired.substring(0, jsonEnd);
        console.log('移除了JSON后的多余内容');
      }
    }

    return repaired;
  }

  /**
   * 验证和修复结果结构
   */
  validateAndFixResultStructure(result, originalText) {
    if (!result || typeof result !== 'object') {
      return this.fallbackChunking(originalText);
    }

    const validated = { ...result };

    // 验证基本属性
    if (!validated.document_summary || typeof validated.document_summary !== 'string') {
      validated.document_summary = validated.sections && validated.sections.length > 0
        ? `成功识别文档结构，包含${validated.sections.length}个主要段落`
        : '文档结构分析完成';
    }

    if (!validated.document_type) {
      validated.document_type = '产品文档';
    }

    // 验证sections
    if (!Array.isArray(validated.sections)) {
      validated.sections = [];
    }

    // 验证和修复sections
    validated.sections = validated.sections.map((section, index) => {
      if (!section || typeof section !== 'object') {
        return {
          id: `recovered_${index + 1}`,
          title: `恢复的段落 ${index + 1}`,
          content: '内容不可用',
          category: '其他',
          hierarchy_level: 1,
          word_count: 0,
          tags: [],
          relevance: {
            '设计缺陷检查': 5,
            '逻辑一致性分析': 5,
            '风险评估': 5
          }
        };
      }

      return {
        id: section.id || `section_${index + 1}`,
        title: section.title || `段落 ${index + 1}`,
        content: section.content || '',
        category: section.category || '其他',
        hierarchy_level: section.hierarchy_level || 1,
        word_count: section.word_count || (section.content ? section.content.split(/\s+/).length : 0),
        tags: Array.isArray(section.tags) ? section.tags : [],
        relevance: section.relevance || {
          '设计缺陷检查': 5,
          '逻辑一致性分析': 5,
          '风险评估': 5
        }
      };
    });

    // 验证metadata
    if (!validated.metadata) {
      validated.metadata = {};
    }

    validated.metadata.total_sections = validated.sections.length;
    validated.metadata.total_length = originalText.length;
    validated.metadata.document_structure = validated.metadata.document_structure || '模块化';
    validated.metadata.estimated_complexity = validated.metadata.estimated_complexity || '中';

    return validated;
  }

  /**
   * 降级分块方法
   */
  fallbackChunking(text) {
    console.log('使用降级分块方法');

    // 改进的段落分割逻辑
    let paragraphs = text.split('\n\n').filter(p => p.trim().length > 30);

    if (paragraphs.length < 2) {
      paragraphs = text.split('\n').filter(p => p.trim().length > 30);
    }

    if (paragraphs.length < 2) {
      paragraphs = text.split(/[.!?]+/).filter(p => p.trim().length > 50);
    }

    const chunks = [];
    let currentChunk = '';
    let sectionId = 1;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      if ((currentChunk + paragraph).length > 1200 && currentChunk.length > 0) {
        chunks.push({
          id: `fallback_${sectionId}`,
          title: `文档段落 ${sectionId}`,
          content: currentChunk.trim(),
          category: '文档内容',
          hierarchy_level: 1,
          word_count: currentChunk.trim().split(/\s+/).length,
          tags: ['文档内容'],
          relevance: {
            '设计缺陷检查': 4,
            '逻辑一致性分析': 4,
            '风险评估': 4
          }
        });
        sectionId++;
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: `fallback_${sectionId}`,
        title: `文档段落 ${sectionId}`,
        content: currentChunk.trim(),
        category: '文档内容',
        hierarchy_level: 1,
        word_count: currentChunk.trim().split(/\s+/).length,
        tags: ['文档内容'],
        relevance: {
          '设计缺陷检查': 4,
          '逻辑一致性分析': 4,
          '风险评估': 4
        }
      });
    }

    // 如果仍然没有段落，创建一个默认段落
    if (chunks.length === 0 && text.trim()) {
      chunks.push({
        id: 'fallback_1',
        title: '文档内容',
        content: text.trim().substring(0, 2000),
        category: '文档内容',
        hierarchy_level: 1,
        word_count: text.trim().split(/\s+/).length,
        tags: ['文档内容'],
        relevance: {
          '设计缺陷检查': 4,
          '逻辑一致性分析': 4,
          '风险评估': 4
        }
      });
    }

    return {
      document_summary: chunks.length > 0
        ? `通过智能分块将文档分为${chunks.length}个段落进行分析`
        : '文档内容已解析，但无法识别明确的段落结构',
      document_type: '文档',
      sections: chunks,
      metadata: {
        total_sections: chunks.length,
        total_length: text.length,
        document_structure: '智能分块',
        quality_focus_areas: ['设计缺陷检查', '逻辑一致性分析', '风险评估'],
        estimated_complexity: '中'
      },
      usage: null,
      originalText: text
    };
  }

  /**
   * 根据分析类型选择最相关的段落
   */
  getRelevantSections(processedDoc, analysisType) {
    const { sections } = processedDoc;
    const analysisKey = analysisType.key;

    let sortedSections = sections
      .filter(section => section.relevance && section.relevance[analysisKey] > 0)
      .sort((a, b) => (b.relevance[analysisKey] || 0) - (a.relevance[analysisKey] || 0));

    // 如果相关段落不足，考虑类别匹配
    if (sortedSections.length < 3) {
      const categoryBoosts = {
        '设计缺陷检查': ['功能需求', '设计规范', '用户体验'],
        '逻辑一致性分析': ['功能需求', '数据模型', '业务逻辑'],
        '风险评估': ['安全要求', '性能指标', '技术架构']
      };

      const relevantCategories = categoryBoosts[analysisKey] || [];
      const categorySections = sections
        .filter(section => !sortedSections.includes(section) && relevantCategories.includes(section.category))
        .map(section => ({ ...section, relevance_score: (section.relevance[analysisKey] || 0) + 2 }));

      sortedSections = [...sortedSections, ...categorySections]
        .sort((a, b) => (b.relevance_score || b.relevance[analysisKey] || 0) - (a.relevance_score || a.relevance[analysisKey] || 0));
    }

    const topSections = sortedSections.slice(0, 3);

    // 考虑依赖关系
    const enhancedSections = [...topSections];
    topSections.forEach(section => {
      if (section.dependencies && Array.isArray(section.dependencies)) {
        section.dependencies.forEach(depId => {
          const depSection = sections.find(s => s.id === depId);
          if (depSection && !enhancedSections.includes(depSection)) {
            enhancedSections.push(depSection);
          }
        });
      }
    });

    // 确保至少有2个段落
    if (enhancedSections.length < 2) {
      const generalSections = sections
        .filter(section => !enhancedSections.includes(section))
        .sort((a, b) => (b.word_count || 0) - (a.word_count || 0))
        .slice(0, 2 - enhancedSections.length);
      enhancedSections.push(...generalSections);
    }

    return enhancedSections.slice(0, 4);
  }

  /**
   * 生成分析内容
   */
  generateContentForAnalysis(sections, maxLength = 3000) {
    const combinedContent = sections
      .map(section => `[${section.title}]\n${section.content}`)
      .join('\n\n---\n\n');

    if (combinedContent.length > maxLength) {
      const truncated = combinedContent.substring(0, maxLength);
      const lastSectionBreak = truncated.lastIndexOf('\n\n---\n\n');
      if (lastSectionBreak > maxLength * 0.7) {
        return truncated.substring(0, lastSectionBreak) + '\n\n[内容已截断以控制token消耗]';
      }
      return truncated + '\n\n[内容已截断以控制token消耗]';
    }

    return combinedContent;
  }

  /**
   * 降级的分阶段分析
   */
  async fallbackStagedAnalysis(text, provider, apiKey, customApiUrl, customModel) {
    console.log('使用降级分阶段分析方法');

    const processedDoc = this.fallbackChunking(text);

    const results = {
      processedDoc,
      documentStructure: `📄 文档摘要：${processedDoc.document_summary}\n\n📊 分析结果：共识别${processedDoc.sections.length}个段落，包括：\n${
        processedDoc.sections.map(s => `• ${s.title} (${s.category})`).join('\n')
      }`
    };

    const analysisTypes = [
      { key: '设计缺陷检查', prompt: '请基于提供的文档片段分析设计缺陷，重点关注UI/UX和交互逻辑问题。', maxContentLength: 3000 },
      { key: '逻辑一致性分析', prompt: '请基于提供的文档片段分析逻辑一致性，检查是否存在矛盾或不一致的地方。', maxContentLength: 2500 },
      { key: '风险评估', prompt: '请基于提供的文档片段评估潜在风险和技术债务。', maxContentLength: 2000 }
    ];

    for (const analysisType of analysisTypes) {
      try {
        const sections = this.getRelevantSections(processedDoc, analysisType);
        const content = this.generateContentForAnalysis(sections, analysisType.maxContentLength);

        const messages = [
          { role: 'system', content: '你是产品文档审查助手，请用自然语言详细分析文档，直接回答，不要使用JSON格式或代码块。' },
          { role: 'user', content: `${analysisType.prompt}\n\n文档片段:\n${content}\n\n请用自然语言详细分析。` }
        ];

        const response = await aiService.callAIStream(provider, apiKey, customApiUrl, customModel, messages, 3000);
        // 直接使用AI返回的自然语言内容
        results[analysisType.key] = response.content || response.data?.choices?.[0]?.message?.content || '分析失败';
        if (response.data.usage) {
          results.usage = response.data.usage;
        }
      } catch (e) {
        results[analysisType.key] = `分析失败: ${e.message}`;
      }
    }

    return results;
  }
}

module.exports = new DocumentProcessor();
