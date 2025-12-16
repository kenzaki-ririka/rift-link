// 创建选项界面
import { html } from '../index.js';

export function CreateOptionsView({ onBack, onShowGenerator, onShowPresets, onShowEditor }) {
  return html`
    <div class="create-options-screen">
      <div class="create-options-header">
        <button onClick=${onBack}>← 返回</button>
        <h2>创建新连接</h2>
      </div>
      
      <div class="create-options-list">
        <div class="create-option" onClick=${onShowGenerator}>
          <div class="create-option-icon">✨</div>
          <div class="create-option-info">
            <div class="create-option-title">AI 生成</div>
            <div class="create-option-desc">描述你想要的角色，AI帮你创建</div>
          </div>
        </div>
        
        <div class="create-option" onClick=${onShowEditor}>
          <div class="create-option-icon">✏️</div>
          <div class="create-option-info">
            <div class="create-option-title">手动创建</div>
            <div class="create-option-desc">从零开始填写角色信息</div>
          </div>
        </div>
        
        <div class="create-option" onClick=${onShowPresets}>
          <div class="create-option-icon">📚</div>
          <div class="create-option-info">
            <div class="create-option-title">从预设选择</div>
            <div class="create-option-desc">浏览预设的角色模板</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

