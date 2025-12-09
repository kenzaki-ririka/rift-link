// localStorage 存储管理
const Storage = {
  KEYS: {
    SETTINGS: 'rift_settings',
    CHANNELS: 'rift_channels',
    CURRENT_CHANNEL: 'rift_current_channel'
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
