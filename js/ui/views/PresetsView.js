// 预设角色选择界面
import { html, useState, useEffect } from '../index.js';
import { Storage } from '../../storage.js';

export function PresetsView({ onBack, onSelectPreset }) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPresets();
  }, []);

  async function loadPresets() {
    try {
      const response = await fetch('data/presets/index.json');
      const presetIndex = await response.json();
      setPresets(presetIndex.presets || []);
      setLoading(false);
    } catch (err) {
      console.error('Load presets error:', err);
      setError('加载预设失败');
      setLoading(false);
    }
  }

  async function selectPreset(presetId) {
    try {
      const response = await fetch(`data/presets/${presetId}.json`);
      const presetData = await response.json();

      const channel = presetData.channel;
      channel.id = 'ch_' + Date.now();
      channel.isPreset = false;
      channel.messages = [];

      Storage.saveChannel(channel);
      onSelectPreset(channel.id);
    } catch (err) {
      console.error('Load preset error:', err);
      alert('加载预设失败');
    }
  }

  return html`
    <div class="presets-screen">
      <div class="presets-header">
        <button onClick=${onBack}>← 返回</button>
        <h2>预设角色</h2>
      </div>
      
      ${loading && html`<div class="presets-loading">加载中...</div>`}
      
      ${error && html`<div class="presets-error">${error}</div>`}
      
      ${!loading && !error && html`
        <div class="presets-list">
          ${presets.map(preset => html`
            <div class="preset-card" onClick=${() => selectPreset(preset.id)}>
              <div class="preset-avatar">${preset.avatar}</div>
              <div class="preset-info">
                <div class="preset-name">${preset.name}</div>
                <div class="preset-tagline">${preset.tagline}</div>
              </div>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}

