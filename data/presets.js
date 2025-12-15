// 预设角色加载器
export const PresetLoader = {
  // 预设角色列表（从 JSON 加载后填充）
  presets: {},
  
  // 加载所有预设角色
  async loadAll() {
    try {
      // 加载索引文件
      const indexResponse = await fetch('data/presets/index.json');
      if (!indexResponse.ok) {
        console.warn('预设索引文件不存在，跳过加载预设');
        return {};
      }
      
      const index = await indexResponse.json();
      
      // 并行加载所有预设
      const loadPromises = index.presets.map(async (filename) => {
        try {
          const response = await fetch(`data/presets/${filename}`);
          if (response.ok) {
            const data = await response.json();
            if (data.version === 1 && data.type === 'channel' && data.channel) {
              return data.channel;
            }
          }
        } catch (e) {
          console.warn(`加载预设失败: ${filename}`, e);
        }
        return null;
      });
      
      const results = await Promise.all(loadPromises);
      
      // 将结果转换为对象
      for (const preset of results) {
        if (preset && preset.id) {
          this.presets[preset.id] = preset;
        }
      }
      
      console.log(`已加载 ${Object.keys(this.presets).length} 个预设角色`);
      return this.presets;
    } catch (e) {
      console.error('加载预设角色失败:', e);
      return {};
    }
  },
  
  // 获取所有预设
  getAll() {
    return this.presets;
  },
  
  // 获取单个预设
  get(id) {
    return this.presets[id] || null;
  }
};

// 创建空白角色卡模板
export function createBlankCharacter() {
  return {
    id: 'char_' + Date.now(),
    name: '',
    avatar: '💬',
    tagline: '',
    
    world: {
      name: '',
      description: ''
    },
    
    character: {
      background: '',
      personality: '',
      speechStyle: ''
    },
    
    connection: {
      medium: '',
      mediumDescription: '',
      firstMessage: ''
    },
    
    proactiveContact: {
      enabled: true,
      baseChance: 0.1,
      checkIntervalMinutes: 10,
      replyDelayMinutes: { min: 0, max: 10 }
    }
  };
}

