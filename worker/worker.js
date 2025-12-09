export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response('Invalid JSON', { status: 400 });
    }

    const { content, options } = body || {};
    if (!content || !options) {
      return new Response('Missing content or options', { status: 400 });
    }

    // 构造上游模型请求
    const upstreamBody = {
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: '你是产品文档审查助手，请输出 JSON。' },
        { role: 'user', content: buildPrompt(content, options) },
      ],
    };

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY || ''}`,
      },
      body: JSON.stringify(upstreamBody),
    });

    if (!upstream.ok) {
      return new Response('Upstream error', { status: 502 });
    }

    const data = await upstream.json();
    const contentStr = data?.choices?.[0]?.message?.content || '{}';
    const parsed = safeParse(contentStr);

    return Response.json({
      success: true,
      analysis_id: crypto.randomUUID(),
      results: parsed.results || {},
      metadata: parsed.metadata || {},
    });
  },
};

function buildPrompt(text, options) {
  return `请基于以下产品文档文本完成审查，并返回 JSON：
analysis_types: ${options.analysis_types?.join(', ') || 'all'}
response_format: ${options.response_format || 'structured_json'}
文本开始:
${text.slice(0, 12000)}
文本结束`;
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { results: {}, metadata: {} };
  }
}

