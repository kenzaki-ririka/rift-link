// localStorage 存储管理
const Storage = {
  KEYS: {
    SETTINGS: 'rift_settings',
    CHANNELS: 'rift_channels',
    CURRENT_CHANNEL: 'rift_current_channel',
    PROMPT_TEMPLATE: 'rift_prompt_template',
    PROACTIVE_TEMPLATE: 'rift_proactive_template'
  },

  // 数据版本，用于迁移
  DATA_VERSION: 2,

  // ========== 数据迁移 ==========
  migrate() {
    const channels = this.getChannels();
    let needsSave = false;

    for (const channelId in channels) {
      const channel = channels[channelId];

      // 迁移1：确保消息有 id
      if (channel.messages && channel.messages.length > 0) {
        channel.messages.forEach((msg, index) => {
          if (!msg.id) {
            msg.id = `msg_migrated_${index}_${Date.now()}`;
            needsSave = true;
          }
        });
      }

      // 迁移2：确保 proactiveContact 有完整结构
      if (!channel.proactiveContact) {
        channel.proactiveContact = {
          enabled: true,
          baseChance: 0.1,
          checkIntervalMinutes: 15,
          replyDelayMinutes: { min: 0, max: 10 }
        };
        needsSave = true;
      } else {
        if (channel.proactiveContact.checkIntervalMinutes === undefined) {
          channel.proactiveContact.checkIntervalMinutes = 15;
          needsSave = true;
        }
        if (!channel.proactiveContact.replyDelayMinutes) {
          channel.proactiveContact.replyDelayMinutes = { min: 0, max: 10 };
          needsSave = true;
        }
      }

      // 迁移3：确保 world 对象存在
      if (!channel.world) {
        channel.world = { name: '', description: '' };
        needsSave = true;
      }

      // 迁移4：确保 character 对象存在
      if (!channel.character) {
        channel.character = { background: '', personality: '', speechStyle: '' };
        needsSave = true;
      }

      // 迁移5：确保 connection 对象存在
      if (!channel.connection) {
        channel.connection = { medium: '', mediumDescription: '', firstMessage: '' };
        needsSave = true;
      }

      // 迁移6：确保 schedule 对象存在
      if (!channel.schedule) {
        channel.schedule = {
          enabled: true,
          routine: [
            { start: "23:00", end: "07:00", label: "睡眠中", noreply: true, chance: 0.05 }
          ],
          temporary: null  // AI 设置的临时状态
        };
        needsSave = true;
      }
    }

    if (needsSave) {
      this.saveChannels(channels);
      console.log('[Storage] 数据迁移完成');
    }
  },

  // ========== 设置 ==========
  getSettings() {
    const data = localStorage.getItem(this.KEYS.SETTINGS);
    return data ? JSON.parse(data) : {
      apiProvider: 'claude',
      apiKey: '',
      apiModel: '',
      historyLimit: 20  // 0 表示无限
    };
  },

  saveSettings(settings) {
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
  },

  // ========== 提示词模板 ==========
  getPromptTemplate() {
    const data = localStorage.getItem(this.KEYS.PROMPT_TEMPLATE);
    return data ? JSON.parse(data) : null;  // null 表示使用默认模板
  },

  savePromptTemplate(template) {
    localStorage.setItem(this.KEYS.PROMPT_TEMPLATE, JSON.stringify(template));
  },

  clearPromptTemplate() {
    localStorage.removeItem(this.KEYS.PROMPT_TEMPLATE);
  },

  // ========== 主动联络提示词模板 ==========
  getProactiveTemplate() {
    const data = localStorage.getItem(this.KEYS.PROACTIVE_TEMPLATE);
    return data ? JSON.parse(data) : null;
  },

  saveProactiveTemplate(template) {
    localStorage.setItem(this.KEYS.PROACTIVE_TEMPLATE, JSON.stringify(template));
  },

  clearProactiveTemplate() {
    localStorage.removeItem(this.KEYS.PROACTIVE_TEMPLATE);
  },

  // ========== 频道（角色）管理 ==========
  getChannels() {
    const data = localStorage.getItem(this.KEYS.CHANNELS);
    return data ? JSON.parse(data) : {};
  },

  saveChannels(channels) {
    localStorage.setItem(this.KEYS.CHANNELS, JSON.stringify(channels));
  },

  getChannel(channelId) {
    const channels = this.getChannels();
    return channels[channelId] || null;
  },

  saveChannel(channel) {
    const channels = this.getChannels();
    channels[channel.id] = channel;
    this.saveChannels(channels);
  },

  deleteChannel(channelId) {
    const channels = this.getChannels();
    delete channels[channelId];
    this.saveChannels(channels);

    // 如果删除的是当前频道，清除当前频道记录
    if (this.getCurrentChannelId() === channelId) {
      this.setCurrentChannelId(null);
    }
  },

  // ========== 当前频道 ==========
  getCurrentChannelId() {
    return localStorage.getItem(this.KEYS.CURRENT_CHANNEL);
  },

  setCurrentChannelId(channelId) {
    if (channelId) {
      localStorage.setItem(this.KEYS.CURRENT_CHANNEL, channelId);
    } else {
      localStorage.removeItem(this.KEYS.CURRENT_CHANNEL);
    }
  },

  // ========== 消息管理 ==========
  getMessages(channelId) {
    const channel = this.getChannel(channelId);
    return channel?.messages || [];
  },

  saveMessage(channelId, message) {
    const channel = this.getChannel(channelId);
    if (!channel) return;

    if (!channel.messages) {
      channel.messages = [];
    }
    channel.messages.push(message);
    channel.lastMessageAt = message.timestamp;
    this.saveChannel(channel);
  },

  deleteMessage(channelId, messageId) {
    const channel = this.getChannel(channelId);
    if (!channel || !channel.messages) return;

    const index = channel.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      channel.messages.splice(index, 1);
      this.saveChannel(channel);
      console.log('[Storage] 删除消息:', messageId);
    }
  },

  updateMessage(channelId, messageId, updates) {
    const channel = this.getChannel(channelId);
    if (!channel || !channel.messages) return;

    const message = channel.messages.find(m => m.id === messageId);
    if (message) {
      Object.assign(message, updates);
      this.saveChannel(channel);
      console.log('[Storage] 更新消息:', messageId, updates);
    }
  },

  // ========== 角色状态（睡眠/忙碌等）==========
  getStatus(channelId) {
    const channel = this.getChannel(channelId);
    if (!channel?.status) return null;

    // 检查状态是否已过期
    if (channel.status.endsAt && new Date(channel.status.endsAt) < new Date()) {
      // 状态已过期，自动清除
      this.clearStatus(channelId);
      return null;
    }

    return channel.status;
  },

  setStatus(channelId, status) {
    const channel = this.getChannel(channelId);
    if (!channel) return;

    channel.status = {
      ...status,
      startedAt: new Date().toISOString()
    };
    this.saveChannel(channel);
    console.log('[Storage] 设置状态:', status.label || status.type);
  },

  clearStatus(channelId) {
    const channel = this.getChannel(channelId);
    if (!channel) return;

    const oldStatus = channel.status;
    channel.status = null;
    this.saveChannel(channel);
    if (oldStatus) {
      console.log('[Storage] 清除状态:', oldStatus.label || oldStatus.type);
    }
  },

  // ========== 日程系统 ==========
  getSchedule(channelId) {
    const channel = this.getChannel(channelId);
    return channel?.schedule || null;
  },

  saveSchedule(channelId, schedule) {
    const channel = this.getChannel(channelId);
    if (!channel) return;
    channel.schedule = schedule;
    this.saveChannel(channel);
  },

  // 根据当前时间检查日程，返回匹配的状态（临时状态优先）
  getScheduleStatus(channelId) {
    const channel = this.getChannel(channelId);
    if (!channel?.schedule?.enabled) return null;

    const schedule = channel.schedule;

    // 临时状态优先
    if (schedule.temporary) {
      if (new Date(schedule.temporary.until) > new Date()) {
        return schedule.temporary;
      } else {
        // 临时状态已过期，清除
        this.clearTemporary(channelId);
      }
    }

    // 检查日程
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();  // 转换为分钟

    for (const slot of schedule.routine || []) {
      const [startH, startM] = slot.start.split(':').map(Number);
      const [endH, endM] = slot.end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      let inSlot = false;
      if (startMinutes <= endMinutes) {
        // 不跨日：如 09:00-18:00
        inSlot = currentTime >= startMinutes && currentTime < endMinutes;
      } else {
        // 跨日：如 23:00-07:00
        inSlot = currentTime >= startMinutes || currentTime < endMinutes;
      }

      if (inSlot) {
        return {
          label: slot.label,
          noreply: slot.noreply || false,
          chance: slot.chance,
          delay: slot.delay,
          fromSchedule: true
        };
      }
    }

    return null;
  },

  setTemporary(channelId, temporary) {
    const channel = this.getChannel(channelId);
    if (!channel?.schedule) return;

    channel.schedule.temporary = temporary;
    this.saveChannel(channel);
    console.log('[Storage] 设置临时状态:', temporary.label, '至', temporary.until);
  },

  clearTemporary(channelId) {
    const channel = this.getChannel(channelId);
    if (!channel?.schedule) return;

    channel.schedule.temporary = null;
    this.saveChannel(channel);
    console.log('[Storage] 清除临时状态');
  },

  // ========== 主动联络状态 ==========
  getPendingContact(channelId) {
    const channel = this.getChannel(channelId);
    return channel?.pendingContact || null;
  },

  setPendingContact(channelId, pendingContact) {
    const channel = this.getChannel(channelId);
    if (!channel) return;

    channel.pendingContact = pendingContact;
    this.saveChannel(channel);
  },

  clearPendingContact(channelId) {
    const channel = this.getChannel(channelId);
    if (!channel) return;

    channel.pendingContact = null;
    this.saveChannel(channel);
  },

  getLastVisit(channelId) {
    const channel = this.getChannel(channelId);
    return channel?.lastVisit || null;
  },

  setLastVisit(channelId, timestamp) {
    const channel = this.getChannel(channelId);
    if (!channel) return;

    channel.lastVisit = timestamp;
    this.saveChannel(channel);
  },

  // ========== 导出/导入 ==========
  exportAll() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      channels: this.getChannels(),
      currentChannel: this.getCurrentChannelId()
    };
  },

  importAll(data) {
    if (!data || data.version !== 1) {
      throw new Error('无效的备份文件');
    }

    if (data.settings) {
      this.saveSettings(data.settings);
    }
    if (data.channels) {
      this.saveChannels(data.channels);
    }
    if (data.currentChannel) {
      this.setCurrentChannelId(data.currentChannel);
    }
  },

  exportChannel(channelId) {
    const channel = this.getChannel(channelId);
    if (!channel) return null;

    return {
      version: 1,
      type: 'channel',
      exportedAt: new Date().toISOString(),
      channel: channel
    };
  },

  importChannel(data) {
    if (!data || data.version !== 1 || data.type !== 'channel') {
      throw new Error('无效的角色卡文件');
    }

    const channel = data.channel;
    // 生成新ID避免冲突
    channel.id = 'char_' + Date.now();
    this.saveChannel(channel);
    return channel;
  },

  // ========== 清除数据 ==========
  clearAll() {
    localStorage.removeItem(this.KEYS.SETTINGS);
    localStorage.removeItem(this.KEYS.CHANNELS);
    localStorage.removeItem(this.KEYS.CURRENT_CHANNEL);
  }
};
