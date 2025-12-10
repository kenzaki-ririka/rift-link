// 聊天逻辑
const Chat = {
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

    // 设置新的主动联络检查
    this.setupProactiveCheck(channel);

    // 更新最后访问时间
    Storage.setLastVisit(channelId, new Date().toISOString());
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
      // 概率判定
      if (Math.random() < baseChance) {
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
    
    // 构建提示词（传入 reason）
    const systemPrompt = Character.buildProactivePrompt(channel, timeContext, reason);
    
    // 准备消息历史
    const historyLimit = settings.historyLimit || 20;
    const recentMessages = (historyLimit === 0 ? messages : messages.slice(-historyLimit)).map(m => ({
      role: m.role,
      content: m.content
    }));

    // 添加一个触发消息
    recentMessages.push({
      role: 'user',
      content: `[系统：请生成一条你主动发送的消息。你那边现在是：${timeOfDay}${hours}:${minutes}]`
    });

    try {
      let reply = await API.sendMessage(systemPrompt, recentMessages, settings);
      reply = Character.removeProactiveTag(reply);

      const newMsg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        role: 'assistant',
        content: reply,
        timestamp: msgTimestamp,
        isProactive: true
      };

      Storage.saveMessage(channelId, newMsg);
      
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
  async sendMessage(channelId, content) {
    const channel = Storage.getChannel(channelId);
    if (!channel) throw new Error('频道不存在');

    const settings = Storage.getSettings();
    const now = new Date().toISOString();

    // 保存用户消息
    const userMsg = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: content,
      timestamp: now
    };
    Storage.saveMessage(channelId, userMsg);

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

    // 构建时间上下文
    const messages = Storage.getMessages(channelId);
    const timeContext = TimeManager.buildTimeContext(messages, now);

    // 构建系统提示词
    const systemPrompt = Character.buildSystemPrompt(channel, timeContext);

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

    // 调用API
    let reply = await API.sendMessage(systemPrompt, recentMessages, settings);

    // 解析主动联络标记
    const nextContact = Character.parseProactiveTag(reply);
    if (nextContact) {
      // 计算毫秒数
      let delayMs;
      if (nextContact.unit) {
        // 新格式: {time, unit, reason}
        const time = nextContact.time || 1;
        switch (nextContact.unit) {
          case 'seconds':
            delayMs = time * 1000;
            break;
          case 'minutes':
            delayMs = time * 60 * 1000;
            break;
          case 'hours':
            delayMs = time * 60 * 60 * 1000;
            break;
          default:
            delayMs = time * 60 * 1000; // 默认分钟
        }
      } else if (nextContact.minutes) {
        // 旧格式: {minutes, reason}
        delayMs = nextContact.minutes * 60 * 1000;
      } else if (nextContact.hours) {
        // 更旧的格式: {hours, reason}
        delayMs = nextContact.hours * 60 * 60 * 1000;
      } else {
        delayMs = 30 * 60 * 1000; // 默认30分钟
      }
      
      const sendAt = new Date(Date.now() + delayMs);
      Storage.setPendingContact(channelId, {
        sendAt: sendAt.toISOString(),
        reason: nextContact.reason,
        persistent: nextContact.persistent || false  // 是否持久（不被玩家消息取消）
      });

      // 设置定时器来实际发送主动消息
      this.scheduleNextContact(channelId, delayMs, nextContact.reason);
    }

    // 移除标记
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

  // 安排 AI 决定的主动联络
  scheduleNextContact(channelId, delayMs, reason) {
    // 清除之前的定时器
    if (this.scheduledContactTimer) {
      clearTimeout(this.scheduledContactTimer);
      this.scheduledContactTimer = null;
    }

    console.log(`[Chat] 安排主动联络：${delayMs}ms 后 (${Math.round(delayMs/1000)}秒)，原因：${reason || '无'}`);

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
