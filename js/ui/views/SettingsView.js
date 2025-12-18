// 设置界面
import { html, useState, useEffect } from '../index.js';
import { Storage } from '../../storage.js';
import { API } from '../../api.js';
import { Prompts, PROMPT_INFO } from '../../prompts.js';

export function SettingsView({ onBack }) {
  const [settings, setSettings] = useState(Storage.getSettings());
  const [view, setView] = useState('main'); // main, promptEditor
  const [useToolCalls, setUseToolCalls] = useState(Storage.getUseToolCalls());

  // 多提示词编辑状态
  const [activePromptTab, setActivePromptTab] = useState('systemPrompt');
  const [promptContents, setPromptContents] = useState({});

  const providers = API.PROVIDERS;

  // 初始化提示词编辑内容
  function initPromptContents() {
    const contents = {};
    for (const key of Prompts.getAllKeys()) {
      contents[key] = Prompts.get(key);
    }
    setPromptContents(contents);
  }

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

  function toggleUseToolCalls() {
    const newValue = !useToolCalls;
    setUseToolCalls(newValue);
    Storage.saveUseToolCalls(newValue);
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

  // 打开提示词编辑器
  function showPromptEditor() {
    initPromptContents();
    setActivePromptTab('systemPrompt');
    setView('promptEditor');
  }

  // 更新当前编辑的提示词
  function updatePromptContent(key, value) {
    setPromptContents(prev => ({ ...prev, [key]: value }));
  }

  // 保存所有提示词
  function saveAllPrompts() {
    for (const key of Prompts.getAllKeys()) {
      const content = promptContents[key];
      const defaultContent = Prompts.getDefault(key);

      // 只有当内容与默认不同时才保存
      if (content && content.trim() !== defaultContent.trim()) {
        Prompts.save(key, content);
      } else {
        Prompts.reset(key);  // 与默认相同则清除自定义
      }
    }
    alert('提示词模板已保存');
    setView('main');
  }

  // 重置当前提示词为默认
  function resetCurrentPrompt() {
    const defaultContent = Prompts.getDefault(activePromptTab);
    updatePromptContent(activePromptTab, defaultContent);
  }

  // 重置所有提示词
  function resetAllPrompts() {
    if (confirm('确定要恢复所有提示词为默认吗？')) {
      Storage.clearAllCustomPrompts();
      initPromptContents();
      alert('已恢复所有提示词为默认');
    }
  }

  // 提示词编辑器视图
  if (view === 'promptEditor') {
    const promptKeys = Prompts.getAllKeys();
    const currentInfo = Prompts.getInfo(activePromptTab);
    const currentContent = promptContents[activePromptTab] || '';
    const hasCustom = Prompts.hasCustom(activePromptTab);

    // 获取当前提示词的占位符
    const placeholders = currentInfo?.placeholders || {};
    const placeholderHelp = Object.entries(placeholders)
      .map(([key, desc]) => html`<div><code>${key}</code> - ${desc}</div>`);

    return html`
      <div class="editor-screen">
        <div class="editor-header">
          <h2>提示词模板</h2>
          <div class="editor-header-actions">
            <button onClick=${() => setView('main')}>取消</button>
            <button onClick=${saveAllPrompts} class="primary">保存全部</button>
          </div>
        </div>
        
        <div class="prompt-tabs">
          ${promptKeys.map(key => {
      const info = Prompts.getInfo(key);
      const isActive = activePromptTab === key;
      const hasCustom = Prompts.hasCustom(key);
      return html`
              <button 
                class="prompt-tab ${isActive ? 'active' : ''} ${hasCustom ? 'custom' : ''}"
                onClick=${() => setActivePromptTab(key)}
              >
                ${info?.name || key}
                ${hasCustom ? html`<span class="custom-badge">✓</span>` : ''}
              </button>
            `;
    })}
        </div>
        
        <div class="editor-content">
          <div class="editor-section">
            <h3>${currentInfo?.name || activePromptTab}</h3>
            <div class="hint" style="margin-bottom: 12px;">${currentInfo?.description || ''}</div>
            
            ${Object.keys(placeholders).length > 0 && html`
              <div class="editor-section" style="margin-bottom: 16px;">
                <h4 style="font-size: 0.75em; color: var(--text-muted); margin-bottom: 8px;">可用占位符</h4>
                <div class="hint" style="line-height: 1.8;">${placeholderHelp}</div>
              </div>
            `}
            
            <textarea 
              class="prompt-editor" 
              value=${currentContent}
              onInput=${(e) => updatePromptContent(activePromptTab, e.target.value)}
              placeholder="输入提示词模板..."
            />
            
            <div class="settings-buttons" style="margin-top: 12px;">
              <button onClick=${resetCurrentPrompt}>恢复此项默认</button>
              <button onClick=${resetAllPrompts} class="danger">恢复全部默认</button>
            </div>
            
            ${hasCustom && html`
              <div class="hint" style="margin-top: 8px; color: var(--accent);">✓ 此提示词已自定义</div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  const providerInfo = providers[settings.apiProvider] || {};
  const hasAnyCustomPrompt = Storage.hasAnyCustomPrompt();

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
          
          <div class="settings-row">
            <label>控制指令解析模式</label>
            <div class="toggle-container" onClick=${toggleUseToolCalls}>
              <div class="toggle-switch ${useToolCalls ? 'active' : ''}">
                <div class="toggle-knob"></div>
              </div>
              <span class="toggle-label">${useToolCalls ? '工具调用 (Tool Calls)' : '短标签解析 (Short Tags)'}</span>
            </div>
            <div class="hint">
              短标签解析：AI通过<code>&lt;nc:5m&gt;</code>等短标签控制状态，兼容性更好<br/>
              工具调用：AI通过函数调用控制状态，需要模型支持工具调用功能
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h3>提示词模板</h3>
          <div class="hint" style="margin-bottom: 12px;">自定义所有提示词模板，完全控制 AI 行为</div>
          <div class="settings-buttons">
            <button onClick=${showPromptEditor}>编辑提示词模板</button>
            ${hasAnyCustomPrompt && html`
              <button onClick=${resetAllPrompts} class="danger">恢复全部默认</button>
            `}
          </div>
          ${hasAnyCustomPrompt && html`
            <div class="hint" style="margin-top: 8px; color: var(--accent);">✓ 正在使用自定义提示词</div>
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
