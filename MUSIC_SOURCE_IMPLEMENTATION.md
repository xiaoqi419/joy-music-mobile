# Joy Music Mobile - 音源架构实现文档

## 📋 项目概览

基于 lx-music-mobile 的架构设计，在 Joy Music Mobile 中实现了一套完整的音源管理系统和播放功能。该系统仅适配 iOS 端，使用 Expo AV 库进行音频播放。

---

## 🏗️ 架构设计

### 整体架构图

```
┌─────────────────────────────────────────────┐
│           User Interface Layer              │
│      (PlayerTest Component / Screens)       │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│      Player Controller Layer                │
│   (playerController - High-level API)       │
└────────────────┬────────────────────────────┘
                 │
        ┌────────┴─────────┐
        │                  │
┌───────▼────────┐  ┌──────▼──────────┐
│  Expo AV       │  │  Music Manager  │
│  Player        │  │  (URL Fetcher)  │
│  (expoav.ts)   │  │  (music/url.ts) │
└────────────────┘  └──────┬──────────┘
                           │
                    ┌──────▼──────────┐
                    │ Music Source    │
                    │ Manager         │
                    │ (source.ts)     │
                    └──────┬──────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
      ┌─────▼─────┐              ┌───────▼────────┐
      │Ikun Music │              │ Cache System   │
      │Source API │              │ (cache.ts)     │
      │(ikun.ts)  │              │AsyncStorage    │
      └───────────┘              └────────────────┘
```

---

## 📁 文件结构

```
src/core/
├── music/
│   ├── index.ts              # 音乐管理器入口（整合所有模块）
│   ├── source.ts             # 音源管理系统
│   ├── url.ts                # URL获取和质量选择
│   ├── cache.ts              # 缓存系统（AsyncStorage）
│   └── sources/
│       └── ikun.ts           # Ikun 音源适配器
│
└── player/
    ├── index.ts              # 播放器导出
    ├── expoav.ts             # Expo-AV 播放器实现
    └── controller.ts         # 高级播放器控制器
```

---

## 🎵 核心模块说明

### 1. 音源管理系统 (source.ts)

**功能**：管理多个音源并提供统一接口

```typescript
class MusicSourceManager {
  registerSource()      // 注册新音源
  getSource()          // 获取音源API
  setCurrentSource()   // 切换当前音源
  getCurrentSource()   // 获取当前音源
  getSourceQualities() // 获取音源支持的质量
}

export const musicSourceManager = new MusicSourceManager()
```

**使用示例**：
```typescript
// 注册ikun源
musicSourceManager.registerSource(ikunMusicSource, {
  id: 'ikun',
  name: 'Ikun Music',
  enabled: true,
  supportedQualities: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
})

// 切换源
musicSourceManager.setCurrentSource('ikun')
```

---

### 2. Ikun 音源适配器 (sources/ikun.ts)

**功能**：适配 ikun-music-source.js API 到 Joy Music Mobile

```typescript
interface MusicSourceAPI {
  id: string
  name: string
  getMusicUrl(musicInfo: any, quality: Quality): Promise<string>
  getPicUrl?(musicInfo: any): Promise<string>
  getLyricInfo?(musicInfo: any): Promise<any>
  search?(keyword: string, page: number, limit: number): Promise<any>
}

export const ikunMusicSource: MusicSourceAPI = {
  async getMusicUrl(musicInfo, quality) {
    // 调用 Ikun API 获取音乐URL
    // 实现质量回源机制
    // 处理错误和重试
  }
}
```

**API 调用流程**：
```
getMusicUrl()
  ├─ 尝试主质量
  │  └─ 成功 → 返回URL
  │  └─ 失败 → 尝试降级质量
  ├─ 320k → 128k
  └─ 最后 → 抛出错误
```

---

### 3. URL 获取模块 (url.ts)

**功能**：处理 URL 获取、缓存和质量选择

```typescript
export async function getMusicUrl(request: MusicUrlRequest): Promise<MusicUrlResponse>
export async function getMusicUrlWithRetry(
  request: MusicUrlRequest,
  maxRetries?: number
): Promise<MusicUrlResponse>

export function getPlayQuality(
  requestedQuality: Quality | undefined,
  supportedQualities: Quality[]
): Quality
```

**工作流程**：
```
getMusicUrl()
  ├─ 检查缓存
  │  └─ 命中 → 返回缓存URL
  ├─ 获取源的支持质量
  ├─ 选择最佳质量
  ├─ 调用源API获取URL
  ├─ 质量回源处理
  └─ 保存到缓存
```

**质量降级策略**：
```
用户请求质量 ('flac24bit', 'flac', '320k', '128k')
  ↓
源是否支持?
  ├─ 是 → 使用该质量
  └─ 否 → 按顺序尝试降级

最终返回首个可用质量
```

---

### 4. 缓存系统 (cache.ts)

**功能**：使用 AsyncStorage 实现多层缓存

