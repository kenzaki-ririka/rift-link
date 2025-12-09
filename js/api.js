// AI API 调用模块
const API = {
  PROVIDERS: {
    claude: {
      name: 'Claude (Anthropic)',
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
        { id: 'claude-opus-4-0-20250514', name: 'Claude Opus 4' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' }
      ],
      defaultModel: 'claude-sonnet-4-20250514'
    },
    deepseek: {
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek Chat' },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }
      ],
      defaultModel: 'deepseek-chat'
    },
    gemini: {
      name: 'Gemini (Google)',
      models: [
        { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
      ],
      defaultModel: 'gemini-2.5-flash-preview-05-20'
    },
    openai: {
      name: 'OpenAI',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
      ],
      defaultModel: 'gpt-4o'
    },
    openai_compatible: {
      name: '自定义 (OpenAI兼容)',
      models: [],
      defaultModel: '',
      requiresEndpoint: true
    }
  },

  // 发送消息到 AI
  async sendMessage(systemPrompt, messages, settings) {
    const { apiProvider, apiKey, apiModel, apiEndpoint } = settings;
    
    if (!apiKey) {
      throw new Error('请先在设置中配置 API Key');
    }

    switch (apiProvider) {
      case 'claude':
        return this._sendClaude(systemPrompt, messages, apiKey, apiModel);
      case 'deepseek':
        return this._sendDeepSeek(systemPrompt, messages, apiKey, apiModel);
      case 'gemini':
        return this._sendGemini(systemPrompt, messages, apiKey, apiModel);
      case 'openai':
        return this._sendOpenAI(systemPrompt, messages, apiKey, apiModel);
      case 'openai_compatible':
        return this._sendOpenAICompatible(systemPrompt, messages, apiKey, apiModel, apiEndpoint);
      default:
        throw new Error('不支持的 API 提供商');
    }
  },

  // Claude API
  async _sendClaude(systemPrompt, messages, apiKey, model) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  },

  // DeepSeek API (OpenAI 兼容)
  async _sendDeepSeek(systemPrompt, messages, apiKey, model) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  },

  // Gemini API
  async _sendGemini(systemPrompt, messages, apiKey, model) {
    const modelId = model || 'gemini-2.5-flash-preview-05-20';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    
    // 转换消息格式
    const contents = [];
    
    // Gemini 需要把 system prompt 作为第一条消息或者用 systemInstruction
    for (const m of messages) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: contents,
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          maxOutputTokens: 1024
        }
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  },

  // OpenAI API
  async _sendOpenAI(systemPrompt, messages, apiKey, model) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  },

  // OpenAI 兼容 API
  async _sendOpenAICompatible(systemPrompt, messages, apiKey, model, endpoint) {
    if (!endpoint) {
      throw new Error('请在设置中配置 API 端点');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
};
