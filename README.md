# Joy Music Mobile - iOS Edition with Expo

一款基于 React Native + Expo 开发的 iOS 音乐播放器，参考 LX Music 的架构和功能特性。

**重要**: 使用 Expo，您可以在 **Windows 上完全开发 iOS 应用**，无需 macOS！

## 项目概览

Joy Music Mobile 是一个专门为 iOS 平台设计和优化的现代音乐播放应用，具有以下特点：

- ✅ React Native + Expo 跨平台开发（无需 Xcode）
- ✅ iOS 原生特性集成
- ✅ Redux 状态管理
- ✅ TypeScript 类型安全
- ✅ 模块化架构设计
- ✅ 离线播放支持
- ✅ Expo Go 应用快速预览

## 📱 快速开始（3 步）

### 1️⃣ 进入项目目录

```bash
cd "e:\project\Joy Music\JoyMusicMobile"
```

### 2️⃣ 安装依赖

```bash
npm install
npm install -g expo-cli  # 全局安装 Expo CLI
```

### 3️⃣ 启动应用

```bash
npm start

# 然后选择运行方式：
# - 'w' - 在网页浏览器中打开
# - 'i' - 在 iOS 模拟器中打开 (需要 macOS)
# - 'a' - 在 Android 模拟器中打开
# - 扫描二维码 - 用 iPhone 的 Expo Go 应用扫描
```

## 📲 在真实 iPhone 上运行（推荐！）

### 使用 Expo Go（最简单）

