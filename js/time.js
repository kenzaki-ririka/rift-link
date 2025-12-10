// 时间管理与主动联络判定
const TimeManager = {
  // 格式化时间差
  formatTimeDiff(ms) {
    const minutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return remainingHours > 0 ? `${days}天${remainingHours}小时` : `${days}天`;
    }
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分钟` : `${hours}小时`;
    }
    if (minutes > 0) {
      return `${minutes}分钟`;
    }
    return '刚刚';
  },

  // 格式化消息时间显示
  formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    if (diffDays === 0) {
      return timeStr;
    } else if (diffDays === 1) {
      return `昨天 ${timeStr}`;
    } else if (diffDays < 7) {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return `${weekdays[date.getDay()]} ${timeStr}`;
    } else {
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${month}/${day} ${timeStr}`;
    }
  },

  // 计算离线期间应该触发的主动联络次数
  calculateOfflineContacts(lastVisit, proactiveSettings) {
    if (!lastVisit || !proactiveSettings?.enabled) {
      return [];
    }

    const { baseChance, checkIntervalMinutes, replyDelayMinutes } = proactiveSettings;
    const now = Date.now();
    const lastVisitTime = new Date(lastVisit).getTime();
    const elapsed = now - lastVisitTime;
    
    // 计算有多少个检查间隔
    const intervals = Math.floor(elapsed / (checkIntervalMinutes * 60 * 1000));
    
    const contacts = [];
    let currentTime = lastVisitTime;

    for (let i = 0; i < intervals; i++) {
      // 在每个间隔进行概率判定
      if (Math.random() < baseChance) {
        // 判定成功，计算触发时间（间隔结束 + 随机延迟）
        const intervalEnd = lastVisitTime + (i + 1) * checkIntervalMinutes * 60 * 1000;
        const delay = (replyDelayMinutes.min + Math.random() * (replyDelayMinutes.max - replyDelayMinutes.min)) * 60 * 1000;
        const contactTime = intervalEnd + delay;
        
        // 确保不超过当前时间
        if (contactTime < now) {
          contacts.push({
            timestamp: new Date(contactTime).toISOString(),
            type: 'proactive'
          });
        }
      }
    }

    return contacts;
  },

  // 设置下一次主动联络检查
  scheduleNextContact(channelId, proactiveSettings, callback) {
    if (!proactiveSettings?.enabled) return null;

    const { baseChance, checkIntervalMinutes, replyDelayMinutes } = proactiveSettings;
    
    // 每 checkIntervalMinutes 分钟检查一次
    const intervalMs = checkIntervalMinutes * 60 * 1000;
    
    const timerId = setInterval(() => {
      // 概率判定
      if (Math.random() < baseChance) {
        // 判定成功，计算延迟后触发
        const delay = (replyDelayMinutes.min + Math.random() * (replyDelayMinutes.max - replyDelayMinutes.min)) * 60 * 1000;
        
        setTimeout(() => {
          callback(channelId);
        }, delay);
      }
    }, intervalMs);

    return timerId;
  },

  // 构建时间上下文（告诉AI时间信息）
  buildTimeContext(messages, currentTimestamp) {
    if (messages.length === 0) {
      return {
        isFirstContact: true,
        context: '这是对方第一次回复你的消息。'
      };
    }

    // 找到最后一条AI消息和最后一条用户消息
    let lastAssistantMsg = null;
    let lastUserMsg = null;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!lastAssistantMsg && msg.role === 'assistant') {
        lastAssistantMsg = msg;
      }
      if (!lastUserMsg && msg.role === 'user') {
        lastUserMsg = msg;
      }
      if (lastAssistantMsg && lastUserMsg) break;
    }

    const now = new Date(currentTimestamp);
    let context = '';

    if (lastAssistantMsg) {
      const lastMsgTime = new Date(lastAssistantMsg.timestamp);
      const diff = now - lastMsgTime;
      context += `你上次发消息的时间：${this.formatMessageTime(lastAssistantMsg.timestamp)}（${this.formatTimeDiff(diff)}前）\n`;
    }

    if (lastUserMsg) {
      const lastUserTime = new Date(lastUserMsg.timestamp);
      
      if (lastAssistantMsg) {
        const assistantTime = new Date(lastAssistantMsg.timestamp);
        if (lastUserTime > assistantTime) {
          // 用户回复了
          const waitTime = lastUserTime - assistantTime;
          context += `对方回复时间：${this.formatMessageTime(lastUserMsg.timestamp)}\n`;
          context += `对方让你等了：${this.formatTimeDiff(waitTime)}\n`;
        }
      }
    }

    // 当前时间信息
    const hours = now.getHours();
    let timeOfDay = '';
    if (hours >= 5 && hours < 12) timeOfDay = '早上';
    else if (hours >= 12 && hours < 14) timeOfDay = '中午';
    else if (hours >= 14 && hours < 18) timeOfDay = '下午';
    else if (hours >= 18 && hours < 22) timeOfDay = '晚上';
    else timeOfDay = '深夜';

    context += `你那边现在是：${timeOfDay}（${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}）`;

    return {
      isFirstContact: false,
      context: context
    };
  }
};
