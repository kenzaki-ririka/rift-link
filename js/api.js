// AI API 调用模块
import { getToolDefinitions } from './tools/index.js';

export const API = {
  PROVIDERS: {
    claude: {
      name: 'Claude (Anthropic)',
      models: [
        { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5' },
        { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' }
      ],
      defaultModel: 'claude-sonnet-4-5-20250929',
      supportsTools: true
    },
    deepseek: {
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek V3.2' },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }
      ],
      defaultModel: 'deepseek-chat',
      supportsTools: true  // V3.2 支持工具调用
    },
    gemini: {
      name: 'Gemini (Google)',
      models: [
        { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)' },
        { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
      ],
      defaultModel: 'gemini-2.5-flash-preview-05-20',
      supportsTools: true
    },
    openai: {
      name: 'OpenAI',
      models: [
        { id: 'gpt-5.2', name: 'GPT-5.2 Thinking' },
        { id: 'gpt-5.2-chat-latest', name: 'GPT-5.2 Instant' },
        { id: 'gpt-5.1', name: 'GPT-5.1' },
        { id: 'gpt-4o', name: 'GPT-4o' }
      ],
      defaultModel: 'gpt-5.2-chat-latest',
      supportsTools: true
    },
    openai_compatible: {
      name: '自定义 (OpenAI兼容)',
      models: [],
      defaultModel: '',
      requiresEndpoint: true,
      supportsTools: true
    },
    test: {
      name: '测试模式 (复读)',
      models: [
        { id: 'echo', name: '复读模式' }
      ],
      defaultModel: 'echo',
      noApiKeyRequired: true,
      supportsTools: false
    }
  },

  // 检查提供商是否支持工具调用
  supportsTools(apiProvider) {
    return this.PROVIDERS[apiProvider]?.supportsTools || false;
  },

  // 发送消息到 AI（兼容旧接口，只返回文本）
  async sendMessage(systemPrompt, messages, settings) {
    const response = await this.sendMessageWithTools(systemPrompt, messages, settings, null);
    return response.content || '';
  },

  // 发送消息到 AI（支持工具调用）
  // 返回: { content: string, tool_calls: array | null }
  async sendMessageWithTools(systemPrompt, messages, settings, tools = null) {
    const { apiProvider, apiKey, apiModel, apiEndpoint } = settings;

    // 测试模式不需要 API Key
    const provider = this.PROVIDERS[apiProvider];
    if (!provider?.noApiKeyRequired && !apiKey) {
      throw new Error('请先在设置中配置 API Key');
    }

    // 如果提供商不支持工具调用，忽略 tools 参数
    const useTools = tools && this.supportsTools(apiProvider);

    switch (apiProvider) {
      case 'claude':
        return this._sendClaudeWithTools(systemPrompt, messages, apiKey, apiModel, useTools ? tools : null);
      case 'deepseek':
        return this._sendDeepSeekWithTools(systemPrompt, messages, apiKey, apiModel, useTools ? tools : null);
      case 'gemini':
        return this._sendGeminiWithTools(systemPrompt, messages, apiKey, apiModel, useTools ? tools : null);
      case 'openai':
        return this._sendOpenAIWithTools(systemPrompt, messages, apiKey, apiModel, useTools ? tools : null);
      case 'openai_compatible':
        return this._sendOpenAICompatibleWithTools(systemPrompt, messages, apiKey, apiModel, apiEndpoint, useTools ? tools : null);
      case 'test':
        return this._sendTestWithTools(systemPrompt, messages);
      default:
        throw new Error('不支持的 API 提供商');
    }
  },

  // Claude API (支持工具调用)
  async _sendClaudeWithTools(systemPrompt, messages, apiKey, model, tools) {
    const body = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    };

    // 添加工具定义 (Claude 格式)
    if (tools) {
      body.tools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
      }));
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();

    // 解析 Claude 的工具调用响应
    let content = '';
    let tool_calls = null;

    for (const block of data.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        if (!tool_calls) tool_calls = [];
        tool_calls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
          }
        });
      }
    }

    return { content, tool_calls };
  },

  // DeepSeek API (支持工具调用)
  async _sendDeepSeekWithTools(systemPrompt, messages, apiKey, model, tools) {
    const body = {
      model: model || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ]
    };

    // 添加工具定义
    if (tools) {
      body.tools = tools;
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    const msg = data.choices[0].message;
    return {
      content: msg.content || '',
      tool_calls: msg.tool_calls || null
    };
  },

  // Gemini API (支持工具调用)
  async _sendGeminiWithTools(systemPrompt, messages, apiKey, model, tools) {
    const modelId = model || 'gemini-2.5-flash-preview-05-20';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const contents = [];
    for (const m of messages) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    }

    const body = {
      contents: contents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        maxOutputTokens: 1024
      }
    };

    // 添加工具定义 (Gemini 格式)
    if (tools) {
      body.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }))
      }];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    const candidate = data.candidates[0];

    let content = '';
    let tool_calls = null;

    for (const part of candidate.content.parts) {
      if (part.text) {
        content += part.text;
      } else if (part.functionCall) {
        if (!tool_calls) tool_calls = [];
        tool_calls.push({
          id: `call_${Date.now()}_${tool_calls.length}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args)
          }
        });
      }
    }

    return { content, tool_calls };
  },

  // OpenAI API (支持工具调用)
  async _sendOpenAIWithTools(systemPrompt, messages, apiKey, model, tools) {
    const body = {
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ]
    };

    if (tools) {
      body.tools = tools;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    const msg = data.choices[0].message;
    return {
      content: msg.content || '',
      tool_calls: msg.tool_calls || null
    };
  },

  // OpenAI 兼容 API (支持工具调用)
  async _sendOpenAICompatibleWithTools(systemPrompt, messages, apiKey, model, endpoint, tools) {
    if (!endpoint) {
      throw new Error('请在设置中配置 API 端点');
    }

    const body = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ]
    };

    if (tools) {
      body.tools = tools;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 错误: ${response.status}`);
    }

    const data = await response.json();
    const msg = data.choices[0].message;
    return {
      content: msg.content || '',
      tool_calls: msg.tool_calls || null
    };
  },

  // 测试模式
  async _sendTestWithTools(systemPrompt, messages) {
    console.log('[API Request]', [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ]
    );
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const content = lastUserMessage ? lastUserMessage.content : '[测试模式] 没有收到用户消息';
    return Promise.resolve({ content, tool_calls: null });
  },

  // 生成角色卡
  async generateCharacter(prompt, settings) {
    const systemPrompt = `你是一个角色设计师，专门为沉浸式聊天应用创建角色。

用户会给你一段描述，你需要根据描述生成一个完整的角色卡。

要求：
1. 角色要有深度，有隐藏的故事和秘密
2. 世界观要有可探索的空间，有谜团
3. 第一条消息要有"钩子"，让人想继续聊下去
4. 角色说话风格要自然，像真人发消息，不要太正式
5. 要考虑角色会主动联络用户的理由（她会找用户聊什么）
6. 角色名应该符合世界观设定（日系世界用日文名，西方世界用西方名等）

直接输出JSON，不要有其他内容：
{
  "name": "角色名",
  "avatar": "一个合适的emoji",
  "tagline": "一句话简介（15字以内）",
  "world": {
    "name": "世界名称",
    "description": "世界背景描述（100-200字，要有画面感）"
  },
  "character": {
    "background": "角色背景设定（包含身份、经历、现状，100-200字）",
    "personality": "性格特点（包含表面和内在，50-100字）",
    "speechStyle": "说话风格（具体的语气、用词习惯、表达方式，50-100字）"
  },
  "connection": {
    "medium": "通讯媒介（如：神秘的APP、老旧收音机、梦境连接等）",
    "mediumDescription": "媒介说明（这个连接是如何建立的，30-50字）",
    "firstMessage": "第一条消息（角色发给用户的第一条消息，要有吸引力，能让人想回复，50-150字）"
  }
}`;

    const messages = [
      { role: 'user', content: `请根据以下描述生成角色卡：\n\n${prompt}` }
    ];

    const response = await this.sendMessage(systemPrompt, messages, settings);

    // 解析JSON
    try {
      // 尝试直接解析
      let jsonStr = response.trim();

      // 如果被markdown包裹，提取JSON
      const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const character = JSON.parse(jsonStr);

      // 验证必要字段
      if (!character.name || !character.connection?.firstMessage) {
        throw new Error('生成的角色缺少必要字段');
      }

      // 确保proactiveContact有默认值（单位均为秒）
      character.proactiveContact = character.proactiveContact || {
        enabled: true,
        baseChance: 0.1,
        checkIntervalMinutes: 37,
        replyDelayMinutes: { min: 0, max: 60 }
      };

      return character;
    } catch (e) {
      console.error('Parse character JSON error:', e, response);
      throw new Error('解析角色数据失败，请重试');
    }
  }
};