1. 在 iPhone 上从 App Store 安装 **[Expo Go](https://apps.apple.com/app/expo-go/id982107779)**
2. 运行 `npm start`
3. 用 iPhone 的相机扫描二维码
4. 应用自动启动！

### 无需本地网络（使用 Tunnel）

```bash
npm run tunnel
```

然后扫描二维码即可。

## 🛠️ 常用命令

```bash
# 启动开发服务器
npm start

# 在网页浏览器中运行
npm run web

# 代码检查
npm run lint

# 修复代码格式问题
npm run lint:fix

# 运行测试
npm test
```

## 📁 项目结构

```
joy-music-mobile/
├── src/
│   ├── app.ts                 # 应用入口
│   ├── components/            # UI 组件库
│   ├── config/                # 配置文件
│   ├── core/                  # 核心业务逻辑
│   │   ├── music/             # 音乐管理
│   │   ├── player/            # 播放器控制
│   │   └── search/            # 搜索功能
│   ├── event/                 # 事件系统
│   ├── lang/                  # 国际化
│   ├── navigation/            # 导航管理
│   ├── plugins/               # 插件系统
│   ├── resources/             # 资源文件
│   ├── screens/               # 页面组件
│   │   └── Home/              # 主页面
│   ├── store/                 # Redux 存储
│   ├── theme/                 # 主题管理
│   ├── types/                 # TypeScript 类型
│   └── utils/                 # 工具函数
├── assets/                    # 应用图标和启动屏幕
├── app.json                   # Expo 配置
├── App.tsx                    # 应用主组件
├── index.js                   # 应用入口
├── package.json               # 依赖配置
├── README.md                  # 本文档
├── QUICK_START.md             # 快速开始指南
├── EXPO_SETUP.md              # Expo 迁移指南
└── STRUCTURE.md               # 详细结构说明
```

## 🔧 技术栈

### 核心技术

- **React** 18.2.0 - UI 框架
- **React Native** 0.73.11 - 移动应用框架
- **Expo** 51.0.0 - React Native 开发平台
- **Redux** 5.0.0 - 状态管理
- **TypeScript** 5.8.3 - 类型检查

### 主要依赖

- **expo-av** - 音频/视频播放
- **react-native-safe-area-context** - 安全区域处理
- **@react-native-async-storage/async-storage** - 本地存储
- **@react-native-community/slider** - 进度条组件

### 开发工具

- **ESLint** - 代码检查
- **Prettier** - 代码格式化
- **Jest** - 单元测试
- **Babel** - 代码转译

## ✨ 项目特性

### 已实现功能

- 🎵 基础播放器界面
- 📱 响应式设计
- 🌙 深色模式支持
- 📚 本地音乐库管理
- 🎼 播放列表功能
- 🚀 Expo 快速预览

### 开发中功能

- 🔍 音乐搜索和发现
- ☁️ 云同步功能
- 🎨 主题自定义
- 📱 高级播放控制
- 🎙️ 歌词显示

### 计划功能

- 🎵 流媒体服务集成
- 👤 用户账户系统
- 📊 播放统计分析
- 🎧 均衡器和音效

## 🎯 Expo 的优势

| 优势                | 说明                                       |
| ------------------- | ------------------------------------------ |
| 📱 **Windows 开发** | 无需 macOS，直接在 Windows 上开发 iOS 应用 |
| 🚀 **快速部署**     | 一键部署到 Expo Go，实时查看结果           |
| ♨️ **热重载**       | 修改代码立即在设备上看到变化               |
| 🔧 **无需配置**     | 无需处理复杂的原生设置                     |
| ☁️ **云构建**       | 通过 EAS 云服务生成 IPA 文件               |
| 🌐 **跨平台**       | 同代码库支持 iOS、Android、Web             |

## 📖 文档

- **[QUICK_START.md](./QUICK_START.md)** - 快速开始指南
- **[EXPO_SETUP.md](./EXPO_SETUP.md)** - Expo 迁移和配置指南
- **[STRUCTURE.md](./STRUCTURE.md)** - 项目结构详解
- **[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)** - 项目创建总结

## 🤝 开发指南

### 添加新功能

1. **创建页面组件**

   ```bash
   mkdir src/screens/NewScreen
   touch src/screens/NewScreen/index.tsx
   ```

2. **添加 Redux 状态**

   ```typescript
   // src/store/reducers/newState.ts
   export default function newStateReducer(state = initialState, action) {
     // reducer logic
   }
   ```

3. **连接数据流**

   ```typescript
   import { useSelector, useDispatch } from 'react-redux';

   export function MyComponent() {
     const state = useSelector(state => state.newState);
     const dispatch = useDispatch();
     // component logic
   }
   ```

### 调试技巧

1. **查看日志**

   ```bash
   npm start  # 所有日志显示在终端
   ```

2. **使用开发菜单**

   - 在 Expo Go 中摇动设备打开菜单
   - 选择 "Open Debugger" 使用 Chrome DevTools

3. **Redux DevTools**
   - 在开发菜单中启用 Redux DevTools
   - 实时查看状态变化

## 🐛 常见问题

### Q: 为什么选择 Expo？

A: Expo 让您无需 Xcode 或 macOS 就能开发 iOS 应用。您可以在 Windows 上开发，通过 Expo Go 在真实 iPhone 上测试。

### Q: 可以发布到 App Store 吗？

A: 可以！使用 `eas build --platform ios` 生成 IPA 文件，然后上传到 App Store。

### Q: 支持原生模块吗？

A: Expo 有大部分常用的原生 API。如需使用未支持的模块，可使用 Expo Modules 或 expo-modules-core。

### Q: 性能如何？

A: Expo 基于 React Native，性能接近原生应用。对于大多数应用足够。

## 📚 学习资源

- [Expo 官方文档](https://docs.expo.dev/)
- [React Native 文档](https://reactnative.dev/)
- [Redux 官方教程](https://redux.js.org/)
- [TypeScript 官方文档](https://www.typescriptlang.org/)

## 🚀 下一步

1. 运行 `npm install` 安装依赖
2. 运行 `npm start` 启动开发服务器
3. 在手机上安装 Expo Go
4. 扫描二维码启动应用
5. 开始修改代码！

## 💡 Tips

- 使用 Expo Go 快速原型和测试
- 对于生产版本，使用 EAS Build 云构建
- 定期更新 Expo 和 React Native 版本
- 参考 [QUICK_START.md](./QUICK_START.md) 了解更多命令

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。

## 🎵 参考项目

本项目参考了以下开源项目的架构：

- [LX Music Mobile](https://github.com/lyswhut/lx-music-mobile) - 音乐应用架构参考

## 🎉 开始开发

```bash
# 一键启动！
npm install && npm start
```

---

**祝您编码愉快！** 🎵🚀

现在您可以在 **Windows 上完全开发 iOS 应用** 了！
