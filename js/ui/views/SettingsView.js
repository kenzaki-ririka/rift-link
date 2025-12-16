// 设置界面
import { html, useState, useEffect } from '../index.js';
import { Storage } from '../../storage.js';
import { API } from '../../api.js';
import { Character } from '../../character.js';

export function SettingsView({ onBack }) {
  const [settings, setSettings] = useState(Storage.getSettings());
  const [view, setView] = useState('main'); // main, promptEditor
  const [promptTemplate, setPromptTemplate] = useState('');
  const [proactiveTemplate, setProactiveTemplate] = useState('');

  const providers = API.PROVIDERS;

  function updateSetting(key, value) {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    Storage.saveSettings(newSettings);
  }

  function handleProviderChange(provider) {
    const providerInfo = providers[provider];
    const defaultModel = providerInfo?.defaultModel || '';
    const newSettings = {
      ...settings,
      apiProvider: provider,
      apiModel: defaultModel
    };
    setSettings(newSettings);
    Storage.saveSettings(newSettings);
  }

  function clearAllData() {
    if (confirm('确定要清除所有数据吗？此操作不可恢复！')) {
      localStorage.clear();
      window.location.reload();
    }
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
    alert(`导出成功: ${filename}`);
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
        if (confirm('导入将覆盖现有数据，确定继续吗？')) {
          Storage.importAll(data);
          alert('导入成功');
          window.location.reload();
        }
      } catch (error) {
        alert('导入失败：' + error.message);
      }
    };
    input.click();
  }

  // 提示词编辑器
  function showPromptEditor() {
    setPromptTemplate(Storage.getPromptTemplate() || Character.DEFAULT_PROMPT_TEMPLATE);
    setProactiveTemplate(Storage.getProactiveTemplate() || Character.DEFAULT_PROACTIVE_TEMPLATE);
    setView('promptEditor');
  }

  function savePromptTemplates() {
    if (promptTemplate.trim()) {
      Storage.savePromptTemplate(promptTemplate);
    }
    if (proactiveTemplate.trim()) {
      Storage.saveProactiveTemplate(proactiveTemplate);
    }
    alert('提示词模板已保存');
    setView('main');
  }

  function resetPromptTemplate() {
    if (confirm('确定要恢复所有提示词为默认吗？')) {
      Storage.savePromptTemplate(null);
      Storage.saveProactiveTemplate(null);
      setView('main');
    }
  }

  if (view === 'promptEditor') {
    const placeholderHelp = Object.entries(Character.PLACEHOLDERS)
      .map(([key, desc]) => html`<div><code>${key}</code> - ${desc}</div>`);

    const proactivePlaceholderHelp = Object.entries(Character.PROACTIVE_PLACEHOLDERS)
      .map(([key, desc]) => html`<div><code>${key}</code> - ${desc}</div>`);

    return html`
      <div class="editor-screen">
        <div class="editor-header">
          <h2>提示词模板</h2>
          <div class="editor-header-actions">
            <button onClick=${() => setView('main')}>取消</button>
            <button onClick=${savePromptTemplates} class="primary">保存</button>
          </div>
        </div>
        
        <div class="editor-content">
          <div class="editor-section">
            <h3>系统提示词占位符</h3>
            <div class="hint" style="line-height: 1.8;">${placeholderHelp}</div>
          </div>
          
          <div class="editor-section">
            <h3>系统提示词模板</h3>
            <div class="hint" style="margin-bottom: 12px;">定义角色如何扮演和互动的基础提示词</div>
            <textarea 
              class="prompt-editor" 
              value=${promptTemplate}
              onInput=${(e) => setPromptTemplate(e.target.value)}
              placeholder="系统提示词模板..."
            />
            <div class="settings-buttons" style="margin-top: 12px;">
              <button onClick=${() => setPromptTemplate(Character.DEFAULT_PROMPT_TEMPLATE)}>恢复默认</button>
            </div>
          </div>
          
          <div class="editor-section">
            <h3>主动联络提示词占位符</h3>
            <div class="hint" style="line-height: 1.8;">${proactivePlaceholderHelp}</div>
          </div>
          
          <div class="editor-section">
            <h3>主动联络提示词模板</h3>
            <div class="hint" style="margin-bottom: 12px;">角色主动发消息时附加的提示词</div>
            <textarea 
              class="prompt-editor" 
              style="min-height: 200px;"
              value=${proactiveTemplate}
              onInput=${(e) => setProactiveTemplate(e.target.value)}
              placeholder="主动联络提示词模板..."
            />
            <div class="settings-buttons" style="margin-top: 12px;">
              <button onClick=${() => setProactiveTemplate(Character.DEFAULT_PROACTIVE_TEMPLATE)}>恢复默认</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const providerInfo = providers[settings.apiProvider] || {};
  const hasCustomTemplate = Storage.getPromptTemplate();

  return html`
    <div class="settings-screen">
      <div class="settings-header">
        <h2>设置</h2>
        <button onClick=${onBack}>完成</button>
      </div>
      
      <div class="settings-content">
        <div class="settings-section">
          <h3>AI 服务</h3>
          
          <div class="settings-row">
            <label>API 提供商</label>
            <select 
              value=${settings.apiProvider}
              onChange=${(e) => handleProviderChange(e.target.value)}
            >
              ${Object.entries(providers).map(([id, provider]) => html`
                <option value=${id} selected=${settings.apiProvider === id}>
                  ${provider.name}
                </option>
              `)}
            </select>
          </div>
          
          <div class="settings-row">
            <label>API Key</label>
            <input 
              type="password" 
              value=${settings.apiKey || ''} 
              onInput=${(e) => updateSetting('apiKey', e.target.value)}
              placeholder="输入你的 API Key"
            />
            <div class="hint">密钥仅保存在本地浏览器中</div>
          </div>
          
          <div class="settings-row">
            <label>模型</label>
            <select 
              value=${settings.apiModel}
              onChange=${(e) => updateSetting('apiModel', e.target.value)}
            >
              ${providerInfo.models?.length > 0 
                ? providerInfo.models.map(model => html`
                    <option value=${model.id} selected=${settings.apiModel === model.id}>
                      ${model.name}
                    </option>
                  `)
                : html`<option value="">请手动输入模型名称</option>`
              }
            </select>
          </div>
          
          ${settings.apiProvider === 'openai_compatible' && html`
            <div class="settings-row">
              <label>API 端点</label>
              <input 
                type="text" 
                value=${settings.apiEndpoint || ''} 
                onInput=${(e) => updateSetting('apiEndpoint', e.target.value)}
                placeholder="https://api.example.com/v1/chat/completions"
              />
            </div>
          `}
          
          <div class="settings-row">
            <label>历史对话记忆数量，0为无限制</label>
            <input 
              type="number" 
              value=${settings.historyLimit ?? 20} 
              min="0"
              onInput=${(e) => updateSetting('historyLimit', parseInt(e.target.value) || 0)}
            />
            <div class="hint">AI能记住的对话数量。越多越消耗Token，无限制可能导致超出上下文长度</div>
          </div>
        </div>

        <div class="settings-section">
          <h3>提示词模板</h3>
          <div class="hint" style="margin-bottom: 12px;">自定义 AI 的系统提示词，控制角色行为</div>
          <div class="settings-buttons">
            <button onClick=${showPromptEditor}>编辑提示词模板</button>
            ${hasCustomTemplate && html`
              <button onClick=${resetPromptTemplate} class="danger">恢复默认</button>
            `}
          </div>
          ${hasCustomTemplate && html`
            <div class="hint" style="margin-top: 8px; color: var(--accent);">✓ 正在使用自定义模板</div>
          `}
        </div>

        <div class="settings-section">
          <h3>数据管理</h3>
          <div class="settings-buttons">
            <button onClick=${exportAll}>导出全部数据</button>
            <button onClick=${importAll}>导入数据</button>
            <button onClick=${clearAllData} class="danger">清除所有数据</button>
          </div>
          <div class="hint" style="margin-top: 12px;">建议定期导出备份，防止数据丢失</div>
        </div>
      </div>
    </div>
  `;
}

