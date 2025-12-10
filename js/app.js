// 主应用
const App = {
  currentView: 'select', // select, chat, editor, settings
  currentChannelId: null,
  editingChannelId: null,

  // 初始化
  async init() {
    // 数据迁移（确保旧数据兼容新版本）
    Storage.migrate();

    // 检查URL参数设置API Key（方便测试）
    this.checkUrlParams();

    // 初始化预设角色（异步加载 JSON）
    await Character.initPresets();

    // 检查URL参数
    const path = window.location.hash.slice(1) || '';
    
    if (path === 'select') {
      // 明确要求显示选择界面
      this.showSelect();
    } else if (path === '' || path === '/') {
      // 默认：检查是否有上次的频道
      const lastChannelId = Storage.getCurrentChannelId();
      if (lastChannelId && Storage.getChannel(lastChannelId)) {
        this.showChat(lastChannelId);
        return;
      }
      this.showSelect();
    } else if (path === 'settings') {
      this.showSettings();
    } else if (path.startsWith('edit/')) {
      const channelId = path.replace('edit/', '');
      this.showEditor(channelId);
    } else if (path.startsWith('chat/')) {
      const channelId = path.replace('chat/', '');
      if (Storage.getChannel(channelId)) {
        this.showChat(channelId);
      } else {
        this.showSelect();
      }
    } else {
      this.showSelect();
    }

    // 监听hash变化
    window.addEventListener('hashchange', () => {
      const newPath = window.location.hash.slice(1) || '';
      if (newPath === 'select') {
        this.showSelect();
      } else if (newPath === 'settings') {
        this.showSettings();
      } else if (newPath === '' || newPath === '/') {
        // 空hash时回到上次的聊天或选择界面
        const lastChannelId = Storage.getCurrentChannelId();
        if (lastChannelId && Storage.getChannel(lastChannelId)) {
          this.showChat(lastChannelId);
        } else {
          this.showSelect();
        }
      }
    });
  },

  // 检查URL参数设置API（方便开发测试）
  checkUrlParams() {
    const params = new URLSearchParams(location.search);
    const apiKey = params.get('key') || params.get('apiKey');
    
    if (apiKey) {
      const settings = Storage.getSettings();
      settings.apiKey = apiKey;
      
      // 检查provider参数
      const provider = params.get('provider');
      if (provider && API.PROVIDERS[provider]) {
        settings.apiProvider = provider;
        settings.apiModel = API.PROVIDERS[provider].defaultModel;
      }
      
      // 检查model参数
      const model = params.get('model');
      if (model) {
        settings.apiModel = model;
      }
      
      Storage.saveSettings(settings);
      console.log('[App] API设置已通过URL参数更新:', settings.apiProvider, settings.apiModel);
      
      // 清除URL参数（安全考虑，不让key留在地址栏）
      history.replaceState(null, '', location.pathname + location.hash);
    }
  },

  // ========== 选择界面 ==========
  showSelect() {
    this.currentView = 'select';
    Chat.cleanup();
    this.renderSelect();
  },

  renderSelect() {
    const channels = Storage.getChannels();
    const channelList = Object.values(channels).sort((a, b) => {
      // 按最后消息时间排序
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt) : new Date(a.createdAt || 0);
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt) : new Date(b.createdAt || 0);
      return timeB - timeA;
    });

    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="select-screen">
        <div class="select-header">
          <h1>裂隙通讯</h1>
          <p>选择一个频道开始连接</p>
        </div>
        
        <div class="channel-list">
          ${channelList.map(channel => this.renderChannelCard(channel)).join('')}
          
          <div class="channel-card create-card" onclick="App.createNewChannel()">
            <span>+ 创建新连接</span>
          </div>
        </div>
        
        <div class="select-footer">
          <button onclick="App.showSettings()">设置</button>
          <button onclick="App.exportAll()">导出数据</button>
          <button onclick="App.importAll()">导入数据</button>
        </div>
      </div>
    `;
  },

  renderChannelCard(channel) {
    const messages = channel.messages || [];
    const lastMsg = messages[messages.length - 1];
    let lastMsgPreview = '';
    let lastMsgTime = '';

    if (lastMsg) {
      lastMsgPreview = lastMsg.content.slice(0, 30) + (lastMsg.content.length > 30 ? '...' : '');
      lastMsgTime = TimeManager.formatMessageTime(lastMsg.timestamp);
    } else if (channel.connection?.firstMessage) {
      lastMsgPreview = '新的连接...';
    }

    return `
      <div class="channel-card" onclick="App.showChat('${channel.id}')">
        <div class="channel-card-header">
          <div class="channel-avatar">${channel.avatar || '💬'}</div>
          <div>
            <div class="channel-name">${channel.name || '未命名'}</div>
            <div class="channel-tagline">${channel.tagline || ''}</div>
          </div>
        </div>
        ${lastMsgPreview ? `
          <div class="channel-card-footer">
            <div class="channel-last-message">${lastMsgPreview}</div>
            <div class="channel-time">${lastMsgTime}</div>
          </div>
        ` : ''}
      </div>
    `;
  },

  // ========== 聊天界面 ==========
  async showChat(channelId) {
    const channel = Storage.getChannel(channelId);
    if (!channel) {
      this.showSelect();
      return;
    }

    this.currentView = 'chat';
    this.currentChannelId = channelId;
    Storage.setCurrentChannelId(channelId);
    
    // 初始化聊天
    await Chat.init(channelId);
    
    this.renderChat(channelId);
  },

  renderChat(channelId) {
    const channel = Storage.getChannel(channelId);
    if (!channel) return;

    const messages = channel.messages || [];
    const status = Storage.getStatus(channelId);
    const app = document.getElementById('app');

    // 状态显示（仅当角色卡启用时才显示）
    let statusHtml = '';
    if (status && channel.statusDisplay?.enabled) {
      const timeLeft = status.endsAt ? this.formatTimeRemaining(status.endsAt) : '';
      const displayLabel = status.label || channel.statusDisplay?.defaultLabel || '';
      if (displayLabel) {
        statusHtml = `<div class="chat-status" id="chatStatus" style="${channel.statusDisplay?.style || ''}">
          <span class="status-label">${displayLabel}</span>
          ${timeLeft && channel.statusDisplay?.showTime ? `<span class="status-time">${timeLeft}</span>` : ''}
        </div>`;
      }
    }

    app.innerHTML = `
      <div class="chat-screen">
        <div class="chat-header">
          <button class="back-btn" onclick="App.showSelect()" title="返回">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <div class="chat-header-main" onclick="App.showEditor('${channelId}')">
            <div class="chat-header-avatar">${channel.avatar || '💬'}</div>
            <div class="chat-header-info">
              <div class="chat-header-name">${channel.name || '未命名'}</div>
              <div class="chat-header-tagline">${channel.tagline || ''}</div>
            </div>
          </div>
        </div>
        ${statusHtml}
        
        <div class="chat-messages" id="messages">
          ${messages.map(msg => this.renderMessage(msg)).join('')}
        </div>
        
        <div class="chat-input-area">
          <textarea 
            id="messageInput" 
            placeholder="输入消息..." 
            rows="1"
            onkeydown="App.handleInputKeydown(event)"
            oninput="App.autoResizeInput(this)"
          ></textarea>
          <button onclick="App.sendMessage()" id="sendBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // 滚动到底部
    this.scrollToBottom();
    
    // 聚焦输入框
    document.getElementById('messageInput')?.focus();
  },

  // 格式化剩余时间
  formatTimeRemaining(endsAt) {
    const now = new Date();
    const end = new Date(endsAt);
    const diffMs = end - now;
    
    if (diffMs <= 0) return '';
    
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    
    if (diffHours >= 1) {
      const mins = diffMinutes % 60;
      return `约 ${diffHours}小时${mins > 0 ? mins + '分钟' : ''}`;
    }
    return `约 ${diffMinutes}分钟`;
  },

  // 更新状态显示
  updateStatusDisplay(channelId) {
    if (this.currentChannelId !== channelId) return;
    
    const channel = Storage.getChannel(channelId);
    const status = Storage.getStatus(channelId);
    const existingStatus = document.getElementById('chatStatus');
    
    // 如果角色卡未启用状态显示，不显示
    if (!channel?.statusDisplay?.enabled || !status) {
      existingStatus?.remove();
      return;
    }
    
    // 更新或添加状态显示
    const timeLeft = status.endsAt ? this.formatTimeRemaining(status.endsAt) : '';
    const displayLabel = status.label || channel.statusDisplay?.defaultLabel || '';
    
    if (!displayLabel) {
      existingStatus?.remove();
      return;
    }
    
    const statusHtml = `<div class="chat-status" id="chatStatus" style="${channel.statusDisplay?.style || ''}">
      <span class="status-label">${displayLabel}</span>
      ${timeLeft && channel.statusDisplay?.showTime ? `<span class="status-time">${timeLeft}</span>` : ''}
    </div>`;
    
    if (existingStatus) {
      existingStatus.outerHTML = statusHtml;
    } else {
      const header = document.querySelector('.chat-header');
      if (header) {
        header.insertAdjacentHTML('afterend', statusHtml);
      }
    }
  },

  renderMessage(msg) {
    const timeStr = TimeManager.formatMessageTime(msg.timestamp);
    const failedClass = msg.failed ? ' failed' : '';
    const failedIndicator = msg.failed ? `
      <div class="message-failed">
        <button class="failed-btn" onclick="App.showFailedOptions('${msg.id}')" title="发送失败">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
        </button>
      </div>
    ` : '';
    
    return `
      <div class="message ${msg.role}${failedClass}" id="${msg.id || ''}" data-content="${msg.role === 'user' ? this.escapeHtml(msg.content).replace(/"/g, '&quot;') : ''}">
        <div class="message-time">${timeStr}</div>
        <div class="message-content">${this.escapeHtml(msg.content)}</div>
        ${failedIndicator}
      </div>
    `;
  },

  scrollToBottom() {
    const container = document.getElementById('messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  },

  handleInputKeydown(event) {
    // 回车只换行，不发送
    // 发送只能用按钮
  },

  autoResizeInput(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  },

  async sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input?.value?.trim();
    
    if (!content || !this.currentChannelId) return;

    // 清空输入框（但不禁用，用户可以继续输入）
    input.value = '';
    input.style.height = 'auto';

    // 生成消息ID（App和Chat共用）
    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    // 构建消息对象
    const userMsg = {
      id: msgId,
      role: 'user',
      content: content,
      timestamp: new Date().toISOString()
    };

    // 显示用户消息
    const messagesContainer = document.getElementById('messages');
    messagesContainer.insertAdjacentHTML('beforeend', this.renderMessage(userMsg));
    this.scrollToBottom();

    // 异步发送，不阻塞用户继续输入
    const channelId = this.currentChannelId;
    
    try {
      // 传递 msgId 给 Chat，确保存储和UI使用同一个ID
      const reply = await Chat.sendMessage(channelId, content, msgId);
      
      // 确保还在同一个频道
      if (this.currentChannelId !== channelId) return;
      
      // 检查是否是延迟回复
      if (reply && reply.delayed) {
        // 延迟回复：静默处理，回复会在延迟后自动出现
        console.log(`[App] 回复将延迟 ${reply.delayMinutes} 分钟`);
      } else if (reply) {
        // 正常回复：显示回复
        messagesContainer.insertAdjacentHTML('beforeend', this.renderMessage(reply));
        this.scrollToBottom();
        
        // 更新状态显示
        this.updateStatusDisplay(channelId);
      }

    } catch (error) {
      console.error('Send message error:', error);
      
      // 确保还在同一个频道
      if (this.currentChannelId !== channelId) return;
      
      // 标记消息发送失败（同时更新存储）
      this.markMessageFailed(msgId, channelId);
    }
  },

  // 标记消息发送失败
  markMessageFailed(msgId, channelId) {
    const msgElement = document.getElementById(msgId);
    if (!msgElement) return;
    
    // 更新UI
    msgElement.classList.add('failed');
    
    // 添加失败标记（如果还没有）
    if (!msgElement.querySelector('.message-failed')) {
      const failedIndicator = document.createElement('div');
      failedIndicator.className = 'message-failed';
      failedIndicator.innerHTML = `
        <button class="failed-btn" onclick="App.showFailedOptions('${msgId}')" title="发送失败">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
        </button>
      `;
      msgElement.appendChild(failedIndicator);
    }
    
    // 更新存储中的消息状态
    Storage.updateMessage(channelId, msgId, { failed: true });
  },

  // 显示失败消息的选项
  showFailedOptions(msgId) {
    const msgElement = document.getElementById(msgId);
    if (!msgElement) return;
    
    // 如果已经有菜单，移除它
    const existingMenu = msgElement.querySelector('.failed-menu');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }
    
    const menu = document.createElement('div');
    menu.className = 'failed-menu';
    menu.innerHTML = `
      <button onclick="App.retryMessage('${msgId}')">重试</button>
      <button onclick="App.deleteFailedMessage('${msgId}')">删除</button>
    `;
    msgElement.appendChild(menu);
    
    // 点击其他地方关闭菜单
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && !e.target.closest('.failed-btn')) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  },

  // 重试发送消息
  async retryMessage(msgId) {
    const msgElement = document.getElementById(msgId);
    if (!msgElement) return;
    
    const content = msgElement.dataset.content;
    if (!content) return;
    
    const channelId = this.currentChannelId;
    
    // 移除失败状态和菜单
    msgElement.classList.remove('failed');
    msgElement.querySelector('.message-failed')?.remove();
    msgElement.querySelector('.failed-menu')?.remove();
    
    // 更新存储中的失败状态
    Storage.updateMessage(channelId, msgId, { failed: false });
    
    const messagesContainer = document.getElementById('messages');
    
    try {
      // 重试时不保存消息（已经存储过了），只获取AI回复
      const reply = await Chat.getReplyOnly(channelId, content);
      
      if (this.currentChannelId !== channelId) return;
      
      if (reply && reply.delayed) {
        console.log(`[App] 回复将延迟 ${reply.delayMinutes} 分钟`);
      } else if (reply) {
        messagesContainer.insertAdjacentHTML('beforeend', this.renderMessage(reply));
        this.scrollToBottom();
        this.updateStatusDisplay(channelId);
      }
    } catch (error) {
      console.error('Retry message error:', error);
      if (this.currentChannelId !== channelId) return;
      this.markMessageFailed(msgId, channelId);
    }
  },

  // 删除发送失败的消息
  deleteFailedMessage(msgId) {
    const msgElement = document.getElementById(msgId);
    if (!msgElement) return;
    
    // 关闭菜单
    msgElement.querySelector('.failed-menu')?.remove();
    
    // 从存储中删除
    if (this.currentChannelId) {
      Storage.deleteMessage(this.currentChannelId, msgId);
    }
    
    // 从UI移除
    msgElement.remove();
  },

  // ========== 编辑器界面 ==========
  showEditor(channelId) {
    let channel;
    let isNew = false;

    if (channelId === 'new') {
      channel = createBlankCharacter();
      isNew = true;
    } else {
      channel = Storage.getChannel(channelId);
      if (!channel) {
        this.showSelect();
        return;
      }
    }

    this.currentView = 'editor';
    this.editingChannelId = channelId;
    this.renderEditor(channel, isNew);
  },

  renderEditor(channel, isNew) {
    const proactive = channel.proactiveContact || { enabled: true, baseChance: 0.1 };
    const chancePercent = Math.round((proactive.baseChance || 0.1) * 100);

    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="editor-screen">
        <div class="editor-header">
          <h2>${isNew ? '创建角色' : '编辑角色'}</h2>
          <div class="editor-header-actions">
            ${!isNew ? `<button onclick="App.deleteChannel('${channel.id}')" class="danger">删除</button>` : ''}
            <button onclick="App.cancelEditor()">取消</button>
            <button onclick="App.saveChannel()" class="primary">保存</button>
          </div>
        </div>
        
        <div class="editor-content">
          <div class="editor-section">
            <h3>基本信息</h3>
            
            <div class="editor-row">
              <label>角色名称</label>
              <input type="text" id="ed_name" value="${this.escapeHtml(channel.name || '')}" placeholder="例：祈">
            </div>
            
            <div class="editor-row">
              <label>头像 (Emoji)</label>
              <input type="text" id="ed_avatar" value="${channel.avatar || ''}" placeholder="例：🌙" maxlength="2">
            </div>
            
            <div class="editor-row">
              <label>简介</label>
              <input type="text" id="ed_tagline" value="${this.escapeHtml(channel.tagline || '')}" placeholder="一句话描述">
            </div>
          </div>

          <div class="editor-section">
            <h3>世界观</h3>
            
            <div class="editor-row">
              <label>世界名称</label>
              <input type="text" id="ed_worldName" value="${this.escapeHtml(channel.world?.name || '')}" placeholder="例：平行东京">
            </div>
            
            <div class="editor-row">
              <label>世界描述</label>
              <textarea id="ed_worldDesc" placeholder="描述这个世界的背景设定...">${this.escapeHtml(channel.world?.description || '')}</textarea>
            </div>
          </div>

          <div class="editor-section">
            <h3>角色设定</h3>
            
            <div class="editor-row">
              <label>背景故事</label>
              <textarea id="ed_background" class="large" placeholder="角色的身份、经历、现状...">${this.escapeHtml(channel.character?.background || '')}</textarea>
            </div>
            
            <div class="editor-row">
              <label>性格特点</label>
              <textarea id="ed_personality" placeholder="性格、习惯、喜好...">${this.escapeHtml(channel.character?.personality || '')}</textarea>
            </div>
            
            <div class="editor-row">
              <label>说话风格</label>
              <textarea id="ed_speechStyle" placeholder="语气、用词习惯、表达方式...">${this.escapeHtml(channel.character?.speechStyle || '')}</textarea>
            </div>
          </div>

          <div class="editor-section">
            <h3>通讯设定</h3>
            
            <div class="editor-row">
              <label>通讯媒介</label>
              <input type="text" id="ed_medium" value="${this.escapeHtml(channel.connection?.medium || '')}" placeholder="例：神秘网页、老旧收音机">
            </div>
            
            <div class="editor-row">
              <label>媒介说明</label>
              <textarea id="ed_mediumDesc" placeholder="这个通讯方式是如何被发现的...">${this.escapeHtml(channel.connection?.mediumDescription || '')}</textarea>
            </div>
            
            <div class="editor-row">
              <label>第一条消息</label>
              <textarea id="ed_firstMessage" class="large" placeholder="用户第一次打开时看到的消息...">${this.escapeHtml(channel.connection?.firstMessage || '')}</textarea>
              <div class="hint">这是角色发出的第一条消息，用于建立联系</div>
            </div>
          </div>

          <div class="editor-section">
            <h3>主动联络</h3>
            
            <div class="editor-row">
              <label>粘人程度：${chancePercent}%</label>
              <input type="range" id="ed_baseChance" min="0" max="30" value="${chancePercent}">
              <div class="range-labels">
                <span>偶尔想起</span>
                <span>经常想你</span>
                <span>非常粘人</span>
              </div>
              <div class="hint">每10分钟判定一次是否主动联系你</div>
            </div>
          </div>

          <div class="editor-section">
            <h3>导入/导出</h3>
            <div class="settings-buttons">
              <button onclick="App.exportChannel('${channel.id}')">导出角色卡</button>
              <button onclick="App.importChannel()">导入角色卡</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // 粘人程度滑块实时更新
    document.getElementById('ed_baseChance').addEventListener('input', (e) => {
      e.target.previousElementSibling.textContent = `粘人程度：${e.target.value}%`;
    });
  },

  async saveChannel() {
    const isNew = this.editingChannelId === 'new';
    const isGenerated = this.editingChannelId === 'new_generated';
    let channel;

    if (isNew) {
      channel = createBlankCharacter();
    } else if (isGenerated) {
      // 从生成器来的编辑
      channel = this.editingGeneratedChannel || createBlankCharacter();
      channel.id = 'ch_' + Date.now();
    } else {
      channel = Storage.getChannel(this.editingChannelId);
      if (!channel) return;
    }

    // 收集表单数据
    channel.name = document.getElementById('ed_name').value.trim();
    channel.avatar = document.getElementById('ed_avatar').value.trim() || '💬';
    channel.tagline = document.getElementById('ed_tagline').value.trim();
    
    channel.world = {
      name: document.getElementById('ed_worldName').value.trim(),
      description: document.getElementById('ed_worldDesc').value.trim()
    };
    
    channel.character = {
      background: document.getElementById('ed_background').value.trim(),
      personality: document.getElementById('ed_personality').value.trim(),
      speechStyle: document.getElementById('ed_speechStyle').value.trim()
    };
    
    channel.connection = {
      medium: document.getElementById('ed_medium').value.trim(),
      mediumDescription: document.getElementById('ed_mediumDesc').value.trim(),
      firstMessage: document.getElementById('ed_firstMessage').value.trim()
    };

    const baseChance = parseInt(document.getElementById('ed_baseChance').value) / 100;
    channel.proactiveContact = {
      enabled: true,
      baseChance: baseChance,
      checkIntervalMinutes: 10,
      replyDelayMinutes: { min: 0, max: 10 }
    };

    // 验证
    const errors = Character.validateCharacter(channel);
    if (errors.length > 0) {
      alert(errors.join('\n'));
      return;
    }

    // 保存
    if (isNew || isGenerated) {
      channel.createdAt = new Date().toISOString();
      channel.messages = [];
    }
    Storage.saveChannel(channel);

    // 清理
    this.editingGeneratedChannel = null;
    this.generatedCharacter = null;

    // 返回
    if (isNew || isGenerated) {
      this.showChat(channel.id);
    } else if (this.currentChannelId === channel.id) {
      this.showChat(channel.id);
    } else {
      this.showSelect();
    }
  },

  cancelEditor() {
    // 清理生成的角色数据
    this.editingGeneratedChannel = null;
    
    if (this.currentChannelId) {
      this.showChat(this.currentChannelId);
    } else {
      this.showSelect();
    }
  },

  deleteChannel(channelId) {
    const channel = Storage.getChannel(channelId);
    if (!channel) return;

    if (confirm(`确定要删除「${channel.name}」吗？\n所有聊天记录都将丢失。`)) {
      Storage.deleteChannel(channelId);
      this.showSelect();
    }
  },

  // ========== 创建角色流程 ==========
  createNewChannel() {
    this.showCreateOptions();
  },

  showCreateOptions() {
    this.currentView = 'createOptions';
    const app = document.getElementById('app');
    
    app.innerHTML = `
      <div class="create-options-screen">
        <div class="create-options-header">
          <button onclick="App.showSelect()">← 返回</button>
          <h2>创建新连接</h2>
        </div>
        
        <div class="create-options-list">
          <div class="create-option" onclick="App.showGenerator()">
            <div class="create-option-icon">✨</div>
            <div class="create-option-info">
              <div class="create-option-title">AI 生成</div>
              <div class="create-option-desc">描述你想要的角色，AI帮你创建</div>
            </div>
          </div>
          
          <div class="create-option" onclick="App.randomCharacter()">
            <div class="create-option-icon">🎲</div>
            <div class="create-option-info">
              <div class="create-option-title">随机生成</div>
              <div class="create-option-desc">让AI随机创建一个角色</div>
            </div>
          </div>
          
          <div class="create-option" onclick="App.showEditor('new')">
            <div class="create-option-icon">✏️</div>
            <div class="create-option-info">
              <div class="create-option-title">手动创建</div>
              <div class="create-option-desc">从零开始填写角色信息</div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ========== AI生成角色 ==========
  showGenerator() {
    this.currentView = 'generator';
    const app = document.getElementById('app');
    
    app.innerHTML = `
      <div class="generator-screen">
        <div class="generator-header">
          <button onclick="App.showCreateOptions()">← 返回</button>
          <h2>AI 生成角色</h2>
        </div>
        
        <div class="generator-content">
          <div class="generator-input-section">
            <label>描述你想要的角色</label>
            <textarea id="gen_prompt" placeholder="例如：&#10;• 末日后独自生存的少女，有点丧但很坚强&#10;• 被困在时间循环里的咖啡店店员&#10;• 深空观测站的AI，刚刚产生自我意识&#10;&#10;可以描述世界观、性格、困境等任何你想要的元素..."></textarea>
          </div>
          
          <div class="generator-actions">
            <button onclick="App.generateCharacter()" class="primary" id="gen_btn">
              ✨ 生成角色
            </button>
            <button onclick="App.randomCharacter()">
              🎲 随机一个
            </button>
          </div>
          
          <div class="generator-result" id="gen_result" style="display: none;">
            <!-- 生成结果会显示在这里 -->
          </div>
        </div>
      </div>
    `;
  },

  // 生成角色
  async generateCharacter() {
    const promptInput = document.getElementById('gen_prompt');
    const prompt = promptInput?.value?.trim();
    
    if (!prompt) {
      alert('请输入角色描述');
      return;
    }
    
    await this.doGenerate(prompt);
  },

  // 随机生成
  async randomCharacter() {
    // 随机要素池
    const worldTypes = [
      "末日后的废墟世界",
      "人类突然消失的空城",
      "无限循环的某一天",
      "与现实微妙不同的平行世界",
      "遥远未来的太空站",
      "被遗忘的数字空间",
      "都市传说成真的夜晚",
      "与世隔绝的神秘设施",
      "正在缓慢消亡的异世界",
      "只有她一人的梦境边缘"
    ];
    
    const situations = [
      "独自生存已久",
      "被困在某处无法离开",
      "正在躲避某种危险",
      "失去了重要的记忆",
      "时日无多却无人知晓",
      "背负着不能说的秘密",
      "在寻找某个重要的人",
      "守护着某个地方或事物",
      "等待着某件事发生",
      "刚刚意识到世界的真相"
    ];
    
    const traits = [
      "表面开朗但内心孤独",
      "看似冷淡实则温柔",
      "话很多却总在逃避",
      "理性冷静偶尔脆弱",
      "元气满满却藏着伤痛",
      "毒舌但很在意对方",
      "天然呆却意外敏锐",
      "成熟稳重却渴望依赖"
    ];
    
    const world = worldTypes[Math.floor(Math.random() * worldTypes.length)];
    const situation = situations[Math.floor(Math.random() * situations.length)];
    const trait = traits[Math.floor(Math.random() * traits.length)];
    
    const randomPrompt = `${world}，${situation}的角色。性格${trait}。`;
    
    // 如果在生成器界面，填入描述框
    const promptInput = document.getElementById('gen_prompt');
    if (promptInput) {
      promptInput.value = randomPrompt;
    }
    
    await this.doGenerate(randomPrompt);
  },

  // 实际执行生成
  async doGenerate(prompt) {
    const genBtn = document.getElementById('gen_btn');
    const resultDiv = document.getElementById('gen_result');
    
    // 如果不在生成器界面，先跳转
    if (!resultDiv) {
      this.showGenerator();
      const promptInput = document.getElementById('gen_prompt');
      if (promptInput) promptInput.value = prompt;
      // 等待DOM更新后再执行
      await new Promise(r => setTimeout(r, 100));
      return this.doGenerate(prompt);
    }
    
    // 显示loading
    if (genBtn) {
      genBtn.disabled = true;
      genBtn.textContent = '生成中...';
    }
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
      <div class="generator-loading">
        <div class="loading-spinner"></div>
        <div>正在生成角色...</div>
      </div>
    `;
    
    try {
      const settings = Storage.getSettings();
      const character = await API.generateCharacter(prompt, settings);
      
      // 保存生成的角色数据供后续使用
      this.generatedCharacter = character;
      
      // 显示预览
      resultDiv.innerHTML = `
        <div class="generator-preview">
          <div class="preview-header">
            <div class="preview-avatar">${character.avatar || '💬'}</div>
            <div class="preview-info">
              <div class="preview-name">${this.escapeHtml(character.name)}</div>
              <div class="preview-tagline">${this.escapeHtml(character.tagline)}</div>
            </div>
          </div>
          
          <div class="preview-world">
            <div class="preview-label">世界观</div>
            <div class="preview-text">${this.escapeHtml(character.world?.description || '')}</div>
          </div>
          
          <div class="preview-message">
            <div class="preview-label">第一条消息</div>
            <div class="preview-text first-message">${this.escapeHtml(character.connection?.firstMessage || '')}</div>
          </div>
          
          <div class="preview-actions">
            <button onclick="App.doGenerate('${this.escapeHtml(prompt).replace(/'/g, "\\'")}')">重新生成</button>
            <button onclick="App.useGeneratedCharacter()" class="primary">使用这个角色</button>
          </div>
          <div class="preview-edit">
            <button onclick="App.editGeneratedCharacter()">查看详情 / 编辑</button>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Generate character error:', error);
      resultDiv.innerHTML = `
        <div class="generator-error">
          <div>生成失败：${this.escapeHtml(error.message)}</div>
          <button onclick="App.doGenerate('${this.escapeHtml(prompt).replace(/'/g, "\\'")}')">重试</button>
        </div>
      `;
    }
    
    if (genBtn) {
      genBtn.disabled = false;
      genBtn.textContent = '✨ 生成角色';
    }
  },

  // 使用生成的角色
  useGeneratedCharacter() {
    if (!this.generatedCharacter) return;
    
    const channel = {
      id: 'ch_' + Date.now(),
      ...this.generatedCharacter,
      messages: []
    };
    
    Storage.saveChannel(channel);
    this.generatedCharacter = null;
    this.showChat(channel.id);
  },

  // 编辑生成的角色
  editGeneratedCharacter() {
    if (!this.generatedCharacter) return;
    
    const channel = {
      id: 'new_generated',
      ...this.generatedCharacter,
      messages: []
    };
    
    this.editingGeneratedChannel = channel;
    this.currentView = 'editor';
    this.editingChannelId = 'new_generated';
    this.renderEditor(channel, true);
  },

  // ========== 设置界面 ==========
  showSettings() {
    this.currentView = 'settings';
    this.renderSettings();
  },

  renderSettings() {
    const settings = Storage.getSettings();
    const providers = API.PROVIDERS;

    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="settings-screen">
        <div class="settings-header">
          <h2>设置</h2>
          <button onclick="App.closeSettings()">完成</button>
        </div>
        
        <div class="settings-content">
          <div class="settings-section">
            <h3>AI 服务</h3>
            
            <div class="settings-row">
              <label>API 提供商</label>
              <select id="set_provider" onchange="App.onProviderChange()">
                ${Object.entries(providers).map(([id, provider]) => `
                  <option value="${id}" ${settings.apiProvider === id ? 'selected' : ''}>
                    ${provider.name}
                  </option>
                `).join('')}
              </select>
            </div>
            
            <div class="settings-row">
              <label>API Key</label>
              <input type="password" id="set_apiKey" value="${settings.apiKey || ''}" placeholder="输入你的 API Key">
              <div class="hint">密钥仅保存在本地浏览器中</div>
            </div>
            
            <div class="settings-row" id="modelRow">
              <label>模型</label>
              <select id="set_model">
                ${this.renderModelOptions(settings.apiProvider, settings.apiModel)}
              </select>
            </div>
            
            <div class="settings-row" id="endpointRow" style="display: ${settings.apiProvider === 'openai_compatible' ? 'block' : 'none'}">
              <label>API 端点</label>
              <input type="text" id="set_endpoint" value="${settings.apiEndpoint || ''}" placeholder="https://api.example.com/v1/chat/completions">
            </div>
            
            <div class="settings-row">
              <label>历史对话记忆数量</label>
              <select id="set_historyLimit">
                <option value="10" ${settings.historyLimit === 10 ? 'selected' : ''}>10条</option>
                <option value="20" ${settings.historyLimit === 20 || !settings.historyLimit ? 'selected' : ''}>20条</option>
                <option value="50" ${settings.historyLimit === 50 ? 'selected' : ''}>50条</option>
                <option value="100" ${settings.historyLimit === 100 ? 'selected' : ''}>100条</option>
                <option value="200" ${settings.historyLimit === 200 ? 'selected' : ''}>200条</option>
                <option value="0" ${settings.historyLimit === 0 ? 'selected' : ''}>无限制</option>
              </select>
              <div class="hint">AI能记住的对话数量。越多越消耗Token，无限制可能导致超出上下文长度</div>
            </div>
          </div>

          <div class="settings-section">
            <h3>数据管理</h3>
            <div class="settings-buttons">
              <button onclick="App.exportAll()">导出全部数据</button>
              <button onclick="App.importAll()">导入数据</button>
              <button onclick="App.clearAllData()" class="danger">清除所有数据</button>
            </div>
            <div class="hint" style="margin-top: 12px;">建议定期导出备份，防止数据丢失</div>
          </div>
        </div>
      </div>
    `;
  },

  renderModelOptions(provider, currentModel) {
    const providerInfo = API.PROVIDERS[provider];
    if (!providerInfo || providerInfo.models.length === 0) {
      return '<option value="">请手动输入模型名称</option>';
    }
    
    return providerInfo.models.map(model => `
      <option value="${model.id}" ${currentModel === model.id ? 'selected' : ''}>
        ${model.name}
      </option>
    `).join('');
  },

  onProviderChange() {
    const provider = document.getElementById('set_provider').value;
    const modelSelect = document.getElementById('set_model');
    const endpointRow = document.getElementById('endpointRow');
    
    modelSelect.innerHTML = this.renderModelOptions(provider, '');
    
    // 显示/隐藏端点输入
    endpointRow.style.display = provider === 'openai_compatible' ? 'block' : 'none';
    
    // 保存更改
    this.saveSettings();
  },

  saveSettings() {
    const settings = {
      apiProvider: document.getElementById('set_provider').value,
      apiKey: document.getElementById('set_apiKey').value,
      apiModel: document.getElementById('set_model').value,
      apiEndpoint: document.getElementById('set_endpoint')?.value || '',
      historyLimit: parseInt(document.getElementById('set_historyLimit')?.value) || 20
    };
    Storage.saveSettings(settings);
  },

  closeSettings() {
    this.saveSettings();
    
    if (this.currentChannelId) {
      this.showChat(this.currentChannelId);
    } else {
      this.showSelect();
    }
  },

  // ========== 导入/导出 ==========
  exportAll() {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `rift-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  },

  importAll() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (data.type === 'channel') {
          // 这是角色卡文件
          const channel = Storage.importChannel(data);
          alert(`已导入角色「${channel.name}」`);
        } else {
          // 这是完整备份
          if (confirm('导入将覆盖现有数据，确定继续吗？')) {
            Storage.importAll(data);
            alert('导入成功');
            window.location.reload();
          }
        }
      } catch (error) {
        alert('导入失败：' + error.message);
      }
    };

    input.click();
  },

  exportChannel(channelId) {
    const data = Storage.exportChannel(channelId);
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `rift-character-${data.channel.name || 'unknown'}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  },

  importChannel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const channel = Storage.importChannel(data);
        alert(`已导入角色「${channel.name}」`);
        this.showEditor(channel.id);
      } catch (error) {
        alert('导入失败：' + error.message);
      }
    };

    input.click();
  },

  clearAllData() {
    if (confirm('确定要清除所有数据吗？\n这将删除所有角色和聊天记录，且无法恢复。')) {
      if (confirm('真的确定吗？建议先导出备份。')) {
        Storage.clearAll();
        window.location.reload();
      }
    }
  },

  // ========== 工具函数 ==========
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// 暴露给全局
window.App = App;
