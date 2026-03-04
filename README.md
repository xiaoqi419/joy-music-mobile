<p align="center">
  <img src="assets/icon.png" width="100" height="100" alt="悦音" style="border-radius: 22px;" />
</p>

<h1 align="center">悦音 YueYin</h1>

<p align="center">
  <strong>一款精致的多源音乐播放器，为 iOS 而生</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.7-blue?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/React_Native-0.81-61dafb?style=flat-square&logo=react" alt="React Native" />
  <img src="https://img.shields.io/badge/Expo_SDK-54-000020?style=flat-square&logo=expo" alt="Expo" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/platform-iOS-lightgrey?style=flat-square&logo=apple" alt="iOS" />
</p>

---

## 特性

- **多源聚合** — 酷我、网易云、QQ、酷狗四大平台，一处畅听
- **高品质播放** — 从 128k 到 Master 无损，自动选择最佳音质并智能降级
- **沉浸式体验** — 旋转封面、实时歌词、Liquid Glass 风格 TabBar
- **智能缓存** — AsyncStorage + SQLite 双层缓存，离线也能听
- **自定义音源** — 支持手动添加、URL 导入、本地 JS 导入
- **亮暗双主题** — 遵循 iOS 设计语言，OLED 纯黑暗色模式

## 功能概览

| 模块 | 能力 |
|------|------|
| **播放器** | 播放/暂停、上下曲切换、进度拖动、四种播放模式（顺序/列表循环/单曲循环/随机） |
| **发现** | 多平台推荐歌单、排序筛选、标签分类 |
| **搜索** | 跨平台搜索、热搜词推荐、分页加载、竞态保护 |
| **排行榜** | 各平台热门榜单、实时更新 |
| **歌单** | 新建/删除/编辑、JSON/网络导入、导出分享 |
| **歌词** | 多平台歌词获取、LRC 解析、翻译歌词合并 |
| **评论** | 网易云热门评论、下拉刷新、分页加载 |
| **更新** | GitHub Release 自动检查、版本比较、更新日志 |

## 技术架构

```
┌──────────────────────────────────────────────┐
│  Screens (发现 · 搜索 · 排行榜 · 歌单 · 播放)    │
├──────────────────────────────────────────────┤
│  Player Controller · Music Manager           │
├────────────────┬─────────────────────────────┤
│  Expo Audio    │  Redux Store (v5)           │
├────────────────┼─────────────────────────────┤
│  Music Sources │  AsyncStorage + SQLite      │
│  (KW/WY/TX/KG) │                             │
└────────────────┴─────────────────────────────┘
```

**核心依赖**

| 类别 | 技术 |
|------|------|
| 框架 | React 19 · React Native 0.81 · Expo SDK 54 |
| 动画 | Reanimated 4.1 · Gesture Handler |
| 存储 | AsyncStorage · expo-sqlite · expo-file-system |
| 状态 | Redux 5 · React Redux 9 |
| UI | Expo Blur · Linear Gradient · Vector Icons |

## 快速开始

**环境要求**：Node ≥ 18，npm ≥ 8.5.2

```bash
# 安装依赖
npm install

# 启动开发服务器
npm start

# 启动 iOS 模拟器
npm run ios
```

## 常用命令

```bash
npm run ios              # iOS 开发
npm run android          # Android 开发
npm run web              # Web 开发
npm run lint             # 代码检查
npm run lint:fix         # 自动修复
npm run test             # 运行测试
npm run release:version -- <version>  # 同步版本号
```

## 发布流程

### 自动发布（推荐）

1. 在 GitHub Actions 触发 **Release Tag** 工作流
2. 输入版本号（如 `1.2.8` 或 `1.3.0-beta.1`）
3. 自动完成：版本同步 → 创建 Tag → 构建 IPA → 上传 Release

### 版本同步范围

运行 `npm run release:version` 会自动同步以下文件：

- `package.json` → `version`
- `app.json` → `expo.version` / `expo.ios.buildNumber`
- `src/config/index.ts` → `appConfig.version`

## 项目结构

```
src/
├── components/common/    # 通用 UI 组件
├── config/               # 应用配置
├── core/                 # 核心业务模块
│   ├── comment/          #   评论
│   ├── config/           #   配置管理
│   ├── discover/         #   发现页
│   ├── lyric/            #   歌词解析
│   ├── music/            #   音乐数据
│   ├── player/           #   播放引擎
│   ├── search/           #   搜索
│   └── update/           #   版本更新
├── data/                 # 数据源与缓存
├── hooks/                # React Hooks
├── screens/              # 页面视图
│   ├── Discover/         #   发现
│   ├── Search/           #   搜索
│   ├── Leaderboard/      #   排行榜
│   ├── Library/          #   音乐库
│   ├── Playlist/         #   歌单
│   ├── NowPlaying/       #   正在播放
│   └── Detail/           #   详情
├── store/                # Redux Store
├── theme/                # 主题系统
├── types/                # 类型定义
└── utils/                # 工具函数
```

## 文档

- [iOS 自签发包教程](./docs/ios-self-sign.md)
- [版本号标识规范](./docs/versioning.md)

## 说明

当前分发方式为 **unsigned IPA 自签分发**，非 App Store / TestFlight 正式发布渠道。如需正式上架，请接入 Apple Developer Program 签名流程。

## 免责声明

> [!IMPORTANT]
> 请在使用前仔细阅读以下条款。下载、安装或使用本应用即表示您已阅读并同意以下全部内容。

1. **本应用不存储任何音乐文件**。所有音频内容均来自第三方公开接口，本应用仅作为播放工具进行流式传输，不提供任何音乐的上传、下载或持久化存储服务。
2. **本应用不提供任何音乐资源**。应用内展示的所有歌曲信息、歌词、封面、评论等内容均来源于第三方平台的公开数据，版权归原始权利人所有。
3. **仅供个人学习与技术研究使用**。本项目旨在学习 React Native 跨平台开发技术，严禁将本应用用于任何商业用途或非法用途。
4. **用户行为自负**。用户使用本应用产生的一切行为及后果，包括但不限于侵犯第三方知识产权、违反当地法律法规等，均由用户自行承担，与本项目开发者无关。
5. **不保证服务可用性**。第三方接口可能随时变更或失效，本应用不对内容的可用性、准确性或完整性作任何保证。
6. **如有侵权请联系删除**。若本项目的任何内容侵犯了您的合法权益，请通过 [Issues](https://github.com/xiaoqi419/joy-music-mobile/issues) 联系我们，我们将在确认后第一时间处理。

## 许可

本项目仅供学习交流使用，不得用于商业目的。
