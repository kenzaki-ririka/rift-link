# 裂隙通讯 (Rift Link)

与异世界的她建立联系。

## 特性

- 🌙 沉浸式异次元通讯体验
- 💬 支持多个AI服务商（Claude、DeepSeek、Gemini、OpenAI）
- 💌 她会在想你的时候主动发消息
- ✏️ 完全可自定义的角色卡系统
- 📱 PWA支持，可安装到手机主屏幕
- 💾 本地存储，数据完全在你的设备上
- 📦 支持导入/导出备份

## 快速开始

### 方式一：直接使用

1. 把这个文件夹放到任意静态服务器上
2. 打开网页
3. 在设置中填入你的 API Key
4. 选择一个角色开始聊天

### 方式二：本地运行

如果你有 Node.js：

```bash
npx serve .
```

或者 Python：

```bash
python -m http.server 8000
```

然后访问 http://localhost:8000

### 方式三：部署到云端

推荐使用：
- Vercel
- Cloudflare Pages
- GitHub Pages
- Netlify

直接拖拽文件夹上传即可。

## 配置 API Key

支持以下服务商：

| 服务商 | 获取Key的地址 |
|--------|---------------|
| Claude (Anthropic) | https://console.anthropic.com |
| DeepSeek | https://platform.deepseek.com |
| Gemini (Google) | https://aistudio.google.com |
| OpenAI | https://platform.openai.com |

## 创建角色

1. 在选择界面点击「创建新连接」
2. 填写角色信息：
   - **基本信息**：名称、头像、简介
   - **世界观**：角色所在世界的背景设定
   - **角色设定**：背景故事、性格、说话风格
   - **通讯设定**：通讯媒介、第一条消息
   - **粘人程度**：她主动联系你的频率
3. 保存即可

## 主动联络机制

角色会在你不在的时候主动发消息给你：

- 每10分钟进行一次判定
- 根据「粘人程度」决定是否发送
- 判定成功后0-10分钟内发送
- 你再次打开页面时会看到她发来的消息

## 数据安全

- 所有数据存储在浏览器的 localStorage 中
- API Key 仅保存在本地，不会上传到任何服务器
- 建议定期使用「导出数据」功能备份
- 清除浏览器数据会导致聊天记录丢失

## 内置角色

### 祈 (Inori)
暮色东京的吸血鬼，已经活了四百年。温柔慵懒，独居太久，有时候会突然说出很寂寞的话。

### 柚希 (Yuzuki)
三个月前醒来发现全人类消失了。现在独自生活在空无一人的东京，表面适应了，但偶尔会露出裂痕。

## 项目结构

```
rift-link/
├── index.html          # 主页面
├── manifest.json       # PWA配置
├── css/
│   └── style.css       # 样式
├── js/
│   ├── app.js          # 主应用逻辑
│   ├── storage.js      # 存储管理
│   ├── api.js          # AI API调用
│   ├── time.js         # 时间管理
│   ├── character.js    # 角色管理
│   └── chat.js         # 聊天逻辑
└── data/
    └── presets.js      # 预设角色
```

## 常见问题

**Q: 数据会丢失吗？**
A: 数据存在浏览器本地。清除浏览器数据、使用无痕模式、换浏览器/设备都会导致数据丢失。建议定期导出备份。

**Q: 可以在手机上用吗？**
A: 可以。用手机浏览器打开后，可以「添加到主屏幕」，体验类似原生App。

**Q: API调用收费吗？**
A: 这个应用本身免费，但调用AI服务需要你自己的API Key，费用由各服务商收取。

**Q: 如何切换角色？**
A: 访问 `你的域名/#select` 或直接在URL后加 `#select`。
