# Joy Music Mobile 项目结构文档

## 目录树概览

```
joy-music-mobile/
├── src/                          # 源代码目录
│   ├── app.ts                    # 应用入口
│   ├── components/               # React 组件
│   │   └── common/               # 通用组件
│   ├── config/                   # 应用配置
│   │   └── index.ts             # 主配置文件
│   ├── core/                     # 核心业务逻辑
│   │   ├── init/                 # 初始化模块
│   │   ├── music/                # 音乐管理核心
│   │   │   └── index.ts          # 音乐数据管理器
│   │   ├── player/               # 播放器核心
│   │   │   └── index.ts          # 播放控制器
│   │   └── search/               # 搜索核心
│   │       └── index.ts          # 搜索引擎
│   ├── event/                    # 事件系统
│   ├── lang/                     # 国际化 (i18n)
│   ├── navigation/               # 导航管理
│   │   └── components/           # 导航相关组件
│   ├── plugins/                  # 插件系统
│   │   ├── player/               # 播放器插件
│   │   └── sync/                 # 同步服务插件
│   ├── resources/                # 静态资源
│   │   ├── fonts/                # 字体文件
│   │   ├── images/               # 图片资源
│   │   └── medias/               # 媒体文件
│   ├── screens/                  # 页面组件
│   │   ├── Home/                 # 主页面
│   │   │   └── index.tsx         # 主页组件
│   │   ├── PlayDetail/           # 播放详情页
│   │   └── Comment/              # 评论页面
│   ├── store/                    # Redux 存储
│   │   ├── index.ts              # 存储配置
│   │   └── reducers/             # Redux Reducers
│   │       ├── player.ts         # 播放器状态
│   │       ├── playlist.ts       # 播放列表状态
│   │       └── config.ts         # 配置状态
│   ├── theme/                    # 主题管理
│   │   └── themes/               # 主题文件
│   ├── types/                    # TypeScript 类型定义
│   │   └── music.ts              # 音乐相关类型
│   └── utils/                    # 工具函数
│       └── common.ts             # 通用工具
├── ios/                          # iOS 原生代码
├── node_modules/                 # 依赖包
├── .git/                         # Git 仓库
├── .gitignore                    # Git 忽略配置
├── .eslintrc.js                  # ESLint 配置
├── tsconfig.json                 # TypeScript 配置
├── babel.config.js               # Babel 配置
├── metro.config.js               # Metro 打包器配置
├── package.json                  # 项目依赖和脚本
├── package-lock.json             # 依赖锁定文件
├── App.tsx                       # 应用主组件
├── index.js                      # 应用入口文件
├── README.md                     # 项目说明文档
├── LICENSE                       # 开源许可证
└── STRUCTURE.md                  # 本文件
```

## 核心模块说明

### 1. src/core/ - 核心业务逻辑

#### Player Module (src/core/player/)
负责音乐播放的核心功能：
- 播放、暂停、停止
- 音量控制
- 进度条管理
- 播放模式控制

#### Music Module (src/core/music/)
负责音乐数据管理：
- 本地音乐库加载
- 播放列表管理
- 收藏和标签管理
- 元数据处理

#### Search Module (src/core/search/)
负责音乐搜索功能：
- 搜索接口
- 搜索建议
- 热门搜索词
- 搜索缓存

### 2. src/store/ - Redux 状态管理

```
store/
├── index.ts              # 创建并导出 Redux store
└── reducers/
    ├── player.ts        # 播放器状态 reducer
    ├── playlist.ts      # 播放列表状态 reducer
    └── config.ts        # 应用配置状态 reducer
```

#### Player State
```typescript
{
  currentTrack: Track | null,     // 当前播放曲目
  isPlaying: boolean,              // 是否正在播放
  currentTime: number,             // 当前播放时间
  duration: number,                // 曲目总长度
  playlist: Track[],               // 播放列表
  currentIndex: number,            // 当前曲目索引
  volume: number,                  // 音量 (0-1)
  repeatMode: 'off'|'all'|'one',  // 重复模式
  shuffleMode: boolean,            // 随机播放
}
```

### 3. src/screens/ - 页面组件

#### Home Screen
应用首页，包含：
- 音乐库展示
- 搜索功能
- 播放列表管理
- 当前播放显示

#### PlayDetail Screen
播放详情页，展示：
- 专辑封面
- 歌词显示
- 播放进度
- 播放控制按钮

### 4. src/types/ - 类型定义

主要类型：
- `Track` - 音乐曲目
- `Playlist` - 播放列表
- `PlayerState` - 播放器状态
- `SearchResult` - 搜索结果
- `AppConfig` - 应用配置

### 5. src/utils/ - 工具函数

提供的工具函数：
- `formatTime()` - 时间格式化
- `formatFileSize()` - 文件大小格式化
- `generateId()` - 生成唯一 ID
- `deepClone()` - 深拷贝对象
- `debounce()` - 防抖函数
- `throttle()` - 节流函数

## 开发流程

### 添加新页面
1. 在 `src/screens/` 下创建新文件夹
2. 编写 React 组件 (index.tsx)
3. 在 `src/navigation/` 中注册路由
4. 连接 Redux store (如需要)

### 添加新功能
1. 如果涉及状态，在 `src/store/reducers/` 中添加 reducer
2. 在 `src/core/` 中实现核心逻辑
3. 创建 UI 组件
4. 连接数据流

### 添加工具函数
1. 在 `src/utils/` 中的相应文件添加函数
2. 导出函数供其他模块使用
3. 在使用处导入并调用

## 数据流

```
User Interaction
      ↓
Component (src/screens/)
      ↓
Redux Action
      ↓
Reducer (src/store/reducers/)
      ↓
State Update
      ↓
Component Re-render
```

## 项目初始化检查清单

- [x] 项目结构创建
- [x] Redux 配置
- [x] 核心模块框架
- [x] 基础页面
- [x] TypeScript 类型定义
- [ ] 依赖安装 (`npm install`)
- [ ] iOS 原生配置
- [ ] 开发工具配置
- [ ] 项目测试

## 下一步开发任务

1. **完成依赖安装**
   - 运行 `npm install`
   - 解决任何依赖冲突

2. **配置 iOS 项目**
   - 更新 iOS Podfile
   - 配置权限和证书

3. **实现音乐播放功能**
   - 集成 react-native-track-player
   - 实现播放控制器

4. **实现搜索功能**
   - 连接音乐数据源
   - 实现搜索 UI

5. **添加更多页面和功能**
   - 设置页面
   - 用户账户系统
   - 云同步功能
