# LX Music Mobile - 音源处理机制详解

## 📋 目录
1. [整体架构](#整体架构)
2. [音源配置系统](#音源配置系统)
3. [音乐URL获取流程](#音乐url获取流程)
4. [缓存机制](#缓存机制)
5. [源切换与回源](#源切换与回源)
6. [质量选择](#质量选择)
7. [错误处理与重试](#错误处理与重试)
8. [关键代码示例](#关键代码示例)

---

## 整体架构

### 核心概念

lx-music-mobile 支持**多个音源**，用户可以在不同音乐平台之间切换：

- **酷我音乐 (KW)** - Kuwo Music
- **酷狗音乐 (KG)** - KuGou Music
- **QQ音乐 (TX)** - QQ Music
- **网易音乐 (WY)** - NetEase Music
- **咪咕音乐 (MG)** - Migu Music
- **本地音乐 (XM)** - Local/Custom
- **已下载音乐** - Downloaded tracks

### 三层音乐类型系统

```
getMusicUrl() 根据音乐类型路由
    ↓
├─ Online Music    (src/core/music/online.ts)     → 从API源流式获取
├─ Download Music  (src/core/music/download.ts)   → 从下载元数据回源
└─ Local Music     (src/core/music/local.ts)      → 尝试本地文件
```

---

## 音源配置系统

### 1. API源注册

**文件**: `src/utils/musicSdk/`

```
musicSdk/
├── api-source.js           # 源路由和初始化
├── api-source-info.ts      # 源元数据配置
├── index.js                # 源的聚合导出
├── kw/                      # 酷我API实现
├── kg/                      # 酷狗API实现
├── tx/                      # QQ音乐API实现
├── wy/                      # 网易API实现
├── mg/                      # 咪咕API实现
├── bd/                      # 百度（禁用）
└── xm.js                    # 本地源
```

### 2. 源的支持质量注册

**文件**: `src/utils/musicSdk/api-source.js`

```javascript
const supportQuality = {}

for (const api of apiSourceInfo) {
  // 为每个源注册它支持的音质列表
  supportQuality[api.id] = api.supportQualitys
}
```

### 3. 当前源设置

**文件**: `src/core/apiSource.ts`

```typescript
export const setApiSource = (apiId: string) => {
  if (/^user_api/.test(apiId)) {
    // 加载用户自定义API
    setUserApi(apiId)
  } else {
    // 设置全局质量列表
    global.lx.qualityList = musicSdk.supportQuality[apiId] ?? {}
  }

  // 保存设置和发送事件
  updateSetting({ 'common.apiSource': apiId })
  global.state_event.apiSourceUpdated(apiId)
}
```

---

## 音乐URL获取流程

### 完整流程图

```
用户选择音乐 → playMusic()
    ↓
debouncePlay() (200ms防抖)
    ↓
setMusicUrl(musicInfo)
    ↓
getMusicPlayUrl(musicInfo)
    ↓
[决策分支]
    ├─ 有toggleMusicInfo → 尝试切换源版本
    │   └─ 失败 → 回源(getOtherSource)
    └─ 无toggleMusicInfo → 直接获取
    ↓
getMusicUrl(musicInfo, quality, isRefresh)
    ├─ 检查缓存 ← getStoreMusicUrl()
    │   └─ 有缓存 & !refresh → 返回缓存URL
    └─ 无缓存或refresh
        ├─ 确定质量 ← getPlayQuality()
        ├─ 调用API ← musicSdk[source].getMusicUrl()
        └─ 保存缓存 ← saveMusicUrl()
    ↓
setResource(musicInfo, url) → 传给播放器
```

### 代码实现（src/core/music/online.ts）

```typescript
export const getMusicUrl = async({
  musicInfo,
  quality,
  isRefresh,
  allowToggleSource = true,
  onToggleSource = () => {}
}: {
  musicInfo: LX.Music.MusicInfoOnline
  quality?: LX.Quality
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  // 1. 确定目标质量
  const targetQuality = quality ?? getPlayQuality(
    settingState.setting['player.playQuality'],
    musicInfo
  )

  // 2. 检查缓存
  const cachedUrl = await getStoreMusicUrl(musicInfo, targetQuality)
  if (cachedUrl && !isRefresh) return cachedUrl

  // 3. 获取新URL（可能涉及回源）
  return handleGetOnlineMusicUrl({
    musicInfo,
    quality,
    onToggleSource,
    isRefresh,
    allowToggleSource
  }).then(({ url, quality: targetQuality, musicInfo: targetMusicInfo, isFromCache }) => {
    // 4. 保存缓存
    if (targetMusicInfo.id != musicInfo.id && !isFromCache) {
      void saveMusicUrl(targetMusicInfo, targetQuality, url)
    }
    void saveMusicUrl(musicInfo, targetQuality, url)
    return url
  })
}
```

---

## 缓存机制

### 三层缓存架构

#### 1. **LocalStorage URL缓存** (持久化)

**前缀**: `@music_url__`

```typescript
// 存储格式
Key: `@music_url__{musicId}_{quality}`
// 例如: @music_url__123456_320k

Value: "https://music.api.com/song/123456.mp3?token=xxx"
```

**保存位置**: `src/utils/data.ts`

```typescript
export const saveMusicUrl = async(
  musicInfo: LX.Music.MusicInfo,
  quality: LX.Quality,
  url: string
) => {
  await AsyncStorage.setItem(
    `@music_url__{musicInfo.id}_${quality}`,
    url
  )
}

export const getMusicUrl = async(
  musicInfo: LX.Music.MusicInfo,
  quality: LX.Quality
): Promise<string | null> => {
  return await AsyncStorage.getItem(
    `@music_url__{musicInfo.id}_${quality}`
  )
}
```

#### 2. **Lyric缓存** (持久化)

```typescript
// 歌词缓存
Key: `@lyric__{musicId}`
Value: LyricInfo { lyric, tlyric, rlyric, lxlyric }

// 已编辑歌词
Key: `@lyric__{musicId}_edited`
Value: EditedLyricInfo
```

#### 3. **其他源缓存** (内存)

**文件**: `src/core/music/utils.ts`

```typescript
const otherSourceCache = new Map<
  LX.Music.MusicInfo | LX.Download.ListItem,
  LX.Music.MusicInfoOnline[]
>()

// 使用方式
if (otherSourceCache.has(musicInfo)) {
  return otherSourceCache.get(musicInfo)!  // 返回已缓存的其他源
}

// 缓存满时清空
if (otherSourceCache.size > 10) {
  otherSourceCache.clear()
}

otherSourceCache.set(musicInfo, sources)
```

---

## 源切换与回源

### 自动回源机制 (getOtherSource)

当主源获取URL失败时，系统会**自动在其他源中搜索相同歌曲**。

**文件**: `src/core/music/utils.ts`

```typescript
export const getOtherSource = async(
  musicInfo: LX.Music.MusicInfo | LX.Download.ListItem,
  isRefresh = false
): Promise<LX.Music.MusicInfoOnline[]> => {
  // 1. 检查内存缓存
  if (otherSourceCache.has(musicInfo)) {
    return otherSourceCache.get(musicInfo)!
  }

  // 2. 构建搜索条件
  const searchMusicInfo = {
    name: musicInfo.name,
    singer: musicInfo.singer,
    source: musicInfo.source,
    albumName: musicInfo.meta.albumName,
    interval: musicInfo.interval ?? '',
  }

  // 3. 12秒超时的搜索
  const promise = new Promise<LX.Music.MusicInfoOnline[]>((resolve, reject) => {
    let timeout: null | number = BackgroundTimer.setTimeout(() => {
      timeout = null
      reject(new Error('find music timeout'))
    }, 12_000)

    findMusic(searchMusicInfo)
      .then((otherSource) => {
        // 缓存满时清空
        if (otherSourceCache.size > 10) otherSourceCache.clear()

        const source = otherSource.map(toNewMusicInfo)
        otherSourceCache.set(musicInfo, source)
        resolve(source)
      })
      .catch(reject)
      .finally(() => {
        if (timeout) BackgroundTimer.clearTimeout(timeout)
      })
  })

  return promise
}
```

### 智能歌曲匹配算法 (findMusic)

**文件**: `src/utils/musicSdk/index.js`

系统会跨所有源搜索歌曲，然后通过**多阶段匹配**找到最相似的版本：

#### 匹配阶段（优先级从高到低）：

```javascript
const findMusic = async(musicInfo) => {
  const { name, singer, albumName, interval, source: s } = musicInfo

  // 搜索所有源（除了当前源）
  const lists = await searchMusic({ name, singer, source: s, limit: 25 })

  // 阶段1: 完全匹配
  // ✓ 歌曲名 = 目标名
  // ✓ 歌手 = 目标歌手（支持多歌手匹配）
  // ✓ 时长 ±5秒以内
  if (item.fMusicName == fMusicName && isIncludesSinger(item.fSinger)) {
    return item
  }

  // 阶段2: 歌手+名字匹配
  // ✓ 歌手一致
  // ✓ 歌曲名包含目标名
  // ✓ 时长 ±5秒以内
  if (item.fSinger == fSinger && isIncludesName(item.fMusicName)) {
    return item
  }

  // 阶段3: 宽松匹配
  // ✓ 专辑名一致
  // ✓ 歌手包含目标歌手
  // ✓ 歌曲名包含目标名
  if (isEqualsAlbum(item.fAlbumName) &&
      isIncludesSinger(item.fSinger) &&
      isIncludesName(item.fMusicName)) {
    return item
  }

  return null
}
```

#### 字符串标准化：

```javascript
// 移除特殊字符和空格
const filterStr = str => str.replace(
  /\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！/g,
  ''
)

// 歌手多人标准化（按字母顺序排序）
const singersRxp = /、|&|;|；|\/|,|，|\|/
const sortSingle = singer => singersRxp.test(singer)
  ? singer.split(singersRxp).sort((a, b) => a.localeCompare(b)).join('、')
  : (singer || '')

// 时长检查（±5秒）
const isEqualsInterval = (intv) =>
  Math.abs((fInterval || intv) - (intv || fInterval)) < 5
```

---

## 质量选择

### 质量层级

```typescript
// 支持的质量（优先级从高到低）
export enum Quality {
  FLAC_24BIT = 'flac24bit',  // 24-bit FLAC（最高）
  FLAC       = 'flac',        // 无损 FLAC
  HIGH       = '320k',        // 320 kbps MP3
  NORMAL     = '128k',        // 128 kbps MP3（最低）
}
```

### 质量选择逻辑

**文件**: `src/core/music/utils.ts`

```typescript
export const getPlayQuality = (
  settingQuality: LX.Quality,
  musicInfo: LX.Music.MusicInfoOnline
): LX.Quality => {
  // 1. 使用用户设置的质量
  if (isQualityAvailable(musicInfo, settingQuality)) {
    return settingQuality
  }

  // 2. 逐级降级回源
  const qualityFallback = ['flac24bit', 'flac', '320k', '128k']

  for (const quality of qualityFallback) {
    if (isQualityAvailable(musicInfo, quality)) {
      return quality
    }
  }

  // 3. 最后回源到任何可用质量
  return '128k'
}
```

### 质量可用性检查

```typescript
// musicInfo 结构
musicInfo: {
  meta: {
    _qualitys: {
      '128k': true,    // 该源有128k
      '320k': true,    // 该源有320k
      'flac': false,   // 该源无FLAC
    }
  }
}

const isQualityAvailable = (musicInfo, quality) =>
  musicInfo.meta._qualitys?.[quality] === true
```

---

## 错误处理与重试

### 错误分类

#### 1. **速率限制错误 (429)**

**处理**: 延迟重试（指数退避）

```typescript
const delayRetry = async(
  musicInfo: LX.Music.MusicInfo,
  isRefresh = false
): Promise<string | null> => {
  return new Promise<string | null>((resolve, reject) => {
    // 随机延迟 2-6 秒
    const time = getRandom(2, 6)

    setStatusText(global.i18n.t(
      'player__getting_url_delay_retry',
      { time }
    ))

    const timeout = setTimeout(() => {
      getMusicPlayUrl(musicInfo, isRefresh, true)
        .then(result => {
          cancelDelayRetry = null
          resolve(result)
        })
        .catch(reject)
    }, time * 1000)

    // 提供取消机制
    cancelDelayRetry = () => {
      clearTimeout(timeout)
      cancelDelayRetry = null
      resolve(null)
    }
  })
}
```

#### 2. **获取失败 → 回源**

```typescript
export const getMusicPlayUrl = async(
  musicInfo,
  isRefresh = false,
  isRetryed = false
): Promise<string | null> => {
  let toggleMusicInfo = musicInfo.meta.toggleMusicInfo

  return (toggleMusicInfo
    ? getMusicUrl({
        musicInfo: toggleMusicInfo,
        isRefresh,
        allowToggleSource: false,
      })
    : Promise.reject(new Error('not found'))
  )
    // 主源失败 → 尝试其他源
    .catch(async() => {
      return getMusicUrl({
        musicInfo,
        isRefresh,
        onToggleSource(mInfo) {
          if (diffCurrentMusicInfo(musicInfo)) return
          setStatusText(global.i18n.t('toggle_source_try'))
        },
      })
    })
    // 错误处理
    .catch(async err => {
      // 429 速率限制
      if (err.message == requestMsg.tooManyRequests) {
        return delayRetry(musicInfo, isRefresh)
      }

      // 未重试过 → 重试一次
      if (!isRetryed) {
        return getMusicPlayUrl(musicInfo, isRefresh, true)
      }

      throw err
    })
}
```

### 超时机制

```typescript
// 加载超时: 100秒
const { addDelayNextTimeout: addLoadTimeout, clearDelayNextTimeout: clearLoadTimeout }
  = createDelayNextTimeout(100_000)

// 搜索其他源超时: 12秒
let timeout: null | number = BackgroundTimer.setTimeout(() => {
  timeout = null
  reject(new Error('find music timeout'))
}, 12_000)
```

---

## 关键代码示例

### 例1: 完整播放流程

```typescript
// src/core/player/player.ts

const debouncePlay = debounceBackgroundTimer((musicInfo: LX.Player.PlayMusic) => {
  // 1. 获取URL
  setMusicUrl(musicInfo)

  // 2. 获取封面
  void getPicPath({ musicInfo, listId: playerState.playMusicInfo.listId })
    .then((url: string) => {
      if (musicInfo.id != playerState.playMusicInfo.musicInfo?.id) return
      setMusicInfo({ pic: url })
      global.app_event.picUpdated()
    })

  // 3. 获取歌词
  void getLyricInfo({ musicInfo })
    .then((lyricInfo) => {
      if (musicInfo.id != playerState.playMusicInfo.musicInfo?.id) return
      setMusicInfo({
        lrc: lyricInfo.lyric,
        tlrc: lyricInfo.tlyric,
        lxlrc: lyricInfo.lxlyric,
        rlrc: lyricInfo.rlyric,
        rawlrc: lyricInfo.rawlrcInfo.lyric,
      })
      global.app_event.lyricUpdated()
    })
    .catch((err) => {
      console.log(err)
      if (musicInfo.id != playerState.playMusicInfo.musicInfo?.id) return
      setStatusText(global.i18n.t('lyric__load_error'))
    })
}, 200)  // 200ms防抖
```

### 例2: 本地音乐回源

```typescript
// src/core/music/local.ts

export const getMusicUrl = async({
  musicInfo,
  isRefresh,
  allowToggleSource = true,
  onToggleSource = () => {}
}): Promise<string> => {
  // 1. 尝试本地文件路径
  const localPath = getLocalFilePath(musicInfo)

  if (fileExists(localPath)) {
    return localPath
  }

  // 2. 本地文件不存在 → 回源到在线源
  if (allowToggleSource) {
    const otherSources = await getOtherSource(musicInfo)

    for (const source of otherSources) {
      try {
        return await getMusicUrl({ musicInfo: source })
      } catch (e) {
        continue
      }
    }
  }

  throw new Error('No available music source')
}
```

### 例3: 源检查和初始化

```typescript
// src/utils/musicSdk/index.js

// 初始化所有源
export const init = () => {
  const tasks = []
  for (let source of sources.sources) {
    let sm = sources[source.id]
    // 调用每个源的初始化方法
    sm && sm.init && tasks.push(sm.init())
  }
  return Promise.all(tasks)
}

// 跨源搜索
export const searchMusic = async({ name, singer, source: s, limit = 25 }) => {
  const tasks = []
  const excludeSource = ['xm']  // 排除本地源

  for (const source of sources.sources) {
    // 跳过当前源，防止重复
    if (source.id == s || excludeSource.includes(source.id)) continue

    // 搜索其他源
    if (sources[source.id].musicSearch) {
      tasks.push(
        sources[source.id].musicSearch
          .search(`${name} ${singer || ''}`.trim(), 1, limit)
          .catch(_ => null)
      )
    }
  }

  return (await Promise.all(tasks)).filter(s => s)
}
```

---

## 关键全局变量

```typescript
// src/config/globalData.ts

global.lx = {
  // 当前API源的质量列表
  qualityList: {},  // { '128k': true, '320k': true, ... }

  // 当前正在获取URL的音乐ID
  gettingUrlId: '',

  // API初始化Promise（控制源加载完成）
  apiInitPromise: [Promise, boolean, callback],

  // 用户自定义API
  apis: {},

  // 播放是否停止
  isPlayedStop: false,

  // 恢复播放信息
  restorePlayInfo: null,
}

// 全局事件
global.state_event = {
  apiSourceUpdated: (apiId) => {},
}

global.app_event = {
  error: () => {},
  picUpdated: () => {},
  lyricUpdated: () => {},
  setProgress: (time, maxTime) => {},
}
```

---

## 实现要点总结

### ✅ 核心特性

1. **多源支持**: 6个主流音乐平台
2. **智能回源**: 主源失败自动查找其他源
3. **三层缓存**: URL、歌词、搜索结果
4. **质量回源**: 无损→320k→128k阶梯降级
5. **错误恢复**: 429速率限制、超时、网络错误
6. **防抖处理**: 200ms防抖，防止重复请求
7. **中文支持**: 歌手多人、特殊字符规范化
8. **后台支持**: 后台计时器、播放状态保存

### 🎯 设计模式

1. **路由模式**: 根据音乐类型路由到不同处理器
2. **备选方案模式**: 主源失败自动切换
3. **缓存优先模式**: 检查缓存 → 网络请求
4. **事件驱动**: 源更新、歌词更新通过事件通知
5. **防抖节流**: 200ms防抖防止频繁请求