```typescript
class MusicUrlCache {
  async saveMusicUrl(musicId, quality, url, source)
  async getMusicUrl(musicId, quality): Promise<string | null>
  async clearMusicUrl(musicId)
  async clearAllUrlCache()
}

class LyricCache {
  async saveLyric(musicId, lyricInfo)
  async getLyric(musicId): Promise<LyricInfo | null>
}

export const clearAllCache = async(): Promise<void>
```

**缓存结构**：
```
AsyncStorage
├── @joy_music_url_{musicId}_{quality}    → { url, quality, timestamp, source }
└── @joy_music_lyric_{musicId}            → { lyric, tlyric, rlyric }
```

---

### 5. Expo-AV 播放器 (expoav.ts)

**功能**：基于 Expo-AV 的音频播放实现（iOS 专用）

```typescript
class ExpoAVPlayer {
  async initialize()
  async play(track, url, config)
  async pause()
  async resume()
  async stop()
  async seek(positionMillis)
  async setVolume(volume)
  async setRate(rate)
  async getStatus(): Promise<PlaybackStatus | null>
  setStatusCallback(callback)
}

export const expoAVPlayer = new ExpoAVPlayer()
```

**iOS 配置**：
```typescript
await Audio.setAudioModeAsync({
  playsInSilentModeIOS: true,        // 响铃模式也能播放
  staysActiveInBackground: true,     // 后台播放
  interruptionHandlingIOS: Audio.INTERRUPTION_MODE_IOS_DUCK_OTHERS,
})
```

---

### 6. 播放器控制器 (controller.ts)

**功能**：高级播放器 API，整合音源和播放器

```typescript
class MusicPlayerController {
  async initialize()
  async playTrack(track, config?)
  async playFromPlaylist(playlist, index, config?)
  async pause()
  async resume()
  async playNext()
  async playPrevious()
  async stop()
  async seek(positionMillis)
  async setVolume(volume)
  async setRate(rate)
  setPreferredQuality(quality)
  onStatusUpdate(callback): unsubscribeFn
  changeSource(sourceId)
  getAvailableSources()
}

export const playerController = new MusicPlayerController()
```

**使用流程**：
```typescript
// 初始化
await playerController.initialize()

// 设置播放列表
playerController.setPlaylist(tracks)

// 播放指定歌曲
await playerController.playTrack(track, {
  quality: '320k',
  autoPlay: true,
  statusCallback: (status) => {
    // 处理播放状态更新
  }
})

// 订阅状态更新
const unsubscribe = playerController.onStatusUpdate((status) => {
  console.log(`${status.positionMillis}ms / ${status.durationMillis}ms`)
})

// 播放控制
await playerController.pause()
await playerController.resume()
await playerController.seek(30000) // 30秒位置
await playerController.setVolume(0.8)

// 清理
unsubscribe()
```

---

## 🔄 完整播放流程

### 用户播放歌曲

```
用户点击播放歌曲
  ↓
PlayerController.playTrack(track)
  ↓
musicManager.getMusicPlayUrl(track, quality)
  ├─ 检查URL缓存
  │  ├─ 命中 → 返回缓存URL
  │  └─ 未命中 ↓
  ├─ 获取当前音源（Ikun）
  ├─ 获取支持的质量列表
  ├─ 选择最佳质量
  └─ 调用 ikunMusicSource.getMusicUrl()
      ├─ 构建API请求
      ├─ 发送POST到 c.wwwweb.top
      ├─ 处理响应
      ├─ 错误处理 & 质量回源
      └─ 返回URL
  ├─ 保存URL到缓存
  └─ 返回URL
  ↓
expoAVPlayer.play(track, url)
  ├─ 初始化 Audio 会话
  ├─ 创建 Audio.Sound
  ├─ 加载音频文件
  ├─ 设置音量/速率
  └─ 开始播放
  ↓
播放状态更新
  ├─ 回调 statusCallback
  ├─ 更新UI
  └─ 显示进度条
```

---

## 🎮 Redux 状态管理

### 音源状态 Reducer (reducers/musicSource.ts)

```typescript
interface MusicSourceState {
  currentSourceId: string              // 当前音源ID
  availableSources: MusicSourceInfo[]  // 可用音源列表
  preferredQuality: Quality            // 偏好质量
  isLoadingUrl: boolean               // 是否正在加载URL
  lastError: string | null            // 最后的错误
}

// Actions
MUSIC_SOURCE_SET_SOURCES       // 设置可用源
MUSIC_SOURCE_SET_CURRENT       // 切换当前源
MUSIC_SOURCE_SET_QUALITY       // 设置偏好质量
MUSIC_SOURCE_SET_LOADING       // 设置加载状态
MUSIC_SOURCE_SET_ERROR         // 设置错误信息
MUSIC_SOURCE_CLEAR_ERROR       // 清除错误
```

### Root State

```typescript
export type RootState = {
  player: PlayerState
  playlist: PlaylistState
  config: AppConfig
  musicSource: MusicSourceState
}
```

---

