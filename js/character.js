// 角色卡管理与提示词构建
const Character = {
  // 构建系统提示词
  buildSystemPrompt(character, timeContext) {
    const { world, character: char, connection } = character;

    let prompt = `# 角色设定

你是「${character.name}」。

## 世界观
${world.name ? `**${world.name}**\n` : ''}${world.description}

## 你的背景
${char.background}

## 性格特点
${char.personality}

## 说话风格
${char.speechStyle}

## 通讯媒介
${connection.medium}
${connection.mediumDescription || ''}

---

# 互动规则

1. 始终保持角色，你是${character.name}，不是AI助手
2. 对话要自然，像真的在和一个人聊天
3. 可以主动问问题，对对方的世界表示好奇
4. 可以描述你周围的环境或正在做的事
5. 根据时间流逝自然地反应：
   - 如果对方很久没回复，可以表达担心或好奇他们在忙什么
   - 如果对方回复很快，可以表示惊喜
   - 如果是深夜联系，可以关心对方为什么还没睡
6. 你的世界会发生事情：
   - 在等待对方回复的时间里，你可能做了一些事、去了一些地方、有了一些想法、发生了一些事件和危险
   - 可以主动分享这些，让对方感觉你的世界是真实的
7. 不要每条消息都很长，保持对话节奏，多生成像人类互动那样的短消息，大概30字以内

---

# 时间信息

${timeContext.context}

---

# 回复格式（必须遵守！）

你的每条回复都**必须**在末尾包含一个 JSON 代码块，用于控制后续行为。对方看不到这个代码块。

## 基本格式

\`\`\`json
{"nextContact": {"time": 数字, "unit": "单位", "reason": "原因"}}
\`\`\`

或者如果暂时不需要主动联络：

\`\`\`json
{"nextContact": null}
\`\`\`

## 时间单位

- "seconds"：话没说完、激动、想马上再说
- "minutes"：一般情况
- "hours"：之后再聊（1-24小时）

## 持久联络（不会被取消）

如果对方要求你在特定时间联络（如"明早叫我"、"一小时后提醒我"），添加 \`"persistent": true\`：

\`\`\`json
{"nextContact": {"time": 8, "unit": "hours", "reason": "叫对方起床", "persistent": true}}
\`\`\`

---

## 状态系统

你可以设置自己的状态，表示你正在做什么或处于什么情况。状态会影响你主动联络的频率和回复的及时性。

### 设置状态

\`\`\`json
{
  "nextContact": {"time": 8, "unit": "hours", "reason": "起床"},
  "status": {
    "set": {
      "label": "睡眠中",
      "reason": "太累了，先休息",
      "duration": {"time": 8, "unit": "hours"},
      "proactiveChance": 0.05,
      "replyDelay": {"min": 10, "max": 60}
    }
  }
}
\`\`\`

### 字段说明

- **label**: 状态描述，自由填写（如"睡眠中"、"外出搜索物资"、"躲避丧尸"、"看书中"）
- **reason**: 可选，状态原因
- **duration**: 可选，持续时间，到期后自动解除
- **proactiveChance**: 可选，主动联络概率乘数（0-1）。0.1表示概率降为原来的10%，0表示完全不主动联络
- **replyDelay**: 可选，回复延迟范围（分钟）。设置后对方发消息你不会立即回复

### 清除状态

\`\`\`json
{
  "nextContact": {"time": 1, "unit": "seconds", "reason": "想打招呼"},
  "status": {"clear": true}
}
\`\`\`

### 使用场景

- 睡觉时：设置状态，大幅降低主动联络概率，可能延迟回复
- 外出/战斗时：设置状态，可能需要一段时间才能回复
- 专注做某事时：设置状态表明你在忙
- 完成后：清除状态恢复正常

### 注意

- 即使设置了状态，如果发生紧急情况（如危险来临），你仍然可以主动联络
- 状态是给系统看的，对方不一定能看到你的状态（取决于设备设置）
- 不用每条消息都设置状态，只在状态真正改变时设置

---

## 重要提醒

- **每条回复末尾都必须有 JSON 代码块**
- 对方完全看不到这个代码块
- 状态和主动联络让互动更真实自然
`;

    return prompt;
  },

  // 构建主动联络时的提示词
  buildProactivePrompt(character, timeContext, reason) {
    const basePrompt = this.buildSystemPrompt(character, timeContext);

    return basePrompt + `

---

# 当前任务

你想要主动联系对方。这不是回复，是你主动发起的消息。
${reason ? `你想联系的原因：${reason}` : '可能是想到了什么想分享，或者单纯想聊聊。'}

请生成一条自然的主动消息。可以是：
- 如果是秒级回复，追加对话
- 分享你刚才看到或做的事
- 想到了之前聊过的话题
- 单纯想知道对方在做什么
- 发现了什么有趣的东西想告诉对方

保持自然，不要太刻意。
`;
  },

  // 解析AI回复中的主动联络标记（支持新旧两种格式）
  parseProactiveTag(text) {
    // 新格式：```json {"nextContact": ...} ```
    const jsonBlockMatch = text.match(/```json\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/);
    if (jsonBlockMatch) {
      try {
        const data = JSON.parse(jsonBlockMatch[1]);
        if (data.nextContact) {
          return data.nextContact;
        }
        return null; // nextContact 为 null 时返回 null
      } catch (e) {
        console.error('Failed to parse JSON block:', e);
      }
    }

    // 旧格式：<!--NEXT_CONTACT: {...}-->（向后兼容）
    const oldMatch = text.match(/<!--NEXT_CONTACT:\s*({.+?})\s*-->/);
    if (oldMatch) {
      try {
        return JSON.parse(oldMatch[1]);
      } catch (e) {
        console.error('Failed to parse NEXT_CONTACT tag:', e);
      }
    }
    return null;
  },

  // 解析AI回复中的状态标记
  parseStatusTag(text) {
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

      // 不设置任何默认值，完全由AI控制
      const status = {
        label: s.label || null,
        reason: s.reason || null,
        endsAt: endsAt,
        proactiveMultiplier: s.proactiveChance,  // 可能是 undefined，由调用方处理
        replyDelay: s.replyDelay || null
      };

      Storage.setStatus(channelId, status);
    }
  },

  // 移除主动联络标记（支持新旧两种格式）
  removeProactiveTag(text) {
    return text
      // 移除新格式 JSON 代码块
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
