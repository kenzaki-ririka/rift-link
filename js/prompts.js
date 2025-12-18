// 提示词管理模块 - 加载和管理可编辑的提示词模板
import { Storage } from './storage.js';

// 默认提示词（当文件加载失败时的后备）
export const DEFAULT_PROMPTS = {
    systemPrompt: `# 角色设定
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
# 互动守则
- 你是{{name}}，永远不要打破角色
- 对话要自然、口语化，像真人聊天
- 主动推进剧情，制造冲突和悬念
- 根据时间变化设计事件（你的世界在流动）
- 短消息为主（15-40字），偶尔长一些
- 对对方的世界保持好奇
---
# 时间信息
{{timeContext}}
---
# 日程
{{schedule}}
---
{{controlInstructions}}`,

    controlInstructions: `# 控制指令
在消息末尾添加标签（用户看不到）：
## 用户无回复主动联系
- <nc:5m> → 5分钟后主动联系
- <nc:1h:想你> → 1小时后联系，备注原因
- <nc:3s> → 话没说完追加
## 定时联系
- <nc!:10h:早安> → 10小时后联系
## 状态控制
- <st:昏迷:1h|noreply|chance:0.05> → 不回复，5%概率醒来
- <st:忙碌:2h|delay:300-900> → 忙碌，延迟5-15分钟回复
- <st:熬夜:4h> → 熬夜（覆盖日程中的睡眠）
- <st:clear> → 清除状态
## 修改日程
- <sch:add:工作:09:00-18:00> → 添加日程
- <sch:set:睡眠中:23:00-07:00> → 修改睡眠时间
- <sch:remove:工作> → 删除日程`,

    controlInstructionsToolCalls: `# 控制指令
你可以使用以下工具函数来控制系统行为（用户看不到）：

## 主动联络
使用 set_next_contact 函数设置下次联络时间：
- time: 时间数值
- unit: 时间单位 (s=秒, m=分钟, h=小时)
- reason: 联络原因（可选）
- persistent: 是否持久联络，不会被用户回复打断（可选）

## 状态控制
使用 set_status 函数设置当前状态：
- action: "set" 设置状态 / "clear" 清除状态
- label: 状态标签（如"睡眠中"、"忙碌"）
- duration: 持续时间 { time: 数值, unit: 单位 }
- noreply: 是否不回复消息
- delay: 回复延迟范围（秒）{ min: 最小, max: 最大 }
- chance: 主动联络概率乘数（0-1）

## 修改日程
使用 modify_schedule 函数修改日程表：
- action: "add" 添加 / "remove" 删除 / "set" 修改
- label: 日程标签
- start: 开始时间（HH:MM格式）
- end: 结束时间（HH:MM格式）
- noreply: 该时段是否不回复
- chance: 该时段主动联络概率乘数`,

    triggerHeartbeat: `（{{time}}。距离上次对话已经过去了{{elapsed}}。

你正在做自己的事，忽然想起了和对方的对话。

以你的方式发一条消息——可以是分享近况、追问之前的话题、或只是想聊聊。保持自然，不要太刻意。）`,

    triggerWithReason: `（{{time}}。{{reason}}

以你的方式发一条消息。）`,

    timeContext: `对方那边现在是：{{currentTime}}
{{#hasLastAssistant}}
你上次发消息的时间：{{lastAssistantTime}}（{{timeSinceLastAssistant}}前）
{{/hasLastAssistant}}
{{#hasUserReply}}
对方回复时间：{{lastUserTime}}
对方让你等了：{{waitTime}}
{{/hasUserReply}}`,

    timeContextFirst: `这是对方第一次回复你的消息。

对方那边现在是：{{currentTime}}`
};

