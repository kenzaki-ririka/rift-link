import { Chat } from './chat.js';
import { Storage } from './storage.js';

export const Tools = {
  // Tool Definitions (OpenAI Format)
  DEFINITIONS: [
    {
      type: 'function',
      function: {
        name: 'schedule_contact',
        description: 'Schedule a future message to the user. Use this when you want to initiate a conversation later.',
        parameters: {
          type: 'object',
          properties: {
            delay_minutes: {
              type: 'number',
              description: 'Delay in minutes before sending the message.'
            },
            reason: {
              type: 'string',
              description: 'Reason for contacting the user (e.g., "Wake up call", "Thinking of you").'
            },
            persistent: {
              type: 'boolean',
              description: 'If true, the contact will happen even if the user messages in between (e.g. for wake up calls). If false, user messages cancel this plan.'
            }
          },
          required: ['delay_minutes', 'reason']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'manage_status',
        description: 'Update your current status (e.g., sleeping, busy).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['set', 'clear'],
              description: 'Set a new status or clear the current one.'
            },
            label: {
              type: 'string',
              description: 'Status label (e.g., "Sleeping", "Busy"). Required for "set".'
            },
            duration_minutes: {
              type: 'number',
              description: 'Duration of the status in minutes. Required for "set".'
            },
            noreply: {
              type: 'boolean',
              description: 'If true, you will not reply to messages during this status.'
            },
            reply_delay_min: {
              type: 'number',
              description: 'Minimum reply delay in minutes (if not noreply).'
            },
            reply_delay_max: {
              type: 'number',
              description: 'Maximum reply delay in minutes.'
            }
          },
          required: ['action']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'manage_schedule',
        description: 'Modify your daily schedule.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['add', 'remove'],
              description: 'Add or remove a schedule item.'
            },
            label: {
              type: 'string',
              description: 'Name of the activity (e.g., "Work").'
            },
            start_time: {
              type: 'string',
              description: 'Start time in HH:MM format (e.g., "09:00"). Required for "add".'
            },
            end_time: {
              type: 'string',
              description: 'End time in HH:MM format (e.g., "18:00"). Required for "add".'
            },
            noreply: {
              type: 'boolean',
              description: 'If true, you will not reply during this time.'
            }
          },
          required: ['action', 'label']
        }
      }
    }
  ],

  // Execute a tool call
  async execute(channelId, name, args) {
    console.log(`[Tools] Executing ${name} for channel ${channelId}`, args);
    
    try {
      switch (name) {
        case 'schedule_contact':
          return this.handleScheduleContact(channelId, args);
        case 'manage_status':
          return this.handleManageStatus(channelId, args);
        case 'manage_schedule':
          return this.handleManageSchedule(channelId, args);
        default:
          return `Error: Unknown tool ${name}`;
      }
    } catch (error) {
      console.error(`[Tools] Error executing ${name}:`, error);
      return `Error: ${error.message}`;
    }
  },

  handleScheduleContact(channelId, args) {
    const { delay_minutes, reason, persistent } = args;
    const delayMs = delay_minutes * 60 * 1000;
    
    const sendAt = new Date(Date.now() + delayMs);
    
    // Save to storage
    Storage.setPendingContact(channelId, {
      sendAt: sendAt.toISOString(),
      reason: reason,
      persistent: persistent || false
    });

    // Schedule timer via Chat module
    if (Chat && Chat.scheduleNextContact) {
      Chat.scheduleNextContact(channelId, delayMs, reason);
    }

    return `Scheduled contact in ${delay_minutes} minutes for "${reason}".`;
  },

  handleManageStatus(channelId, args) {
    const { action, label, duration_minutes, noreply, reply_delay_min, reply_delay_max } = args;

    if (action === 'clear') {
      Storage.clearStatus(channelId);
      return 'Status cleared.';
    }

    if (action === 'set') {
      const now = Date.now();
      const endsAt = new Date(now + duration_minutes * 60 * 1000).toISOString();
      
      let replyDelay = null;
      if (noreply) {
        replyDelay = { min: 999999, max: 999999 };
      } else if (reply_delay_min !== undefined) {
        replyDelay = { min: reply_delay_min, max: reply_delay_max || reply_delay_min + 5 };
      }

      const status = {
        label: label,
        reason: 'Set via tool',
        endsAt: endsAt,
        proactiveMultiplier: 1.0, // Default
        replyDelay: replyDelay,
        noreply: !!noreply
      };

      Storage.setStatus(channelId, status);
      return `Status set to "${label}" for ${duration_minutes} minutes.`;
    }
    return 'Invalid action.';
  },

  handleManageSchedule(channelId, args) {
    const { action, label, start_time, end_time, noreply } = args;
    const schedule = Storage.getSchedule(channelId) || { enabled: true, routine: [] };
    
    if (action === 'add') {
      // Remove existing with same label if any
      schedule.routine = schedule.routine.filter(s => s.label !== label);
      
      schedule.routine.push({
        label,
        start: start_time,
        end: end_time,
        noreply: !!noreply
      });
      // Sort by start time
      schedule.routine.sort((a, b) => a.start.localeCompare(b.start));
    } else if (action === 'remove') {
      schedule.routine = schedule.routine.filter(s => s.label !== label);
    }

    Storage.setSchedule(channelId, schedule);
    return `Schedule updated: ${action} "${label}".`;
  }
};