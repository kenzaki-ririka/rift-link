// 主应用
const App = {
  currentView: 'select', // select, chat, editor, settings
  currentChannelId: null,
  editingChannelId: null,

  // 初始化
  init() {
    // 初始化预设角色
    Character.initPresets();

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
    const app = document.getElementById('app');

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
              <div class="chat-header-status">${channel.tagline || '点击查看详情'}</div>
            </div>
          </div>
        </div>
        
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

  renderMessage(msg) {
    const timeStr = TimeManager.formatMessageTime(msg.timestamp);
    return `
      <div class="message ${msg.role}">
        <div class="message-time">${timeStr}</div>
        <div class="message-content">${this.escapeHtml(msg.content)}</div>
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  },

  autoResizeInput(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  },

  async sendMessage() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const content = input?.value?.trim();
    
    if (!content || !this.currentChannelId) return;

    // 禁用输入
    input.disabled = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    // 显示用户消息
    const messagesContainer = document.getElementById('messages');
    const userMsgHtml = this.renderMessage({
      role: 'user',
      content: content,
      timestamp: new Date().toISOString()
    });
    messagesContainer.insertAdjacentHTML('beforeend', userMsgHtml);
    
    // 显示加载状态
    messagesContainer.insertAdjacentHTML('beforeend', `
      <div class="message assistant" id="pendingMsg">
        <div class="message-pending">
          <span></span><span></span><span></span>
        </div>
      </div>
    `);
    this.scrollToBottom();

    try {
      const reply = await Chat.sendMessage(this.currentChannelId, content);
      
      // 移除加载状态
      document.getElementById('pendingMsg')?.remove();
      
      // 显示回复
      const replyHtml = this.renderMessage(reply);
      messagesContainer.insertAdjacentHTML('beforeend', replyHtml);
      this.scrollToBottom();

    } catch (error) {
      console.error('Send message error:', error);
      document.getElementById('pendingMsg')?.remove();
      
      // 显示错误
      messagesContainer.insertAdjacentHTML('beforeend', `
        <div class="message assistant">
          <div class="message-content" style="color: #ff6b6b;">
            连接出错：${this.escapeHtml(error.message)}
          </div>
        </div>
      `);
      this.scrollToBottom();
    }

    // 恢复输入
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
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
    let channel;

    if (isNew) {
      channel = createBlankCharacter();
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
    if (isNew) {
      channel.createdAt = new Date().toISOString();
      channel.messages = [];
    }
    Storage.saveChannel(channel);

    // 返回
    if (isNew) {
      this.showChat(channel.id);
    } else if (this.currentChannelId === channel.id) {
      this.showChat(channel.id);
    } else {
      this.showSelect();
    }
  },

  cancelEditor() {
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

  createNewChannel() {
    this.showEditor('new');
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