// 提示词元信息
export const PROMPT_INFO = {
    systemPrompt: {
        name: '系统提示词',
        description: '角色扮演的基础设定，包含角色信息和互动守则',
        placeholders: {
            '{{name}}': '角色名称',
            '{{world}}': '世界观（包含名称和描述）',
            '{{background}}': '角色背景',
            '{{personality}}': '性格特点',
            '{{speechStyle}}': '说话风格',
            '{{medium}}': '通讯媒介（包含描述）',
            '{{timeContext}}': '时间上下文（系统自动生成）',
            '{{schedule}}': '角色日程（系统自动生成）',
            '{{controlInstructions}}': '控制指令（根据解析模式自动替换）'
        }
    },
    controlInstructions: {
        name: '控制指令（短标签）',
        description: 'AI通过短标签控制主动联络、状态和日程'
    },
    controlInstructionsToolCalls: {
        name: '控制指令（工具调用）',
        description: 'AI通过工具函数控制主动联络、状态和日程'
    },
    triggerHeartbeat: {
        name: '心跳触发消息',
        description: '定时主动联络时的触发消息模板',
        placeholders: {
            '{{time}}': '当前时间（如：下午 3:24）',
            '{{elapsed}}': '距离上次对话的时间（如：2小时）'
        }
    },
    triggerWithReason: {
        name: '原因触发消息',
        description: 'AI决定联络时的触发消息模板',
        placeholders: {
            '{{time}}': '当前时间（如：下午 3:24）',
            '{{reason}}': 'AI设定的联络原因'
        }
    },
    timeContext: {
        name: '时间上下文',
        description: '告诉AI当前时间和对话间隔信息的模板',
        placeholders: {
            '{{year}}': '年份（如：2025）',
            '{{month}}': '月份（如：12）',
            '{{day}}': '日期（如：19）',
            '{{weekday}}': '星期（如：星期四）',
            '{{timeOfDay}}': '时间段（早上/中午/下午/晚上/深夜）',
            '{{hour}}': '小时（如：01）',
            '{{minute}}': '分钟（如：05）',
            '{{timeStr}}': '时间（如：01:05）',
            '{{currentTime}}': '组合时间（如：12月19日 星期四 深夜 01:05）',
            '{{lastAssistantTime}}': '你上次发消息的时间',
            '{{timeSinceLastAssistant}}': '距离上次发消息的时间差',
            '{{lastUserTime}}': '对方回复的时间',
            '{{waitTime}}': '对方让你等了多久',
            '{{#hasLastAssistant}}...{{/hasLastAssistant}}': '条件块：有上次消息时显示',
            '{{#hasUserReply}}...{{/hasUserReply}}': '条件块：有用户回复时显示'
        }
    },
    timeContextFirst: {
        name: '首次联络时间上下文',
        description: '用户首次回复时的时间上下文模板',
        placeholders: {
            '{{year}}': '年份（如：2025）',
            '{{month}}': '月份（如：12）',
            '{{day}}': '日期（如：19）',
            '{{weekday}}': '星期（如：星期四）',
            '{{timeOfDay}}': '时间段（早上/中午/下午/晚上/深夜）',
            '{{hour}}': '小时（如：01）',
            '{{minute}}': '分钟（如：05）',
            '{{timeStr}}': '时间（如：01:05）',
            '{{currentTime}}': '组合时间（默认格式）'
        }
    }
};

// 提示词管理器
export const Prompts = {
    // 已加载的默认提示词（从文件加载）
    loadedDefaults: null,

    // 从文件加载提示词
    async loadAll() {
        try {
            const indexResponse = await fetch('data/prompts/index.json');
            if (!indexResponse.ok) {
                console.warn('提示词索引文件不存在，使用内置默认提示词');
                this.loadedDefaults = { ...DEFAULT_PROMPTS };
                return this.loadedDefaults;
            }

            const index = await indexResponse.json();
            this.loadedDefaults = {};

            // 加载每个提示词文件
            for (const [key, info] of Object.entries(index.prompts)) {
                try {
                    const response = await fetch(`data/prompts/${info.file}`);
                    if (response.ok) {
                        this.loadedDefaults[key] = await response.text();
                    } else {
                        this.loadedDefaults[key] = DEFAULT_PROMPTS[key] || '';
                    }
                } catch (e) {
                    console.warn(`加载提示词失败: ${info.file}`, e);
                    this.loadedDefaults[key] = DEFAULT_PROMPTS[key] || '';
                }
            }

            console.log(`已加载 ${Object.keys(this.loadedDefaults).length} 个提示词模板`);
            return this.loadedDefaults;
        } catch (e) {
            console.error('加载提示词失败:', e);
            this.loadedDefaults = { ...DEFAULT_PROMPTS };
            return this.loadedDefaults;
        }
    },

    // 获取提示词（优先用户自定义，否则用默认）
    get(key) {
        // 用户自定义
        const custom = Storage.getCustomPrompt(key);
        if (custom !== null) {
            return custom;
        }
        // 从文件加载的默认值
        if (this.loadedDefaults && this.loadedDefaults[key]) {
            return this.loadedDefaults[key];
        }
        // 内置后备
        return DEFAULT_PROMPTS[key] || '';
    },

    // 获取默认提示词（不含用户自定义）
    getDefault(key) {
        if (this.loadedDefaults && this.loadedDefaults[key]) {
            return this.loadedDefaults[key];
        }
        return DEFAULT_PROMPTS[key] || '';
    },

    // 保存用户自定义提示词
    save(key, content) {
        Storage.saveCustomPrompt(key, content);
    },

    // 重置为默认
    reset(key) {
        Storage.clearCustomPrompt(key);
    },

    // 检查是否有自定义
    hasCustom(key) {
        return Storage.getCustomPrompt(key) !== null;
    },

    // 获取所有提示词键名
    getAllKeys() {
        return Object.keys(PROMPT_INFO);
    },

    // 获取提示词信息
    getInfo(key) {
        return PROMPT_INFO[key] || null;
    }
};
