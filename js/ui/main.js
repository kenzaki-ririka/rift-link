// Preact 应用入口
import { render, html } from './index.js';
import { App } from './App.js';

// 导入核心模块（确保初始化）
import { Storage } from '../storage.js';
import { API } from '../api.js';
import { TimeManager } from '../time.js';
import { Character } from '../character.js';
import { Chat } from '../chat.js';

// 全局暴露（兼容旧代码）
window.Storage = Storage;
window.API = API;
window.TimeManager = TimeManager;
window.Character = Character;
window.Chat = Chat;

// 渲染应用
document.addEventListener('DOMContentLoaded', () => {
  const appContainer = document.getElementById('app');
  render(html`<${App} />`, appContainer);
});

// 页面关闭/刷新时记录退出时间
window.addEventListener('beforeunload', () => {
  Chat.cleanup();
});

