# 🎵 Joy Music Mobile - 音源系统快速开始指南

## ✨ 你已经拥有什么

基于 lx-music-mobile 架构，你现在拥有一套完整的 iOS 音乐播放系统：

✅ **音源管理系统** - 支持多个音源，使用 ikun-music-source 适配器
✅ **iOS 播放器** - 基于 Expo-AV，支持后台播放和响铃模式播放
✅ **缓存系统** - AsyncStorage 多层缓存，减少网络请求
✅ **质量自适应** - 自动选择最高可用质量，支持回源
✅ **Redux 集成** - 完整的状态管理
✅ **测试 UI** - PlayerTest 组件供快速验证

---

## 🚀 快速开始

### 1. 基本播放 - 3 行代码

```typescript
import { playerController } from './core/player'

// 初始化
await playerController.initialize()

// 播放音乐
await playerController.playTrack({
  id: '123',
  title: '歌曲名',
  artist: '艺术家',
  duration: 180000,
  url: '',
  source: 'kw',
  songmid: 'xxx',
  hash: 'xxx',
})
```

### 2. 测试播放器

```typescript
import PlayerTestComponent from './screens/PlayerTest'

// 在你的 App.tsx 中
export default function App() {
  return <PlayerTestComponent />
}
```

就这样！你可以立即开始播放歌曲。

---

## 📚 完整 API 参考

### 初始化和基本控制

```typescript
import { playerController } from './core/player'

// 初始化播放器
await playerController.initialize()

// 播放单个歌曲
await playerController.playTrack(track, {
  quality: '320k',           // 可选：指定质量
  autoPlay: true,            // 可选：自动播放
  statusCallback: (status) => {} // 可选：状态回调
})

// 暂停
await playerController.pause()

// 继续
await playerController.resume()

// 停止
await playerController.stop()
```

### 播放列表操作

```typescript
// 设置播放列表
playerController.setPlaylist([track1, track2, track3])

// 从列表中播放指定位置
await playerController.playFromPlaylist(playlist, 0)

// 下一首
await playerController.playNext()

// 上一首
await playerController.playPrevious()
```

### 进度和音量控制

```typescript
// 跳转到指定位置 (毫秒)
await playerController.seek(30000) // 30秒

// 设置音量 (0-1)
await playerController.setVolume(0.8)

// 设置播放速率 (0.5-2.0)
await playerController.setRate(1.5)
```

### 状态监听

```typescript
// 订阅播放状态更新
const unsubscribe = playerController.onStatusUpdate((status) => {
  console.log(`位置: ${status.positionMillis}ms`)
  console.log(`总长: ${status.durationMillis}ms`)
  console.log(`播放中: ${status.isPlaying}`)
  console.log(`速率: ${status.rate}x`)
  console.log(`音量: ${status.volume}`)
})

// 取消订阅
unsubscribe()
```

### 音源管理

```typescript
// 获取所有可用源
const sources = playerController.getAvailableSources()
// 返回: [{ id: 'ikun', name: 'Ikun Music', enabled: true, ... }]

// 获取当前源
const currentSource = playerController.getCurrentSource()
// 返回: 'ikun'

// 切换源
playerController.changeSource('ikun')

// 设置偏好质量
playerController.setPreferredQuality('flac')
```

---

## 📊 性能优化建议

### 1. 缓存优先

首次播放时会缓存 URL，后续播放相同歌曲时直接使用缓存（秒级响应）

### 2. 质量选择

- 如果网络好，使用 'flac' 或 'flac24bit'
- 日常使用推荐 '320k'
- 低流量推荐 '128k'

### 3. 列表预加载

```typescript
// 预先设置列表，避免频繁变动
playerController.setPlaylist(bigPlaylist)

// 随后只需播放即可
await playerController.playFromPlaylist(bigPlaylist, index)
```

---

## 🎨 UI 集成示例

### 简单播放器界面

```typescript
import { View, Text, TouchableOpacity } from 'react-native'
import { playerController } from './core/player'

export function SimplePlayer({ track }) {
  const [isPlaying, setIsPlaying] = useState(false)

  const handlePlay = async() => {
    try {
      setIsPlaying(true)
      await playerController.playTrack(track)
    } catch (err) {
      setIsPlaying(false)
    }
  }

  return (
    <View>
      <Text>{track.title}</Text>
      <TouchableOpacity onPress={handlePlay}>
        <Text>{isPlaying ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
    </View>
  )
}
```

---

## ❓ 常见问题

**Q: 如何添加新的音源？**

A: 在 `src/core/music/sources/` 中创建新文件，实现 `MusicSourceAPI` 接口，然后在 `index.ts` 中注册。

**Q: 播放出错怎么办？**

A: 查看 console 日志找出错误信息，通常是 API key 过期或网络问题。

**Q: 如何修改 API 配置？**

A: 在 `src/core/music/sources/ikun.ts` 中修改 `API_URL` 和 `API_KEY`。

**Q: 支持 Android 吗？**

A: 目前专注于 iOS。Expo-AV 支持 Android，但需要额外的 Android 特定配置。

**Q: 歌词显示如何实现？**

A: `getLyricInfo()` 方法已预留，可通过 `ikunMusicSource` 实现。

---

## 📖 更多资源

- 📄 **完整文档**: `MUSIC_SOURCE_IMPLEMENTATION.md`
- 📄 **架构分析**: `LX_MUSIC_AUDIO_SOURCE_HANDLING.md`
- 🧪 **测试组件**: `src/screens/PlayerTest.tsx`

---

## ✅ 总结

你现在拥有：
- ✓ 完整的音源系统
- ✓ iOS 音频播放
- ✓ 自动缓存
- ✓ 错误恢复
- ✓ 轻量级 API

只需 3 行代码即可开始播放音乐！🎵

Happy coding! 🚀
