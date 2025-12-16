// 聊天界面
import { html, useState, useEffect, useCallback } from '../index.js';
import { Storage } from '../../storage.js';
import { Chat } from '../../chat.js';
import { TimeManager } from '../../time.js';

export function ChatView({ channelId, onBack, onShowEditor }) {
  const [channel, setChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);

  // 加载频道数据
  useEffect(() => {
    loadChannel();
    Chat.init(channelId);

    // 监听新消息（主动联络/延迟回复）
    const handleNewMessage = (e) => {
      if (e.detail.channelId === channelId) {
        loadChannel();
      }
    };

    // 监听状态更新
    const handleStatusUpdate = (e) => {
      if (e.detail.channelId === channelId) {
        setStatus(Storage.getStatus(channelId));
      }
    };

    window.addEventListener('rift-new-message', handleNewMessage);
    window.addEventListener('rift-status-update', handleStatusUpdate);
    return () => {
      window.removeEventListener('rift-new-message', handleNewMessage);
      window.removeEventListener('rift-status-update', handleStatusUpdate);
    };
  }, [channelId]);

  function loadChannel() {
    const ch = Storage.getChannel(channelId);
    if (ch) {
      setChannel(ch);
      setMessages(ch.messages || []);
      setStatus(Storage.getStatus(channelId));
    }
  }

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      const container = document.getElementById('messages');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 发送消息
  async function sendMessage() {
    const content = inputValue.trim();
    if (!content || sending) return;

    setInputValue('');
    setSending(true);

    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const userMsg = {
      id: msgId,
      role: 'user',
      content: content,
      timestamp: new Date().toISOString()
    };

    // 立即显示用户消息
    setMessages(prev => [...prev, userMsg]);

    try {
      const reply = await Chat.sendMessage(channelId, content, msgId);

      if (reply && !reply.delayed) {
        setMessages(prev => [...prev, reply]);
      }

      // 更新状态
      setStatus(Storage.getStatus(channelId));
    } catch (error) {
      console.error('Send message error:', error);
      // 标记消息失败
      Storage.updateMessage(channelId, msgId, { failed: true });
      setMessages(prev => prev.map(m => 
        m.id === msgId ? { ...m, failed: true } : m
      ));
    } finally {
      setSending(false);
    }
  }

  // 重试发送
  async function retryMessage(msgId) {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    // 清除失败状态
    Storage.updateMessage(channelId, msgId, { failed: false });
    setMessages(prev => prev.map(m => 
      m.id === msgId ? { ...m, failed: false } : m
    ));

    try {
      const reply = await Chat.getReplyOnly(channelId, msg.content);
      if (reply && !reply.delayed) {
        setMessages(prev => [...prev, reply]);
      }
      setStatus(Storage.getStatus(channelId));
    } catch (error) {
      console.error('Retry error:', error);
      Storage.updateMessage(channelId, msgId, { failed: true });
      setMessages(prev => prev.map(m => 
        m.id === msgId ? { ...m, failed: true } : m
      ));
    }
  }

  // 删除失败消息
  function deleteMessage(msgId) {
    Storage.deleteMessage(channelId, msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
  }

  // 格式化剩余时间
  function formatTimeRemaining(endsAt) {
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
  }

  if (!channel) {
    return html`<div class="loading">加载中...</div>`;
  }

  const statusDisplay = channel.statusDisplay || {};
  const showStatus = statusDisplay.enabled && status && status.label;

  return html`
    <div class="chat-screen">
      <div class="chat-header">
        <button class="back-btn" onClick=${onBack} title="返回">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div class="chat-header-main" onClick=${() => onShowEditor(channelId)}>
          <div class="chat-header-avatar">${channel.avatar || '💬'}</div>
          <div class="chat-header-info">
            <div class="chat-header-name">${channel.name || '未命名'}</div>
            <div class="chat-header-tagline">${channel.tagline || ''}</div>
          </div>
        </div>
      </div>
      
      ${showStatus && html`
        <div class="chat-status" style=${statusDisplay.style || ''}>
          <span class="status-label">${status.label || statusDisplay.defaultLabel}</span>
          ${status.endsAt && statusDisplay.showTime && html`
            <span class="status-time">${formatTimeRemaining(status.endsAt)}</span>
          `}
        </div>
      `}
      
      <div class="chat-messages" id="messages">
        ${messages.map(msg => html`
          <${Message} 
            key=${msg.id}
            msg=${msg} 
            onRetry=${() => retryMessage(msg.id)}
            onDelete=${() => deleteMessage(msg.id)}
          />
        `)}
      </div>
      
      <div class="chat-input-area">
        <textarea 
          id="messageInput" 
          placeholder="输入消息..." 
          rows="1"
          value=${inputValue}
          onInput=${(e) => {
            setInputValue(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
        />
        <button onClick=${sendMessage} id="sendBtn" disabled=${sending}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// 消息组件
function Message({ msg, onRetry, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);
  const timeStr = TimeManager.formatMessageTime(msg.timestamp);

  return html`
    <div class="message ${msg.role}${msg.failed ? ' failed' : ''}" id=${msg.id}>
      <div class="message-time">${timeStr}</div>
      <div class="message-content" dangerouslySetInnerHTML=${{ __html: escapeHtml(msg.content) }} />
      ${msg.failed && html`
        <div class="message-failed">
          <button class="failed-btn" onClick=${() => setShowMenu(!showMenu)} title="发送失败">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
          </button>
          ${showMenu && html`
            <div class="failed-menu">
              <button onClick=${() => { setShowMenu(false); onRetry(); }}>重试</button>
              <button onClick=${() => { setShowMenu(false); onDelete(); }}>删除</button>
            </div>
          `}
        </div>
      `}
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

