// 工具定义 - OpenAI Function Calling 格式
import { Storage } from '../storage.js';

// 工具 Schema 定义
export const TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'set_next_contact',
            description: '设置下次主动联络时间。用于在对话中告诉系统你想什么时候再主动联系对方。',
            parameters: {
                type: 'object',
                properties: {
                    time: {
                        type: 'number',
                        description: '时间数值'
                    },
                    unit: {
                        type: 'string',
                        enum: ['s', 'm', 'h'],
                        description: '时间单位：s=秒, m=分钟, h=小时'
                    },
                    reason: {
                        type: 'string',
                        description: '联络原因（可选）'
                    },
                    persistent: {
                        type: 'boolean',
                        description: '是否为持久联络（不会被打断）'
                    }
                },
                required: ['time', 'unit']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_status',
            description: '设置当前状态。状态会影响回复延迟和主动联络概率。',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['set', 'clear'],
                        description: 'set=设置状态, clear=清除状态'
                    },
                    label: {
                        type: 'string',
                        description: '状态标签（如"睡眠中"、"忙碌"）'
                    },
                    duration: {
                        type: 'object',
                        properties: {
                            time: { type: 'number' },
                            unit: { type: 'string', enum: ['s', 'm', 'h'] }
                        },
                        description: '持续时间'
                    },
                    noreply: {
                        type: 'boolean',
                        description: '是否不回复消息'
                    },
                    delay: {
                        type: 'object',
                        properties: {
                            min: { type: 'number' },
                            max: { type: 'number' }
                        },
                        description: '回复延迟范围（秒）'
                    },
                    chance: {
                        type: 'number',
                        description: '主动联络概率乘数（0-1）'
                    }
                },
                required: ['action']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'modify_schedule',
            description: '修改日程表。可以添加、删除或修改固定日程。',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['add', 'remove', 'set'],
                        description: 'add=添加, remove=删除, set=修改'
                    },
                    label: {
                        type: 'string',
                        description: '日程标签（如"睡眠中"、"工作"）'
                    },
                    start: {
                        type: 'string',
                        description: '开始时间（HH:MM格式）'
                    },
                    end: {
                        type: 'string',
                        description: '结束时间（HH:MM格式）'
                    },
                    noreply: {
                        type: 'boolean',
                        description: '该时段是否不回复'
                    },
                    chance: {
                        type: 'number',
                        description: '该时段主动联络概率乘数'
                    }
                },
                required: ['action', 'label']
            }
        }
    }
];

// 工具处理器
export const TOOL_HANDLERS = {
    set_next_contact: (params, context) => {
        const { channelId } = context;
        const { time, unit, reason, persistent } = params;

        const unitMap = { 's': 1000, 'm': 60 * 1000, 'h': 60 * 60 * 1000 };
        const delayMs = time * unitMap[unit];
        const sendAt = new Date(Date.now() + delayMs).toISOString();

        Storage.setPendingContact(channelId, {
            sendAt: sendAt,
            reason: reason || null,
            persistent: persistent || false
        });

        console.log(`[Tools] 设置主动联络: ${time}${unit} 后${persistent ? '（持久）' : ''}`);
        return { success: true, sendAt, delayMs, reason, persistent };
    },

    set_status: (params, context) => {
        const { channelId } = context;
        const { action, label, duration, noreply, delay, chance } = params;

        if (action === 'clear') {
            Storage.clearStatus(channelId);
            console.log('[Tools] 清除状态');
            return { success: true, action: 'cleared' };
        }

        if (action === 'set') {
            let endsAt = null;
            if (duration) {
                const unitMap = { 's': 1000, 'm': 60 * 1000, 'h': 60 * 60 * 1000 };
                endsAt = new Date(Date.now() + duration.time * unitMap[duration.unit]).toISOString();
            }

            const status = {
                label: label,
                endsAt: endsAt,
                noreply: noreply || false,
                replyDelay: delay ? { min: delay.min / 60, max: delay.max / 60 } : null,
                proactiveMultiplier: chance
            };

            Storage.setStatus(channelId, status);
            console.log(`[Tools] 设置状态: ${label}`);
            return { success: true, status: label };
        }

        return { success: false, error: 'Unknown action' };
    },

    modify_schedule: (params, context) => {
        const { channelId } = context;
        const { action, label, start, end, noreply, chance } = params;

        const schedule = Storage.getSchedule(channelId);
        if (!schedule) return { success: false, error: 'Schedule not found' };

        switch (action) {
            case 'add':
                const existingAdd = schedule.routine.findIndex(s => s.label === label);
                if (existingAdd === -1) {
                    schedule.routine.push({ start, end, label, noreply, chance });
                    console.log(`[Tools] 添加日程: ${label}`);
                }
                break;

            case 'remove':
                const idx = schedule.routine.findIndex(s => s.label === label);
                if (idx !== -1) {
                    schedule.routine.splice(idx, 1);
                    console.log(`[Tools] 删除日程: ${label}`);
                }
                break;

            case 'set':
                const existingSet = schedule.routine.findIndex(s => s.label === label);
                if (existingSet !== -1) {
                    schedule.routine[existingSet] = { ...schedule.routine[existingSet], start, end, noreply, chance };
                } else {
                    schedule.routine.push({ start, end, label, noreply, chance });
                }
                console.log(`[Tools] 修改日程: ${label}`);
                break;
        }

        Storage.saveSchedule(channelId, schedule);
        return { success: true, action, label };
    }
};

// 获取工具定义（用于 API 请求）
export function getToolDefinitions() {
    return TOOL_DEFINITIONS;
}

// 执行工具调用
export function executeTool(toolName, params, context) {
    const handler = TOOL_HANDLERS[toolName];
    if (!handler) {
        console.error(`[Tools] Unknown tool: ${toolName}`);
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
    return handler(params, context);
}

// 批量执行工具调用
export function executeToolCalls(toolCalls, context) {
    const results = [];
    for (const call of toolCalls) {
        const result = executeTool(call.function.name, JSON.parse(call.function.arguments), context);
        results.push({
            tool_call_id: call.id,
            result: result
        });
    }
    return results;
}
