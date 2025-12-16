// 角色编辑界面
import { html, useState, useEffect } from '../index.js';
import { Storage } from '../../storage.js';
import { Character } from '../../character.js';
import { createBlankCharacter } from '../../../data/presets.js';

export function EditorView({ channelId, onBack, onSave, onDelete }) {
  const [channel, setChannel] = useState(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (channelId === 'new' || channelId === 'new_generated') {
      const blank = window._editingGeneratedChannel || createBlankCharacter();
      setChannel(blank);
      setIsNew(true);
    } else {
      const ch = Storage.getChannel(channelId);
      if (ch) {
        setChannel(ch);
        setIsNew(false);
      }
    }
  }, [channelId]);

  function updateField(path, value) {
    setChannel(prev => {
      const updated = { ...prev };
      const parts = path.split('.');
      let obj = updated;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return updated;
    });
  }

  async function handleSave() {
    // 验证
    const errors = Character.validateCharacter(channel);
    if (errors.length > 0) {
      alert(errors.join('\n'));
      return;
    }

    // 保存
    let savedChannel = { ...channel };
    if (isNew) {
      savedChannel.id = 'ch_' + Date.now();
      savedChannel.createdAt = new Date().toISOString();
      savedChannel.messages = [];
    }

    // 处理主动联络设置
    const baseChance = parseFloat(channel.proactiveContact?.baseChance) || 0.1;
    savedChannel.proactiveContact = {
      enabled: true,
      baseChance: baseChance,
      checkIntervalMinutes: 10,
      replyDelayMinutes: { min: 0, max: 10 }
    };

    Storage.saveChannel(savedChannel);
    window._editingGeneratedChannel = null;
    onSave(savedChannel.id);
  }

  function handleDelete() {
    if (confirm('确定要删除这个角色吗？所有聊天记录都将丢失。')) {
      Storage.deleteChannel(channelId);
      onDelete();
    }
  }

  function exportChannel() {
    if (!channel) return;
    const exportData = Storage.exportChannel(channel.id);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${channel.name || 'character'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importChannel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.type === 'channel' && data.channel) {
          setChannel(data.channel);
          setIsNew(true);
          alert('已导入角色数据，请修改后保存');
        } else {
          alert('无效的角色卡文件');
        }
      } catch (error) {
        alert('导入失败：' + error.message);
      }
    };
    input.click();
  }

  if (!channel) {
    return html`<div class="loading">加载中...</div>`;
  }

  const proactive = channel.proactiveContact || { enabled: true, baseChance: 0.1 };
  const chancePercent = Math.round((proactive.baseChance || 0.1) * 100);

  return html`
    <div class="editor-screen">
      <div class="editor-header">
        <h2>${isNew ? '创建角色' : '编辑角色'}</h2>
        <div class="editor-header-actions">
          ${!isNew && html`
            <button onClick=${handleDelete} class="danger">删除</button>
          `}
          <button onClick=${onBack}>取消</button>
          <button onClick=${handleSave} class="primary">保存</button>
        </div>
      </div>
      
      <div class="editor-content">
        <div class="editor-section">
          <h3>基本信息</h3>
          
          <div class="editor-row">
            <label>角色名称</label>
            <input 
              type="text" 
              value=${channel.name || ''} 
              onInput=${(e) => updateField('name', e.target.value)}
              placeholder="例：祈"
            />
          </div>
          
          <div class="editor-row">
            <label>头像 (Emoji)</label>
            <input 
              type="text" 
              value=${channel.avatar || ''} 
              onInput=${(e) => updateField('avatar', e.target.value)}
              placeholder="例：🌙" 
              maxlength="2"
            />
          </div>
          
          <div class="editor-row">
            <label>简介</label>
            <input 
              type="text" 
              value=${channel.tagline || ''} 
              onInput=${(e) => updateField('tagline', e.target.value)}
              placeholder="一句话描述"
            />
          </div>
        </div>

        <div class="editor-section">
          <h3>世界观</h3>
          
          <div class="editor-row">
            <label>世界名称</label>
            <input 
              type="text" 
              value=${channel.world?.name || ''} 
              onInput=${(e) => updateField('world.name', e.target.value)}
              placeholder="例：平行东京"
            />
          </div>
          
          <div class="editor-row">
            <label>世界描述</label>
            <textarea 
              value=${channel.world?.description || ''} 
              onInput=${(e) => updateField('world.description', e.target.value)}
              placeholder="描述这个世界的背景设定..."
            />
          </div>
        </div>

        <div class="editor-section">
          <h3>角色设定</h3>
          
          <div class="editor-row">
            <label>背景故事</label>
            <textarea 
              class="large"
              value=${channel.character?.background || ''} 
              onInput=${(e) => updateField('character.background', e.target.value)}
              placeholder="角色的身份、经历、现状..."
            />
          </div>
          
          <div class="editor-row">
            <label>性格特点</label>
            <textarea 
              value=${channel.character?.personality || ''} 
              onInput=${(e) => updateField('character.personality', e.target.value)}
              placeholder="性格、习惯、喜好..."
            />
          </div>
          
          <div class="editor-row">
            <label>说话风格</label>
            <textarea 
              value=${channel.character?.speechStyle || ''} 
              onInput=${(e) => updateField('character.speechStyle', e.target.value)}
              placeholder="语气、用词习惯、表达方式..."
            />
          </div>
        </div>

        <div class="editor-section">
          <h3>通讯设定</h3>
          
          <div class="editor-row">
            <label>通讯媒介</label>
            <input 
              type="text" 
              value=${channel.connection?.medium || ''} 
              onInput=${(e) => updateField('connection.medium', e.target.value)}
              placeholder="例：神秘网页、老旧收音机"
            />
          </div>
          
          <div class="editor-row">
            <label>媒介说明</label>
            <textarea 
              value=${channel.connection?.mediumDescription || ''} 
              onInput=${(e) => updateField('connection.mediumDescription', e.target.value)}
              placeholder="这个通讯方式是如何被发现的..."
            />
          </div>
          
          <div class="editor-row">
            <label>第一条消息（可选）</label>
            <textarea 
              class="large"
              value=${channel.connection?.firstMessage || ''} 
              onInput=${(e) => updateField('connection.firstMessage', e.target.value)}
              placeholder="用户第一次打开时看到的消息...（留空则等待用户先开口）"
            />
            <div class="hint">角色发出的第一条消息。留空表示等待用户先开口</div>
          </div>
        </div>

        <div class="editor-section">
          <h3>主动联络</h3>
          
          <div class="editor-row">
            <label>粘人程度：${chancePercent}%</label>
            <input 
              type="number" 
              min="0" 
              max="100" 
              value=${chancePercent}
              onInput=${(e) => updateField('proactiveContact.baseChance', parseInt(e.target.value) / 100)}
            />
            <div class="range-labels">
              <span>偶尔想起</span>
              <span>经常想你</span>
              <span>非常粘人</span>
            </div>
          </div>
        </div>

        <div class="editor-section">
          <h3>导入/导出</h3>
          <div class="settings-buttons">
            <button onClick=${exportChannel}>导出角色卡</button>
            <button onClick=${importChannel}>导入角色卡</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

