// 频道选择界面
import { html, useState, useEffect } from '../index.js';
import { Storage } from '../../storage.js';
import { TimeManager } from '../../time.js';

export function SelectView({ onShowChat, onShowEditor, onShowSettings, onShowCreateOptions }) {
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    loadChannels();
  }, []);

  function loadChannels() {
    const allChannels = Storage.getChannels();
    const channelList = Object.values(allChannels).sort((a, b) => {
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt) : new Date(a.createdAt || 0);
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt) : new Date(b.createdAt || 0);
      return timeB - timeA;
    });
    setChannels(channelList);
  }

  function exportAll() {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `rift-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    if (window.showToast) {
      window.showToast(`已导出: ${filename}`);
    } else {
      alert(`导出成功！\n文件名：${filename}`);
    }
  }

  function importAll() {
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
          const channel = Storage.importChannel(data);
          alert(`已导入角色「${channel.name}」`);
          loadChannels();
        } else {
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
  }

  return html`
    <div class="select-screen">
      <div class="select-header">
        <h1>裂隙通讯</h1>
        <p>选择一个频道开始连接</p>
      </div>
      
      <div class="channel-list">
        ${channels.map(channel => html`
          <${ChannelCard} 
            key=${channel.id}
            channel=${channel} 
            onClick=${() => onShowChat(channel.id)}
          />
        `)}
        
        <div class="channel-card create-card" onClick=${onShowCreateOptions}>
          <span>+ 创建新连接</span>
        </div>
      </div>
      
      <div class="select-footer">
        <button onClick=${onShowSettings}>设置</button>
        <button onClick=${exportAll}>导出数据</button>
        <button onClick=${importAll}>导入数据</button>
      </div>
    </div>
  `;
}

function ChannelCard({ channel, onClick }) {
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

  return html`
    <div class="channel-card" onClick=${onClick}>
      <div class="channel-card-header">
        <div class="channel-avatar">${channel.avatar || '💬'}</div>
        <div>
          <div class="channel-name">${channel.name || '未命名'}</div>
          <div class="channel-tagline">${channel.tagline || ''}</div>
        </div>
      </div>
      ${lastMsgPreview && html`
        <div class="channel-card-footer">
          <div class="channel-last-message">${lastMsgPreview}</div>
          <div class="channel-time">${lastMsgTime}</div>
        </div>
      `}
    </div>
  `;
}