## 🧪 测试组件 (PlayerTest.tsx)

提供了完整的音源播放测试界面：

- ✅ 播放/暂停/停止控制
- ✅ 上一首/下一首
- ✅ 进度条显示和跳转
- ✅ 时间显示
- ✅ 测试歌曲列表
- ✅ 错误提示
- ✅ 加载状态

**使用**：
```typescript
import PlayerTestComponent from './screens/PlayerTest'

// 在 App.tsx 中使用
<PlayerTestComponent />
```

---

## 🚀 使用指南

### 1. 基本播放

```typescript
import { playerController } from './core/player'
import { Track } from './types/music'

// 初始化
await playerController.initialize()

// 创建音乐对象（必须包含 ikun 字段）
const track: Track = {
  id: '123',
  title: '歌曲名',
  artist: '艺术家',
  duration: 180000,
  url: '', // 不需要预先提供，会由系统获取
  source: 'kw',        // 音源
  songmid: 'xxx',      // 歌曲ID
  hash: 'xxx',         // 歌曲哈希
}

// 播放
await playerController.playTrack(track, {
  quality: '320k',
  autoPlay: true,
})
```

### 2. 播放列表

```typescript
const playlist: Track[] = [track1, track2, track3]

// 设置列表
playerController.setPlaylist(playlist)

// 从索引播放
await playerController.playFromPlaylist(playlist, 0)

// 下一首/上一首
await playerController.playNext()
await playerController.playPrevious()
```

### 3. 状态监听

```typescript
// 订阅播放状态
const unsubscribe = playerController.onStatusUpdate((status) => {
  console.log(`位置: ${status.positionMillis}ms`)
  console.log(`总长: ${status.durationMillis}ms`)
  console.log(`播放中: ${status.isPlaying}`)
  console.log(`速率: ${status.rate}x`)
})

// 取消订阅
unsubscribe()
```

### 4. 控制播放

```typescript
// 暂停/继续
await playerController.pause()
await playerController.resume()

// 停止
await playerController.stop()

// 跳转
await playerController.seek(30000) // 30秒

// 音量（0-1）
await playerController.setVolume(0.8)

// 速率（0.5-2.0）
await playerController.setRate(1.5)
```

### 5. 音源管理

```typescript
// 获取可用源
const sources = playerController.getAvailableSources()

// 获取当前源
const currentSource = playerController.getCurrentSource()

// 切换源
playerController.changeSource('ikun')
```

### 6. 质量设置

```typescript
// 设置偏好质量
playerController.setPreferredQuality('flac')

// 后续播放会使用此质量（如源支持）
// 如不支持会自动降级到可用的最高质量
```

---

## ⚠️ 注意事项

### iOS 特定配置

1. **后台播放权限**：已在 `expoav.ts` 中配置
2. **响铃模式**：即使在响铃模式下也能播放
3. **音频焦点**：允许其他应用的音频混音播放

### 缓存管理

```typescript
// 清除所有缓存
import { clearAllCache } from './core/music'
await clearAllCache()

// 或分别清除
import { musicUrlCache, lyricCache } from './core/music/cache'
await musicUrlCache.clearAllUrlCache()
await lyricCache.clearAllLyricCache()
```

### 错误处理

```typescript
try {
  await playerController.playTrack(track)
} catch (error) {
  if (error instanceof Error) {
    console.error('播放失败:', error.message)
    // 可能的错误：
    // - 'No music source available'
    // - 'API key invalid or expired'
    // - 'Too many requests'
    // - '获取URL失败'
  }
}
```

---

## 📊 支持的质量

从 ikun-music-source 获取的支持质量：

```typescript
{
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
}
```

质量回源顺序：`flac24bit → flac → 320k → 128k`

---

## 🔧 扩展指南

### 添加新的音源

```typescript
// 1. 创建新源适配器 (src/core/music/sources/mysource.ts)
export const myMusicSource: MusicSourceAPI = {
  id: 'mysource',
  name: 'My Music Source',
  async getMusicUrl(musicInfo, quality) {
    // 实现你的逻辑
  },
}

// 2. 在 music/index.ts 中注册
musicSourceManager.registerSource(myMusicSource, {
  id: 'mysource',
  name: 'My Music Source',
  enabled: true,
  supportedQualities: ['128k', '320k', 'flac'],
})
```

### 添加新的播放器功能

```typescript
// 在 controller.ts 中的 MusicPlayerController 类中添加方法
async customFeature() {
  // 你的实现
}
```

---

## 📝 总结

这个实现提供了：

✅ **模块化架构**：清晰的关注点分离
✅ **iOS 优化**：使用 Expo-AV，完全适配 iOS
✅ **多层缓存**：减少网络请求，提升性能
✅ **质量自适应**：自动降级到可用质量
✅ **错误处理**：完善的错误恢复机制
✅ **易扩展**：添加新音源无需修改核心代码
✅ **类型安全**：完整的 TypeScript 支持
✅ **状态管理**：Redux 集成，易于调试

