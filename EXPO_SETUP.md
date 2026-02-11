# Joy Music Mobile - Expo 迁移指南

## 📝 迁移总结

项目已从原生 React Native 迁移到 Expo！这意味着你可以在 **Windows 上完全开发 iOS 应用**，无需 macOS。

## 🔄 做了什么改变

### 1. 依赖更新
- ✅ 移除了原生依赖 (react-native-navigation, react-native-track-player等)
- ✅ 添加了 Expo 核心库
- ✅ 使用 expo-av 替代 react-native-track-player 用于音乐播放

### 2. 配置文件更新
- ✅ 更新了 `package.json` 脚本
- ✅ 创建了 Expo 配置的 `app.json`
- ✅ 更新了 `index.js` 入口文件
- ✅ 更新了 `App.tsx` 添加了 Splash Screen 支持

### 3. 项目结构
```
JoyMusicMobile/
├── assets/              # 新增：应用图标和启动屏幕
├── src/                 # 保留：应用代码
├── app.json             # 更新：Expo 配置
├── package.json         # 更新：依赖和脚本
├── index.js             # 更新：Expo 入口
├── App.tsx              # 更新：添加 Splash Screen
├── .gitignore           # 新增：Git 忽略配置
└── EXPO_SETUP.md        # 新增：本文件
```

## 🚀 核心优势

| 优势 | 说明 |
|------|------|
| 📱 **无需 Xcode** | 在 Windows 上完全开发 iOS 应用 |
| 📲 **实时测试** | 通过 Expo Go 在真实 iPhone 上测试 |
| ⚡ **热重载** | 保存代码即时看到变化 |
| 🔧 **简化配置** | 无需处理复杂的原生设置 |
| ☁️ **云构建** | 通过 EAS Build 生成 IPA 文件 |
| 🌍 **跨平台** | 同一代码库支持 iOS、Android、Web |

## 📋 开发流程

### 1. 首次设置

```bash
# 进入项目
cd "e:\project\Joy Music\JoyMusicMobile"

# 安装依赖
npm install

# 全局安装 Expo CLI
npm install -g expo-cli

# 验证安装
expo --version
```

### 2. 启动开发

```bash
# 启动 Expo 开发服务器
npm start

# 在浏览器中打开：http://localhost:8081
```

### 3. 在真实设备上运行

**方式 1: 使用 Expo Go（最简单）**
- 在 iPhone 上从 App Store 安装 Expo Go
- 运行 `npm start`
- 用 iPhone 相机扫描二维码
- 自动启动应用！

**方式 2: 使用 Tunnel（无需 WiFi）**
```bash
npm run tunnel
```

**方式 3: 网页测试**
```bash
npm run web
```

## 🛠️ 常用命令参考

```bash
# 启动开发服务器
npm start

# 启动并清除缓存
npm start --clear

# 在网页浏览器中运行
npm run web

# 代码检查
npm run lint

# 修复代码格式
npm run lint:fix

# 运行测试
npm test
```

## 📚 核心文件说明

### app.json
Expo 应用配置文件，包含：
- 应用名称和标识符
- 启动屏幕配置
- iOS/Android 特定设置
- 权限配置

### package.json
```json
{
  "expo": {
    "name": "Joy Music Mobile",
    "slug": "joy-music-mobile",
    "version": "1.0.0"
  }
}
```

### index.js
使用 `registerRootComponent` 注册应用，支持 Expo 的生命周期管理

### App.tsx
- 集成 Redux Provider
- 使用 Splash Screen
- 支持深色模式

## 🎵 音乐播放功能

### 原来使用的
- react-native-track-player

### 现在使用的
- **expo-av** - Expo 官方音频播放库

### 迁移播放器代码

```typescript
// 原来的代码仍然可用，只需要更新播放器实现
// src/core/player/index.ts

// 使用 expo-av 的示例：
import { Audio } from 'expo-av'

const sound = new Audio.Sound()
await sound.loadAsync({ uri: 'https://example.com/music.mp3' })
await sound.playAsync()
```

## 📱 资源文件

您需要添加以下文件到 `assets/` 目录：

```
assets/
├── icon.png           # 应用图标 (1024x1024)
├── splash.png         # 启动屏幕 (1024x1024)
├── adaptive-icon.png  # Android 自适应图标 (1024x1024)
└── favicon.png        # Web 网站 favicon (192x192)
```

临时使用空白图像也可以，之后可以替换：

```bash
# 创建临时资源目录
mkdir -p assets
# 使用白色像素作为临时图标
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==" | base64 -d > assets/icon.png
```

## 🔌 Expo 插件系统

项目已配置以下 Expo 插件：

### expo-av
用于音频和视频播放
```json
{
  "plugins": [
    ["expo-av", {
      "microphonePermission": "Allow Joy Music to access your microphone."
    }]
  ]
}
```

## 📦 生成生产版本

### iOS IPA 文件

```bash
# 首先安装 EAS CLI
npm install -g eas-cli

# 登录 Expo 账户
eas login

# 生成 iOS 版本
eas build --platform ios

# 生成完成后，可以下载 IPA 或直接上传到 TestFlight
```

### Android APK 文件

```bash
eas build --platform android
```

## ⚙️ 环境变量

创建 `.env` 文件存储敏感信息：

```bash
# .env
MUSIC_API_KEY=your_api_key_here
MUSIC_API_URL=https://api.example.com
```

在代码中使用：

```typescript
import { getEnv } from 'react-native-dotenv'

const apiKey = getEnv('MUSIC_API_KEY')
```

## 🐛 故障排除

### 问题：端口 8081 被占用
```bash
# 使用不同的端口
expo start --port 3000
```

### 问题：缓存问题
```bash
# 清除缓存并重启
npm start --clear
```

### 问题：Expo Go 连接失败
```bash
# 检查防火墙
# 尝试使用 Tunnel 模式
npm run tunnel
```

### 问题：权限错误
```bash
# 更新 Expo CLI
npm install -g expo-cli@latest
```

## 📖 学习资源

- [Expo 官方文档](https://docs.expo.dev/)
- [Expo 快速开始](https://docs.expo.dev/get-started/create-a-new-app/)
- [expo-av 文档](https://docs.expo.dev/versions/latest/sdk/av/)
- [EAS Build 文档](https://docs.eas.build/)

## 🎯 下一步

### 短期
- [x] 迁移到 Expo
- [ ] 添加应用图标和启动屏幕
- [ ] 更新音乐播放器为 expo-av
- [ ] 测试在 Expo Go 中运行

### 中期
- [ ] 实现更多音乐功能
- [ ] 集成音乐数据源 API
- [ ] 添加搜索功能

### 长期
- [ ] 生成 iOS IPA 文件
- [ ] 提交到 App Store
- [ ] 同步发布 Android 版本

## 🎉 恭喜！

您现在可以在 **Windows 上完全开发 iOS 应用**！

使用 Expo，您可以：
- ✅ 在 iPhone 上实时测试
- ✅ 无需 Xcode 或 macOS
- ✅ 轻松生成发布版本
- ✅ 与 Android 共享代码

---

**开始开发**: `npm install && npm start`

更多问题？查看 [QUICK_START.md](./QUICK_START.md)
