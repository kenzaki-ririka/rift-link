// 时间管理与主动联络判定
export const TimeManager = {
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

  // 计算离线期间应该触发的主动联络次数（使用泊松分布，O(k) 复杂度）
  calculateOfflineContacts(lastVisit, proactiveSettings) {
    if (!lastVisit || !proactiveSettings?.enabled) {
      return [];
    }

    const { baseChance, checkIntervalMinutes, replyDelayMinutes } = proactiveSettings;
    const now = Date.now();
    const lastVisitTime = new Date(lastVisit).getTime();
    const elapsed = now - lastVisitTime;
    
    // 计算有多少个检查间隔
    const intervalMs = checkIntervalMinutes * 1000;
    const intervals = Math.floor(elapsed / intervalMs);
    
    if (intervals <= 0) return [];
    
    // 使用泊松分布计算触发次数
    // 期望值 λ = intervals * baseChance
    const lambda = intervals * baseChance;
    const count = this.samplePoisson(lambda);
    
    if (count <= 0) return [];
    
    // 生成 count 个随机触发时间点
    // 在离线期间均匀分布（模拟每个间隔独立判定的效果）
    const contacts = [];
    const avgDelay = (replyDelayMinutes.min + replyDelayMinutes.max) / 2 * 1000;
    
    for (let i = 0; i < count; i++) {
      // 在离线期间随机选择一个时间点
      const randomOffset = Math.random() * elapsed;
      // 加上随机延迟
      const delay = (replyDelayMinutes.min + Math.random() * (replyDelayMinutes.max - replyDelayMinutes.min)) * 1000;
      const contactTime = lastVisitTime + randomOffset + delay;
      
      // 确保不超过当前时间
      if (contactTime < now) {
        contacts.push({
          timestamp: new Date(contactTime).toISOString(),
          type: 'proactive'
        });
      }
    }
    
    // 按时间排序
    contacts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    return contacts;
  },

  // 泊松分布采样（Knuth 算法，小 λ 时使用；大 λ 时使用正态近似）
  samplePoisson(lambda) {
    if (lambda <= 0) return 0;
    
    // 对于大 λ，使用正态近似 N(λ, √λ)
    if (lambda > 30) {
      const normal = this.sampleNormal();
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal));
    }
    
    // Knuth 算法
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    
    return k - 1;
  },

  // 标准正态分布采样（Box-Muller 变换）
  sampleNormal() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  },

  // 设置下一次主动联络检查
  scheduleNextContact(channelId, proactiveSettings, callback) {
    if (!proactiveSettings?.enabled) return null;

    const { baseChance, checkIntervalMinutes, replyDelayMinutes } = proactiveSettings;
    
    // 每 checkIntervalMinutes 秒检查一次
    const intervalMs = checkIntervalMinutes * 1000;
    
    const timerId = setInterval(() => {
      // 概率判定
      if (Math.random() < baseChance) {
        // 判定成功，计算延迟后触发（replyDelayMinutes 现在直接存储秒数）
        const delay = (replyDelayMinutes.min + Math.random() * (replyDelayMinutes.max - replyDelayMinutes.min)) * 1000;
        
        setTimeout(() => {
          callback(channelId);
        }, delay);
      }
    }, intervalMs);

    return timerId;
  },

  // 构建时间上下文（告诉AI时间信息）
  buildTimeContext(messages, currentTimestamp) {
    const now = new Date(currentTimestamp);
    
    // 格式化当前时间（包含日期）
    const hours = now.getHours();
    let timeOfDay = '';
    if (hours >= 5 && hours < 12) timeOfDay = '早上';
    else if (hours >= 12 && hours < 14) timeOfDay = '中午';
    else if (hours >= 14 && hours < 18) timeOfDay = '下午';
    else if (hours >= 18 && hours < 22) timeOfDay = '晚上';
    else timeOfDay = '深夜';
    
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekday = weekdays[now.getDay()];
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const currentTime = `${month}月${day}日 ${weekday} ${timeOfDay} ${timeStr}`;

    if (messages.length === 0) {
      return {
        isFirstContact: true,
        context: '这是对方第一次回复你的消息。',
        currentTime: currentTime,
        timeSinceLastAssistant: null
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

    let context = '';
    let timeSinceLastAssistant = null;

    if (lastAssistantMsg) {
      const lastMsgTime = new Date(lastAssistantMsg.timestamp);
      const diff = now - lastMsgTime;
      timeSinceLastAssistant = this.formatTimeDiff(diff);
      context += `你上次发消息的时间：${this.formatMessageTime(lastAssistantMsg.timestamp)}（${timeSinceLastAssistant}前）\n`;
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

    context += `对方那边现在是：${currentTime}`;

    return {
      isFirstContact: false,
      context: context,
      currentTime: currentTime,
      timeSinceLastAssistant: timeSinceLastAssistant
    };
  }
};
