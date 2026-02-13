# Joy Music Mobile 进度记忆（2026-02-13）

## 一、目标背景
本阶段目标：
1. 将首页 Discover 从 mock 数据迁移到真实数据链路（对齐 lx 的 `nav_songlist` / `nav_top` 逻辑）。
2. 将播放器底层从 `expo-av` 迁移到 `expo-audio`。
3. 修复“能播放但没有歌曲全屏页”的体验缺失。

---

## 二、已完成事项

## 1. Discover 真实数据链路
已完成服务层与页面接入，首页不再依赖排行榜/歌单/热歌 mock 数据。

### 新增/改造的核心文件
- `src/types/discover.ts`
- `src/core/discover/http.ts`
- `src/core/discover/cache.ts`
- `src/core/discover/settings.ts`
- `src/core/discover/index.ts`
- `src/core/discover/sources/types.ts`
- `src/core/discover/sources/kw.ts`
- `src/core/discover/sources/wy.ts`
- `src/core/discover/sources/index.ts`

### 页面接入
- `src/screens/Discover/index.tsx`
- `src/screens/Discover/LeaderboardSection.tsx`
- `src/screens/Discover/PlaylistSection.tsx`
- `src/screens/Discover/HotTracksSection.tsx`

### 行为
- 首页支持平台切换（KW/WY/TX/KG/MG）
- 推荐歌单、排行榜走真实请求
- 热门歌曲来自“当前排行榜源的第一个榜单前 5 首”
- 配置持久化：
  - `@joy_discover_songlist_setting`
  - `@joy_discover_leaderboard_setting`

---

## 2. 播放器迁移到 expo-audio

### 已完成
- 重写播放器实现（保持原控制器接口不变）：
  - `src/core/player/expoav.ts`
- 迁移后底层能力：
  - `createAudioPlayer`
  - `setAudioModeAsync`
  - `play/pause/replace/seekTo`
  - `playbackStatusUpdate` 事件同步状态

### 配置与依赖
- 已安装：`expo-audio`
- 已移除：`expo-av`
- Expo 插件已替换：
  - `app.json` 中 `plugins` 从 `expo-av` 改为 `expo-audio`
  - 并设置 `recordAudioAndroid: false`（当前仅播放器场景，避免额外录音权限）

---

## 3. 歌曲全屏页（Now Playing）补齐

### 新增页面
- `src/screens/NowPlaying/index.tsx`

### 已接入交互
- 在 `App.tsx` 中增加 `showNowPlaying` 状态控制
- 点击播放歌曲（含歌单详情页播放、播放全部）后自动打开全屏页
- `MiniPlayer` 支持点击曲目信息区打开全屏页

### 相关修复
- `src/hooks/usePlayerStatus.ts` 修复 `currentTrack` 同步逻辑
  - 之前只更新进度不更新曲目信息
  - 现在从 `playerController.getCurrentTrack()` 实时同步

---

## 三、关键决策记录
1. 为减少破坏面，`playerController` 对外接口不改，替换仅发生在底层播放器实现。
2. 先保障 Discover 主链路可用，再逐步加深各平台适配细节。
3. 保持当前 UI 风格，不在本阶段重构全局导航架构。

---

## 四、当前已知边界/风险
1. Discover 全平台切换已具备，但 `tx/kg/mg` 目前为 fallback 适配策略，非完整独立实现。
2. 仓库存在历史中文乱码文本（部分旧文件），本阶段未做编码治理。
3. 项目 `eslint` 仍有原配置问题（与本次功能改造无直接关系），当前使用 `tsc` 作为主要校验手段。

---

## 五、后续建议任务（按优先级）
1. 完整化 `tx/kg/mg` 独立适配器（摆脱 fallback）。
2. Now Playing 增加更多播放器行为：
   - 播放模式（列表循环/单曲循环/随机）
   - 歌词显示与滚动
   - 封面渐变/动态背景
3. 完善 Discover 异常与空状态文案统一。
4. 补全单测：缓存键、持久化、适配器归一化输出。

---

## 六、运行与校验命令
```bash
npm install
npx expo config --type public
npx tsc --noEmit
npm run start
```

