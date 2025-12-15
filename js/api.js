import { Tools } from './tools.js';

// AI API 调用模块
export const API = {
  PROVIDERS: {
    claude: {
      name: 'Claude (Anthropic)',
      supportsTools: true,
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
      supportsTools: true,
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
      supportsTools: true,
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
    },
    test: {
      name: '测试模式 (复读)',
      models: [
        { id: 'echo', name: '复读模式' }
      ],
      defaultModel: 'echo',
      noApiKeyRequired: true
    }
  },

  // 发送消息到 AI
  async sendMessage(systemPrompt, messages, settings, channelId = null) {
    const { apiProvider, apiKey, apiModel, apiEndpoint } = settings;

    // 测试模式不需要 API Key
    const providerConfig = this.PROVIDERS[apiProvider];
    if (!providerConfig?.noApiKeyRequired && !apiKey) {
      throw new Error('请先在设置中配置 API Key');
    }

    // 检查是否启用工具
    const useTools = providerConfig.supportsTools && channelId;
    let currentMessages = [...messages];
    let turnCount = 0;
    const MAX_TURNS = 5;

    while (turnCount < MAX_TURNS) {
      turnCount++;
      let response;

      switch (apiProvider) {
        case 'claude':
          response = await this._sendClaude(systemPrompt, currentMessages, apiKey, apiModel, useTools);
          break;
        case 'deepseek':
          response = await this._sendDeepSeek(systemPrompt, currentMessages, apiKey, apiModel, useTools);
          break;
        case 'gemini':
          // Gemini 暂未实现工具调用
          response = await this._sendGemini(systemPrompt, currentMessages, apiKey, apiModel);
          break;
        case 'openai':
          response = await this._sendOpenAI(systemPrompt, currentMessages, apiKey, apiModel, useTools);
          break;
        case 'openai_compatible':
          response = await this._sendOpenAICompatible(systemPrompt, currentMessages, apiKey, apiModel, apiEndpoint);
          break;
        case 'test':
          response = { content: await this._sendTest(currentMessages) };
          break;
        default:
          throw new Error('不支持的 API 提供商');
      }

      // 检查是否有工具调用
      if (response.tool_calls && response.tool_calls.length > 0) {
        console.log('[API] Received tool calls:', response.tool_calls);
        
        // 1. 将 assistant 消息（包含 tool_calls）添加到历史
        currentMessages.push(response.rawMessage);

        // 2. 执行工具并添加 tool 消息
        for (const call of response.tool_calls) {
          const result = await Tools.execute(channelId, call.name, call.args);
          
          // 根据不同提供商构建 tool 消息
          if (apiProvider === 'claude') {
             currentMessages.push({
               role: 'user',
               content: [
                 {
                   type: 'tool_result',
                   tool_use_id: call.id,
                   content: result
                 }
               ]
             });
          } else {
             // OpenAI / DeepSeek format
             currentMessages.push({
               role: 'tool',
               tool_call_id: call.id,
               content: result
             });
          }
        }
        
        // 继续循环，再次调用 API
        continue;
      }

      // 如果没有工具调用，返回内容
      return response.content;
    }

    throw new Error('Tool execution loop exceeded max turns');
  },

  // Claude API
  async _sendClaude(systemPrompt, messages, apiKey, model, useTools = false) {
    const body = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map(m => {
        // Claude 特殊处理：如果 content 是数组（包含 tool_use/result），直接透传
        if (Array.isArray(m.content)) return m;
        return { role: m.role, content: m.content };
      })
    };

    if (useTools) {
      body.tools = Tools.DEFINITIONS.map(def => ({
        name: def.function.name,
        description: def.function.description,
        input_schema: def.function.parameters
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
    
    // 解析 Claude 响应
    const contentBlocks = data.content;
    const textBlock = contentBlocks.find(b => b.type === 'text');
    const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');

    const result = {
      content: textBlock ? textBlock.text : '',
      rawMessage: { role: 'assistant', content: contentBlocks } // 保存完整结构用于历史
    };

    if (toolUseBlocks.length > 0) {
      result.tool_calls = toolUseBlocks.map(block => ({
        id: block.id,
        name: block.name,
        args: block.input
      }));
    }

    return result;
  },

  // DeepSeek API (OpenAI 兼容)
  async _sendDeepSeek(systemPrompt, messages, apiKey, model, useTools = false) {
    return this._sendOpenAI(systemPrompt, messages, apiKey, model, useTools, 'https://api.deepseek.com/chat/completions');
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
    return { content: data.candidates[0].content.parts[0].text };
  },

  // OpenAI API
  async _sendOpenAI(systemPrompt, messages, apiKey, model, useTools = false, endpoint = 'https://api.openai.com/v1/chat/completions') {
    const body = {
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ]
    };

    if (useTools) {
      body.tools = Tools.DEFINITIONS;
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
    const message = data.choices[0].message;

    const result = {
      content: message.content,
      rawMessage: message
    };

    if (message.tool_calls) {
      result.tool_calls = message.tool_calls.map(call => ({
        id: call.id,
        name: call.function.name,
        args: JSON.parse(call.function.arguments)
      }));
    }

    return result;
  },

  // OpenAI 兼容 API
  async _sendOpenAICompatible(systemPrompt, messages, apiKey, model, endpoint) {
    return this._sendOpenAI(systemPrompt, messages, apiKey, model, false, endpoint);
  },

  // 测试模式 - 复读用户消息
  _sendTest(messages) {
    // 获取最后一条用户消息并复读
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      return Promise.resolve(lastUserMessage.content);
    }
    return Promise.resolve('[测试模式] 没有收到用户消息');
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
  },
  "proactiveContact": {
    "enabled": true,
    "baseChance": 0.1
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

      // 确保proactiveContact有默认值
      character.proactiveContact = character.proactiveContact || {
        enabled: true,
        baseChance: 0.1,
        checkIntervalMinutes: 15,
        replyDelayMinutes: { min: 0, max: 10 }
      };

      return character;
    } catch (e) {
      console.error('Parse character JSON error:', e, response);
      throw new Error('解析角色数据失败，请重试');
    }
  }
};
