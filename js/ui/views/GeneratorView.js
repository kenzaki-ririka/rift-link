// AI 生成角色界面
import { html, useState } from '../index.js';
import { Storage } from '../../storage.js';
import { API } from '../../api.js';

export function GeneratorView({ onBack, onUseCharacter, onEditCharacter }) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedCharacter, setGeneratedCharacter] = useState(null);
  const [error, setError] = useState(null);

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
    "沉默寡言但善于倾听",
    "天然呆却意外敏锐",
    "成熟稳重却渴望依赖"
  ];

  function generateRandomPrompt() {
    const world = worldTypes[Math.floor(Math.random() * worldTypes.length)];
    const situation = situations[Math.floor(Math.random() * situations.length)];
    const trait = traits[Math.floor(Math.random() * traits.length)];
    return `${world}，${situation}的角色。性格${trait}。`;
  }

  async function doGenerate(promptText) {
    if (!promptText) {
      alert('请输入角色描述');
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedCharacter(null);

    try {
      const settings = Storage.getSettings();
      const character = await API.generateCharacter(promptText, settings);
      setGeneratedCharacter(character);
    } catch (err) {
      console.error('Generate character error:', err);
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function useCharacter() {
    if (!generatedCharacter) return;

    const channel = {
      id: 'ch_' + Date.now(),
      ...generatedCharacter,
      messages: []
    };

    Storage.saveChannel(channel);
    onUseCharacter(channel.id);
  }

  function editCharacter() {
    if (!generatedCharacter) return;

    const channel = {
      id: 'new_generated',
      ...generatedCharacter,
      messages: []
    };

    window._editingGeneratedChannel = channel;
    onEditCharacter('new_generated');
  }

  function handleRandom() {
    const randomPrompt = generateRandomPrompt();
    setPrompt(randomPrompt);
    doGenerate(randomPrompt);
  }

  return html`
    <div class="generator-screen">
      <div class="generator-header">
        <button onClick=${onBack}>← 返回</button>
        <h2>AI 生成角色</h2>
      </div>
      
      <div class="generator-content">
        <div class="generator-input-section">
          <label>描述你想要的角色</label>
          <textarea 
            value=${prompt}
            onInput=${(e) => setPrompt(e.target.value)}
            placeholder="例如：
• 末日后独自生存的少女，有点丧但很坚强
• 被困在时间循环里的咖啡店店员
• 深空观测站的AI，刚刚产生自我意识

可以描述世界观、性格、困境等任何你想要的元素..."
          />
        </div>
        
        <div class="generator-actions">
          <button 
            onClick=${() => doGenerate(prompt)} 
            class="primary" 
            disabled=${generating}
          >
            ${generating ? '生成中...' : '✨ 生成角色'}
          </button>
          <button onClick=${handleRandom} disabled=${generating}>
            🎲 随机一个
          </button>
        </div>
        
        ${generating && html`
          <div class="generator-result">
            <div class="generator-loading">
              <div class="loading-spinner"></div>
              <div>正在生成角色...</div>
            </div>
          </div>
        `}
        
        ${error && html`
          <div class="generator-result">
            <div class="generator-error">
              <div>生成失败：${error}</div>
              <button onClick=${() => doGenerate(prompt)}>重试</button>
            </div>
          </div>
        `}
        
        ${generatedCharacter && !generating && html`
          <div class="generator-result" style="display: block;">
            <div class="generator-preview">
              <div class="preview-header">
                <div class="preview-avatar">${generatedCharacter.avatar || '💬'}</div>
                <div class="preview-info">
                  <div class="preview-name">${escapeHtml(generatedCharacter.name)}</div>
                  <div class="preview-tagline">${escapeHtml(generatedCharacter.tagline)}</div>
                </div>
              </div>
              
              <div class="preview-world">
                <div class="preview-label">世界观</div>
                <div class="preview-text">${escapeHtml(generatedCharacter.world?.description || '')}</div>
              </div>
              
              <div class="preview-message">
                <div class="preview-label">第一条消息</div>
                <div class="preview-text first-message">${escapeHtml(generatedCharacter.connection?.firstMessage || '')}</div>
              </div>
              
              <div class="preview-actions">
                <button onClick=${() => doGenerate(prompt)}>重新生成</button>
                <button onClick=${useCharacter} class="primary">使用这个角色</button>
              </div>
              <div class="preview-edit">
                <button onClick=${editCharacter}>查看详情 / 编辑</button>
              </div>
            </div>
          </div>
        `}
      </div>
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
    .replace(/'/g, '&#039;');
}

