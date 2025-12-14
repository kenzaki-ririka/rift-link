// 角色卡管理与提示词构建
const Character = {
  // 默认提示词模板（用户可在设置中自定义）
  DEFAULT_PROMPT_TEMPLATE: `# 角色设定

你是「{{name}}」。

## 世界观
{{world}}

## 你的背景
{{background}}

## 性格特点
{{personality}}

## 说话风格
{{speechStyle}}

## 通讯媒介
{{medium}}

---

# 互动规则

1. 始终保持角色，你是{{name}}，不是AI助手
2. 对话要自然，像真的在和一个人聊天
3. 可以主动问问题，对对方的世界表示好奇
4. 可以描述你周围的环境或正在做的事、遇到的事件和危险
5. 根据当前日期、时刻和对方回复间隔来设计回话，思考自己和对方的世界发生了什么，如对方回复得晚可以表示思念甚至嗔怪
6. 设计有趣的情节、递进的故事和紧张的冲突让用户感觉到你的世界正在动态地变化
7. 保持对话节奏，多生成短消息

---

# 时间信息

{{timeContext}}

---

# 控制标签

在消息末尾添加标签控制后续行为（对方看不到）。

## 主动联络
- \`<nc:5m>\` = 5分钟后主动联系
- \`<nc:1h:想你了>\` = 1小时后联系，原因是想你了
- \`<nc:5s>\` = 5秒后追加消息（话没说完）

## 持久联络（不会被取消）
对方要求定时提醒时使用：
- \`<nc!:6h:叫起床>\` = 6小时后叫起床（持久）

## 睡眠状态
要睡觉时，设置状态并安排早安：
- \`<st:睡眠中:6h|noreply|chance:0.05><nc!:6h:早安>\`

睡眠中不回复消息，但有5%概率被吵醒主动联络。醒来后状态自动清除。

## 清除状态
- \`<st:clear>\` = 清除当前状态

## 临时状态（覆盖日程）
需要临时改变状态时：
- \`<temp:外出:2h|noreply>\` = 临时外出2小时，不回复
- \`<temp:clear>\` = 清除临时状态，恢复日程

## 修改日程（永久）
- \`<sch:add:工作:09:00-18:00>\` = 添加工作日程
- \`<sch:add:午休:12:00-13:00|noreply>\` = 添加午休（不回复）
- \`<sch:remove:工作>\` = 删除工作日程
- \`<sch:set:睡眠中:22:00-06:00>\` = 修改睡眠时间


---

# 你的日程

{{schedule}}
`,

  // 可用的占位符列表（用于帮助文档）
  PLACEHOLDERS: {
    '{{name}}': '角色名称',
    '{{world}}': '世界观（包含名称和描述）',
    '{{background}}': '角色背景',
    '{{personality}}': '性格特点',
    '{{speechStyle}}': '说话风格',
    '{{medium}}': '通讯媒介（包含描述）',
    '{{timeContext}}': '时间上下文（系统自动生成）',
    '{{schedule}}': '角色日程（系统自动生成）'
  },

  // 构建系统提示词
  buildSystemPrompt(character, timeContext) {
    const { world, character: char, connection } = character;

    // 获取用户自定义模板或使用默认模板
    const customTemplate = Storage.getPromptTemplate();
    const template = customTemplate || this.DEFAULT_PROMPT_TEMPLATE;

    // 构建占位符替换映射
    const worldText = (world.name ? `**${world.name}**\n` : '') + (world.description || '');
    const mediumText = (connection.medium || '') + (connection.mediumDescription ? '\n' + connection.mediumDescription : '');

    // 构建日程信息
    const scheduleText = this.buildScheduleText(character.id);

    const replacements = {
      '{{name}}': character.name || '未命名',
      '{{world}}': worldText,
      '{{background}}': char.background || '',
      '{{personality}}': char.personality || '',
      '{{speechStyle}}': char.speechStyle || '',
      '{{medium}}': mediumText,
      '{{timeContext}}': timeContext.context || '',
      '{{schedule}}': scheduleText
    };

    // 执行占位符替换
    let prompt = template;
    for (const [placeholder, value] of Object.entries(replacements)) {
      prompt = prompt.split(placeholder).join(value);
    }

    return prompt;
  },

  // 构建日程信息文本
  buildScheduleText(channelId) {
    const schedule = Storage.getSchedule(channelId);
    if (!schedule || !schedule.enabled) {
      return '（未设置日程）';
    }

    let text = '';

    // 固定日程
    if (schedule.routine && schedule.routine.length > 0) {
      text += '固定日程：\n';
      for (const slot of schedule.routine) {
        text += `- ${slot.start}-${slot.end} ${slot.label}`;
        if (slot.noreply) text += '（不回复）';
        text += '\n';
      }
    }

    // 当前状态
    const currentStatus = Storage.getScheduleStatus(channelId);
    if (currentStatus) {
      text += `\n当前状态：${currentStatus.label}`;
      if (currentStatus.fromSchedule) {
        text += '（按日程）';
      }
      if (currentStatus.noreply) {
        text += ' - 不回复消息';
      }
    } else {
      text += '\n当前状态：在线';
    }

    return text;
  },

  // 默认主动联络提示词模板
  DEFAULT_PROACTIVE_TEMPLATE: `---

# 当前任务

你想要主动联系对方。这不是回复，是你主动发起的消息。
{{reason}}

请生成一条自然的主动消息。可以是：
- 如果是秒级回复，追加对话
- 分享你刚才看到或做的事
- 想到了之前聊过的话题
- 单纯想知道对方在做什么
- 发现了什么有趣的东西想告诉对方

保持自然，不要太刻意。
`,

  // 主动联络占位符
  PROACTIVE_PLACEHOLDERS: {
    '{{reason}}': '主动联络的原因（系统自动生成）'
  },

  // 构建主动联络时的提示词
  buildProactivePrompt(character, timeContext, reason) {
    const basePrompt = this.buildSystemPrompt(character, timeContext);

    // 获取自定义主动联络模板或使用默认
    const customTemplate = Storage.getProactiveTemplate();
    const template = customTemplate || this.DEFAULT_PROACTIVE_TEMPLATE;

    // 构建 reason 文本
    const reasonText = reason
      ? `你想联系的原因：${reason}`
      : '可能是想到了什么想分享，或者单纯想聊聊。';

    // 替换占位符
    const proactivePrompt = template.split('{{reason}}').join(reasonText);

    return basePrompt + proactivePrompt;
  },

  // 解析AI回复中的主动联络标记
  // 短标签格式：<nc:5m> <nc:1h:原因> <nc!:6h:叫起床>
  parseProactiveTag(text) {
    // 新格式短标签：<nc:时间单位> 或 <nc:时间单位:原因> 或 <nc!:时间单位:原因>
    const shortMatch = text.match(/<nc(!)?:(\d+)([smh])(?::([^>]+))?>/);
    if (shortMatch) {
      const persistent = !!shortMatch[1];  // 有感叹号表示持久
      const time = parseInt(shortMatch[2]);
      const unitChar = shortMatch[3];
      const reason = shortMatch[4] || null;

      const unitMap = { 's': 'seconds', 'm': 'minutes', 'h': 'hours' };
      return {
        time: time,
        unit: unitMap[unitChar],
        reason: reason,
        persistent: persistent
      };
    }

    // 向后兼容：JSON 代码块格式
    const jsonBlockMatch = text.match(/```json\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/);
    if (jsonBlockMatch) {
      try {
        const data = JSON.parse(jsonBlockMatch[1]);
        if (data.nextContact) {
          return data.nextContact;
        }
        return null;
      } catch (e) {
        console.error('Failed to parse JSON block:', e);
      }
    }

    return null;
  },

  // 解析AI回复中的状态标记
  // 短标签格式：<st:标签:时长> <st:标签:时长|noreply> <st:标签:时长|delay:300-1800|chance:0.1> <st:clear>
  parseStatusTag(text) {
    // 清除状态：<st:clear>
    if (text.includes('<st:clear>')) {
      return { clear: true };
    }

    // 设置状态：<st:标签:时长|选项...>
    const stMatch = text.match(/<st:([^:>]+):(\d+)([smh])(?:\|([^>]+))?>/);
    if (stMatch) {
      const label = stMatch[1];
      const time = parseInt(stMatch[2]);
      const unitChar = stMatch[3];
      const options = stMatch[4] || '';

      const unitMap = { 's': 'seconds', 'm': 'minutes', 'h': 'hours' };

      // 解析选项
      let noreply = options.includes('noreply');
      let replyDelay = null;
      let proactiveChance = undefined;

      // 解析 delay:min-max（单位秒）
      const delayMatch = options.match(/delay:(\d+)-(\d+)/);
      if (delayMatch) {
        replyDelay = {
          min: parseInt(delayMatch[1]) / 60,  // 转换为分钟
          max: parseInt(delayMatch[2]) / 60
        };
      }

      // 解析 chance:小数
      const chanceMatch = options.match(/chance:([\d.]+)/);
      if (chanceMatch) {
        proactiveChance = parseFloat(chanceMatch[1]);
      }

      return {
        set: {
          label: label,
          duration: { time: time, unit: unitMap[unitChar] },
          proactiveChance: proactiveChance,
          replyDelay: noreply ? 'noreply' : replyDelay
        }
      };
    }

    // 向后兼容：JSON 代码块格式
    const jsonBlockMatch = text.match(/```json\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/);
    if (jsonBlockMatch) {
      try {
        const data = JSON.parse(jsonBlockMatch[1]);
        if (data.status) {
          return data.status;
        }
      } catch (e) {
        console.error('Failed to parse status from JSON block:', e);
      }
    }
    return null;
  },

  // 处理状态设置
  processStatus(channelId, statusData) {
    if (!statusData) return;

    if (statusData.clear) {
      // 清除状态
      Storage.clearStatus(channelId);
      return;
    }

    if (statusData.set) {
      const s = statusData.set;

      // 计算结束时间
      let endsAt = null;
      if (s.duration) {
        const now = Date.now();
        let durationMs;
        const time = s.duration.time || 1;
        switch (s.duration.unit) {
          case 'seconds':
            durationMs = time * 1000;
            break;
          case 'minutes':
            durationMs = time * 60 * 1000;
            break;
          case 'hours':
            durationMs = time * 60 * 60 * 1000;
            break;
          default:
            durationMs = time * 60 * 60 * 1000; // 默认小时
        }
        endsAt = new Date(now + durationMs).toISOString();
      }

      // 处理 noreply
      let replyDelay = s.replyDelay;
      if (replyDelay === 'noreply') {
        replyDelay = { min: 999999, max: 999999 };  // 超大延迟表示不回复
      }

      const status = {
        label: s.label || null,
        reason: s.reason || null,
        endsAt: endsAt,
        proactiveMultiplier: s.proactiveChance,
        replyDelay: replyDelay,
        noreply: s.replyDelay === 'noreply'  // 标记为不回复状态
      };

      Storage.setStatus(channelId, status);
    }
  },

  // 解析日程修改标签：<sch:add:标签:时间> <sch:remove:标签> <sch:set:标签:时间>
  parseSchTag(text) {
    const results = [];

    // 添加日程：<sch:add:标签:开始-结束|选项>
    const addMatches = text.matchAll(/<sch:add:([^:>]+):(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\|([^>]+))?>/g);
    for (const match of addMatches) {
      results.push({
        action: 'add',
        label: match[1],
        start: match[2],
        end: match[3],
        noreply: (match[4] || '').includes('noreply'),
        chance: (match[4] || '').match(/chance:([\d.]+)/) ? parseFloat((match[4] || '').match(/chance:([\d.]+)/)[1]) : undefined
      });
    }

    // 删除日程：<sch:remove:标签>
    const removeMatches = text.matchAll(/<sch:remove:([^>]+)>/g);
    for (const match of removeMatches) {
      results.push({
        action: 'remove',
        label: match[1]
      });
    }

    // 修改日程：<sch:set:标签:开始-结束|选项>
    const setMatches = text.matchAll(/<sch:set:([^:>]+):(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\|([^>]+))?>/g);
    for (const match of setMatches) {
      results.push({
        action: 'set',
        label: match[1],
        start: match[2],
        end: match[3],
        noreply: (match[4] || '').includes('noreply'),
        chance: (match[4] || '').match(/chance:([\d.]+)/) ? parseFloat((match[4] || '').match(/chance:([\d.]+)/)[1]) : undefined
      });
    }

    return results.length > 0 ? results : null;
  },

  // 处理日程修改
  processSchTag(channelId, actions) {
    if (!actions || actions.length === 0) return;

    const schedule = Storage.getSchedule(channelId);
    if (!schedule) return;

    for (const action of actions) {
      switch (action.action) {
        case 'add':
          // 检查是否已存在同名日程
          const existingAdd = schedule.routine.findIndex(s => s.label === action.label);
          if (existingAdd === -1) {
            schedule.routine.push({
              start: action.start,
              end: action.end,
              label: action.label,
              noreply: action.noreply,
              chance: action.chance
            });
            console.log('[Schedule] 添加日程:', action.label);
          }
          break;

        case 'remove':
          const idx = schedule.routine.findIndex(s => s.label === action.label);
          if (idx !== -1) {
            schedule.routine.splice(idx, 1);
            console.log('[Schedule] 删除日程:', action.label);
          }
          break;

        case 'set':
          // 修改现有日程或添加新的
          const existingSet = schedule.routine.findIndex(s => s.label === action.label);
          if (existingSet !== -1) {
            schedule.routine[existingSet].start = action.start;
            schedule.routine[existingSet].end = action.end;
            if (action.noreply !== undefined) schedule.routine[existingSet].noreply = action.noreply;
            if (action.chance !== undefined) schedule.routine[existingSet].chance = action.chance;
            console.log('[Schedule] 修改日程:', action.label);
          } else {
            schedule.routine.push({
              start: action.start,
              end: action.end,
              label: action.label,
              noreply: action.noreply,
              chance: action.chance
            });
            console.log('[Schedule] 添加日程:', action.label);
          }
          break;
      }
    }

    Storage.saveSchedule(channelId, schedule);
  },

  // 移除控制标记
  removeProactiveTag(text) {
    return text
      // 移除短标签
      .replace(/<nc!?:\d+[smh](?::[^>]+)?>/g, '')
      .replace(/<st:[^>]+>/g, '')
      .replace(/<sch:[^>]+>/g, '')
      // 移除旧格式 JSON 代码块
      .replace(/```json\s*\n?\s*\{[\s\S]*?\}\s*\n?\s*```/g, '')
      // 移除旧格式 HTML 注释
      .replace(/<!--NEXT_CONTACT:\s*{.+?}\s*-->/g, '')
      .trim();
  },

  // 初始化预设角色数据（仅加载，不自动添加到首页）
  async initPresets() {
    // 加载预设角色 JSON 文件（供用户在创建新连接时选择）
    await PresetLoader.loadAll();
    PRESET_CHARACTERS = PresetLoader.getAll();
    // 预设不再自动添加到首页，用户可通过"创建新连接 → 从预设选择"来导入
  },

  // 验证角色卡完整性
  validateCharacter(character) {
    const errors = [];

    if (!character.name?.trim()) {
      errors.push('请填写角色名称');
    }
    if (!character.character?.background?.trim()) {
      errors.push('请填写角色背景');
    }
    // firstMessage 现在是可选的，不再强制要求

    return errors;
  }
};
