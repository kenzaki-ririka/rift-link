// 主应用组件
import { html, useState, useEffect } from './index.js';
import { Storage } from '../storage.js';
import { Character } from '../character.js';
import { Chat } from '../chat.js';

// 视图组件
import { SelectView } from './views/SelectView.js';
import { ChatView } from './views/ChatView.js';
import { EditorView } from './views/EditorView.js';
import { SettingsView } from './views/SettingsView.js';
import { CreateOptionsView } from './views/CreateOptionsView.js';
import { PresetsView } from './views/PresetsView.js';
import { GeneratorView } from './views/GeneratorView.js';

export function App() {
  const [view, setView] = useState('loading');
  const [channelId, setChannelId] = useState(null);
  const [editingChannelId, setEditingChannelId] = useState(null);

  // 初始化
  useEffect(() => {
    async function init() {
      // 数据迁移
      Storage.migrate();

      // 检查 URL 参数设置 API Key
      checkUrlParams();

      // 初始化预设角色
      await Character.initPresets();

      // 根据 hash 路由
      handleRoute();
    }
    init();

    // 监听 hash 变化
    window.addEventListener('hashchange', handleRoute);
    return () => window.removeEventListener('hashchange', handleRoute);
  }, []);

  // 路由处理
  function handleRoute() {
    const path = window.location.hash.slice(1) || '';
    const isEnteringChat = path.startsWith('chat/');

    // 如果离开聊天视图，记录退出时间
    if (!isEnteringChat && view === 'chat') {
      Chat.cleanup();
    }

    if (path === 'select') {
      setView('select');
    } else if (path === '' || path === '/') {
      const lastChannelId = Storage.getCurrentChannelId();
      if (lastChannelId && Storage.getChannel(lastChannelId)) {
        setChannelId(lastChannelId);
        setView('chat');
      } else {
        setView('select');
      }
    } else if (path === 'settings') {
      setView('settings');
    } else if (path === 'create') {
      setView('createOptions');
    } else if (path === 'presets') {
      setView('presets');
    } else if (path === 'generator') {
      setView('generator');
    } else if (path.startsWith('edit/')) {
      const id = path.replace('edit/', '');
      setEditingChannelId(id);
      setView('editor');
    } else if (path.startsWith('chat/')) {
      const id = path.replace('chat/', '');
      if (Storage.getChannel(id)) {
        setChannelId(id);
        setView('chat');
      } else {
        setView('select');
      }
    } else {
      setView('select');
    }
  }

  // 导航函数
  const navigate = (path) => {
    window.location.hash = path;
  };

  const showSelect = () => navigate('select');
  const showSettings = () => navigate('settings');
  const showCreateOptions = () => navigate('create');
  const showPresets = () => navigate('presets');
  const showGenerator = () => navigate('generator');
  const showChat = (id) => {
    setChannelId(id);
    Storage.setCurrentChannelId(id);
    navigate(`chat/${id}`);
  };
  const showEditor = (id) => {
    setEditingChannelId(id);
    navigate(`edit/${id}`);
  };

  // 检查 URL 参数
  function checkUrlParams() {
    const params = new URLSearchParams(location.search);
    const apiKey = params.get('key') || params.get('apiKey');

    if (apiKey) {
      const settings = Storage.getSettings();
      settings.apiKey = apiKey;

      const provider = params.get('provider');
      if (provider) {
        settings.apiProvider = provider;
      }

      const model = params.get('model');
      if (model) {
        settings.apiModel = model;
      }

      Storage.saveSettings(settings);
      history.replaceState(null, '', location.pathname + location.hash);
    }
  }

  // 渲染视图
  if (view === 'loading') {
    return html`<div class="loading">加载中...</div>`;
  }

  if (view === 'select') {
    return html`<${SelectView} 
      onShowChat=${showChat} 
      onShowEditor=${showEditor}
      onShowSettings=${showSettings}
      onShowCreateOptions=${showCreateOptions}
    />`;
  }

  if (view === 'chat') {
    return html`<${ChatView} 
      channelId=${channelId}
      onBack=${showSelect}
      onShowEditor=${showEditor}
    />`;
  }

  if (view === 'editor') {
    return html`<${EditorView}
      channelId=${editingChannelId}
      onBack=${() => channelId ? showChat(channelId) : showSelect()}
      onSave=${(id) => showChat(id)}
      onDelete=${showSelect}
    />`;
  }

  if (view === 'settings') {
    return html`<${SettingsView}
      onBack=${() => channelId ? showChat(channelId) : showSelect()}
    />`;
  }

  if (view === 'createOptions') {
    return html`<${CreateOptionsView}
      onBack=${showSelect}
      onShowGenerator=${showGenerator}
      onShowPresets=${showPresets}
      onShowEditor=${() => showEditor('new')}
    />`;
  }

  if (view === 'presets') {
    return html`<${PresetsView}
      onBack=${showCreateOptions}
      onSelectPreset=${showChat}
    />`;
  }

  if (view === 'generator') {
    return html`<${GeneratorView}
      onBack=${showCreateOptions}
      onUseCharacter=${showChat}
      onEditCharacter=${showEditor}
    />`;
  }

  return html`<div>未知视图</div>`;
}

