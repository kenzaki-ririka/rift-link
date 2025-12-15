import { Storage } from './storage.js';
import { API } from './api.js';
import { Character } from './character.js';
import { TimeManager } from './time.js';
import { getToolDefinitions, executeToolCalls } from './tools/index.js';

// 聊天逻辑
export const Chat = {
  currentChannelId: null,
  proactiveTimer: null,           // 定时概率检查（每10分钟）
  scheduledContactTimer: null,    // AI 决定的精确定时联络

  // 初始化聊天
  async init(channelId) {
    this.currentChannelId = channelId;

    // 清除之前的定时器
    if (this.proactiveTimer) {
      clearInterval(this.proactiveTimer);
      this.proactiveTimer = null;
    }
    if (this.scheduledContactTimer) {
      clearTimeout(this.scheduledContactTimer);
      this.scheduledContactTimer = null;
    }

    const channel = Storage.getChannel(channelId);
    if (!channel) return;

    // 检查离线期间的主动联络
    await this.checkOfflineContacts(channel);

    // 只有当用户已发送过消息时，才设置主动联络检查
    if (this.hasUserMessage(channel)) {
      this.setupProactiveCheck(channel);
    }

    // 更新最后访问时间
    Storage.setLastVisit(channelId, new Date().toISOString());
  },

  // 检查频道是否有用户发送的消息
  hasUserMessage(channel) {
    const messages = channel.messages || [];
    return messages.some(m => m.role === 'user');
  },

  // 检查离线期间应该触发的主动联络
  async checkOfflineContacts(channel) {
    const lastVisit = Storage.getLastVisit(channel.id);

    // 如果是第一次访问且没有消息，显示第一条消息
    if (!channel.messages || channel.messages.length === 0) {
      if (channel.connection?.firstMessage) {
        const firstMsg = {
          id: 'msg_' + Date.now(),
          role: 'assistant',
          content: channel.connection.firstMessage,
          timestamp: new Date().toISOString()
        };
        Storage.saveMessage(channel.id, firstMsg);
      }
      return;
    }

    // 只有当用户发送过消息时，才计算离线期间的主动联络
    if (!this.hasUserMessage(channel)) {
      return;
    }

    // 计算离线期间的主动联络
    const contacts = TimeManager.calculateOfflineContacts(
      lastVisit,
      channel.proactiveContact
    );

    // 依次生成主动消息
    for (const contact of contacts) {
      await this.generateProactiveMessage(channel.id, contact.timestamp);
    }
  },

  // 设置主动联络检查
  setupProactiveCheck(channel) {
    if (!channel.proactiveContact?.enabled) return;

    const { baseChance, checkIntervalMinutes, replyDelayMinutes } = channel.proactiveContact;
    const intervalMs = checkIntervalMinutes * 60 * 1000;

    this.proactiveTimer = setInterval(async () => {
      // 检查当前状态
      const status = Storage.getStatus(channel.id);

      // 计算实际概率（考虑状态乘数）
      let actualChance = baseChance;
      if (status && typeof status.proactiveMultiplier === 'number') {
        actualChance = baseChance * status.proactiveMultiplier;
        console.log(`[Chat] 状态影响概率: ${baseChance} * ${status.proactiveMultiplier} = ${actualChance}`);
      }

      // 概率判定
      if (Math.random() < actualChance) {
        // 计算延迟
        const delayMs = (replyDelayMinutes.min + Math.random() * (replyDelayMinutes.max - replyDelayMinutes.min)) * 60 * 1000;

        setTimeout(async () => {
          // 确保还在同一个频道
          if (this.currentChannelId === channel.id) {
            await this.generateProactiveMessage(channel.id);
            // 触发UI更新
            if (window.App) {
              window.App.renderChat(channel.id);
            }
          }
        }, delayMs);
      }
    }, intervalMs);
  },

  // 生成主动消息
  async generateProactiveMessage(channelId, timestamp = null, reason = null) {
    const channel = Storage.getChannel(channelId);
    if (!channel) return;

    const settings = Storage.getSettings();
    const msgTimestamp = timestamp || new Date().toISOString();

    // 构建时间上下文
    const messages = channel.messages || [];
    const timeContext = TimeManager.buildTimeContext(messages, msgTimestamp);

    // 添加状态信息到提示词
    const status = Storage.getStatus(channelId);
    let statusContext = '';
    if (status) {
      statusContext = `\n\n# 你当前的状态\n\n你目前处于「${status.label}」状态。${status.reason ? `原因：${status.reason}` : ''}\n如果状态结束了，记得在回复中清除状态。`;
    }

    // 构建提示词（传入 reason）
    const systemPrompt = Character.buildProactivePrompt(channel, timeContext, reason) + statusContext;

    // 准备消息历史
    const historyLimit = settings.historyLimit || 20;
    const recentMessages = (historyLimit === 0 ? messages : messages.slice(-historyLimit)).map(m => ({
      role: m.role,
      content: m.content
    }));

    // 添加一个触发消息（使用 timeContext 中的时间信息）
    recentMessages.push({
      role: 'user',
      content: `[系统：请生成一条你主动发送的消息。${reason ? `原因：${reason}` : ''}]`
    });

    try {
      // 获取工具定义
      const tools = getToolDefinitions();

      // 调用API（支持工具调用）
      const response = await API.sendMessageWithTools(systemPrompt, recentMessages, settings, tools);
      let reply = response.content || '';

      // 处理工具调用（如果有）
      if (response.tool_calls && response.tool_calls.length > 0) {
        console.log('[Chat] 主动消息收到工具调用:', response.tool_calls.map(t => t.function.name));
        const context = { channelId };
        const results = executeToolCalls(response.tool_calls, context);

        // 检查是否有 set_next_contact，需要设置定时器
        for (const result of results) {
          if (result.result.delayMs) {
            this.scheduleNextContact(channelId, result.result.delayMs, result.result.reason);
          }
        }

        if (window.App && window.App.updateStatusDisplay) {
          window.App.updateStatusDisplay(channelId);
        }
      } else {
        // 回退：解析标签
        const statusData = Character.parseStatusTag(reply);
        if (statusData) {
          Character.processStatus(channelId, statusData);
          if (window.App && window.App.updateStatusDisplay) {
            window.App.updateStatusDisplay(channelId);
          }
        }
      }

      reply = Character.removeProactiveTag(reply);

      const newMsg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        role: 'assistant',
        content: reply,
        timestamp: msgTimestamp,
        isProactive: true
      };

      Storage.saveMessage(channelId, newMsg);

      // 主动联络成功，清除当前状态（表示"醒了"或"活动恢复"）
      const currentStatus = Storage.getStatus(channelId);
      if (currentStatus) {
        Storage.clearStatus(channelId);
        console.log('[Chat] 主动联络成功，清除状态:', currentStatus.label);
        if (window.App && window.App.updateStatusDisplay) {
          window.App.updateStatusDisplay(channelId);
        }
      }

      // 清除待处理的联络
      Storage.clearPendingContact(channelId);

      // 重置概率检查计时器（避免短时间内连发）
      this.resetProactiveTimer(channel);

      return newMsg;
    } catch (error) {
      console.error('Failed to generate proactive message:', error);
      return null;
    }
  },

  // 发送用户消息
  async sendMessage(channelId, content, msgId = null) {
    const channel = Storage.getChannel(channelId);
    if (!channel) throw new Error('频道不存在');

    const settings = Storage.getSettings();
    const now = new Date().toISOString();

    // 检查这是否是第一条用户消息（在保存前检查）
    const isFirstUserMessage = !this.hasUserMessage(channel);

    // 保存用户消息（使用传入的ID或生成新ID）
    const userMsg = {
      id: msgId || ('msg_' + Date.now()),
      role: 'user',
      content: content,
      timestamp: now
    };
    Storage.saveMessage(channelId, userMsg);

    // 如果是第一条用户消息，启动主动推送定时器
    if (isFirstUserMessage) {
      console.log('[Chat] 用户发送了第一条消息，启动主动推送定时器');
      const updatedChannel = Storage.getChannel(channelId);
      this.setupProactiveCheck(updatedChannel);
    }

    // 检查待处理的主动联络是否是持久的
    const pendingContact = Storage.getPendingContact(channelId);
    if (pendingContact && pendingContact.persistent) {
      // 持久联络不取消
      console.log('[Chat] 用户发言，但保留持久联络：', pendingContact.reason);
    } else {
      // 取消非持久的主动联络
      Storage.clearPendingContact(channelId);
      if (this.scheduledContactTimer) {
        clearTimeout(this.scheduledContactTimer);
        this.scheduledContactTimer = null;
        console.log('[Chat] 用户发言，取消待处理的主动联络');
      }
    }

    // 检查当前状态是否有回复延迟
    const status = Storage.getStatus(channelId);
    if (status && status.replyDelay) {
      const { min, max } = status.replyDelay;
      const delayMinutes = min + Math.random() * (max - min);
      const delayMs = delayMinutes * 60 * 1000;

      console.log(`[Chat] 状态 "${status.label}" 导致回复延迟 ${Math.round(delayMinutes)} 分钟`);

      // 返回一个特殊标记，让UI知道回复会延迟
      // 实际回复在延迟后发送
      this.scheduleDelayedReply(channelId, content, settings, delayMs, status);

      return {
        delayed: true,
        delayMinutes: Math.round(delayMinutes),
        statusLabel: status.label
      };
    }

    // 正常发送（无延迟）
    return await this.processAndSendReply(channelId, content, settings);
  },

  // 处理并发送AI回复（内部方法）
  async processAndSendReply(channelId, content, settings) {
    const channel = Storage.getChannel(channelId);
    if (!channel) throw new Error('频道不存在');

    const now = new Date().toISOString();

    // 构建时间上下文
    const messages = Storage.getMessages(channelId);
    const timeContext = TimeManager.buildTimeContext(messages, now);

    // 添加状态信息到提示词
    const status = Storage.getStatus(channelId);
    let statusContext = '';
    if (status) {
      statusContext = `\n\n# 你当前的状态\n\n你目前处于「${status.label}」状态。${status.reason ? `原因：${status.reason}` : ''}\n如果状态结束了，记得在回复中清除状态。`;
    }

    // 构建系统提示词
    const systemPrompt = Character.buildSystemPrompt(channel, timeContext) + statusContext;

    // 准备消息历史（不包括刚发的）
    const historyLimit = settings.historyLimit || 20;
    const historyMessages = historyLimit === 0 ? messages.slice(0, -1) : messages.slice(-(historyLimit + 1), -1);
    const recentMessages = historyMessages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // 添加当前消息
    recentMessages.push({
      role: 'user',
      content: content
    });

    // 获取工具定义
    const tools = getToolDefinitions();

    // 调用API（支持工具调用）
    const response = await API.sendMessageWithTools(systemPrompt, recentMessages, settings, tools);
    let reply = response.content || '';

    // 处理工具调用（如果有）
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log('[Chat] 收到工具调用:', response.tool_calls.map(t => t.function.name));
      const context = { channelId };
      const results = executeToolCalls(response.tool_calls, context);

      // 检查是否有 set_next_contact，需要设置定时器
      for (const result of results) {
        if (result.result.delayMs) {
          this.scheduleNextContact(channelId, result.result.delayMs, result.result.reason);
        }
      }

      // 触发UI更新
      if (window.App && window.App.updateStatusDisplay) {
        window.App.updateStatusDisplay(channelId);
      }
    } else {
      // 回退：解析标签（用于不支持工具调用的模型）
      const statusData = Character.parseStatusTag(reply);
      if (statusData) {
        Character.processStatus(channelId, statusData);
        if (window.App && window.App.updateStatusDisplay) {
          window.App.updateStatusDisplay(channelId);
        }
      }

      const schActions = Character.parseSchTag(reply);
      if (schActions) {
        Character.processSchTag(channelId, schActions);
      }

      const nextContact = Character.parseProactiveTag(reply);
      if (nextContact) {
        let delayMs;
        if (nextContact.unit) {
          const time = nextContact.time || 1;
          switch (nextContact.unit) {
            case 'seconds': delayMs = time * 1000; break;
            case 'minutes': delayMs = time * 60 * 1000; break;
            case 'hours': delayMs = time * 60 * 60 * 1000; break;
            default: delayMs = time * 60 * 1000;
          }
        } else if (nextContact.minutes) {
          delayMs = nextContact.minutes * 60 * 1000;
        } else if (nextContact.hours) {
          delayMs = nextContact.hours * 60 * 60 * 1000;
        } else {
          delayMs = 30 * 60 * 1000;
        }

        const sendAt = new Date(Date.now() + delayMs);
        Storage.setPendingContact(channelId, {
          sendAt: sendAt.toISOString(),
          reason: nextContact.reason,
          persistent: nextContact.persistent || false
        });

        this.scheduleNextContact(channelId, delayMs, nextContact.reason);
      }
    }

    // 移除标记（无论是否使用工具调用）
    reply = Character.removeProactiveTag(reply);

    // 保存AI回复
    const assistantMsg = {
      id: 'msg_' + Date.now() + '_reply',
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString()
    };
    Storage.saveMessage(channelId, assistantMsg);

    return assistantMsg;
  },

  // 安排延迟回复
  scheduleDelayedReply(channelId, content, settings, delayMs, status) {
    console.log(`[Chat] 安排延迟回复: ${Math.round(delayMs / 1000)}秒后`);

    setTimeout(async () => {
      // 确保还在同一个频道
      if (this.currentChannelId !== channelId) {
        console.log('[Chat] 频道已切换，取消延迟回复');
        return;
      }

      try {
        const msg = await this.processAndSendReply(channelId, content, settings);
        if (msg && window.App) {
          window.App.renderChat(channelId);
        }
      } catch (error) {
        console.error('[Chat] 延迟回复失败:', error);
      }
    }, delayMs);
  },

  // 重置概率检查计时器（主动消息发送后调用，避免短时间内连发）
  resetProactiveTimer(channel) {
    if (this.proactiveTimer) {
      clearInterval(this.proactiveTimer);
      this.proactiveTimer = null;
      console.log('[Chat] 重置概率检查计时器');
    }
    // 重新设置
    this.setupProactiveCheck(channel);
  },

  // 只获取AI回复（用于重试，不保存用户消息）
  async getReplyOnly(channelId, content) {
    const settings = Storage.getSettings();

    // 检查当前状态是否有回复延迟
    const status = Storage.getStatus(channelId);
    if (status && status.replyDelay) {
      const { min, max } = status.replyDelay;
      const delayMinutes = min + Math.random() * (max - min);
      const delayMs = delayMinutes * 60 * 1000;

      console.log(`[Chat] 重试：状态导致回复延迟 ${Math.round(delayMinutes)} 分钟`);

      this.scheduleDelayedReply(channelId, content, settings, delayMs, status);

      return {
        delayed: true,
        delayMinutes: Math.round(delayMinutes),
        statusLabel: status.label
      };
    }

    // 直接调用处理方法（消息已经存储过了）
    return await this.processAndSendReply(channelId, content, settings);
  },

  // 安排 AI 决定的主动联络
  scheduleNextContact(channelId, delayMs, reason) {
    // 清除之前的定时器
    if (this.scheduledContactTimer) {
      clearTimeout(this.scheduledContactTimer);
      this.scheduledContactTimer = null;
    }

    console.log(`[Chat] 安排主动联络：${delayMs}ms 后 (${Math.round(delayMs / 1000)}秒)，原因：${reason || '无'}`);

    this.scheduledContactTimer = setTimeout(async () => {
      // 确保还在同一个频道
      if (this.currentChannelId !== channelId) {
        console.log('[Chat] 频道已切换，取消主动联络');
        return;
      }

      // 检查是否还有待处理的联络（可能被用户发言取消了）
      const pendingContact = Storage.getPendingContact(channelId);
      if (!pendingContact) {
        console.log('[Chat] 待处理联络已被清除，跳过');
        return;
      }

      console.log('[Chat] 执行主动联络...');

      try {
        const msg = await this.generateProactiveMessage(channelId, null, reason);
        if (msg && window.App) {
          window.App.renderChat(channelId);
        }
      } catch (error) {
        console.error('[Chat] 主动联络失败:', error);
      }
    }, delayMs);
  },

  // 清理
  cleanup() {
    if (this.proactiveTimer) {
      clearInterval(this.proactiveTimer);
      this.proactiveTimer = null;
    }
    if (this.scheduledContactTimer) {
      clearTimeout(this.scheduledContactTimer);
      this.scheduledContactTimer = null;
    }
    this.currentChannelId = null;
  }
};
