/**
 * Joy Music Mobile - Main App Component
 * iOS music player application powered by React Native + Expo
 */

import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, StatusBar, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Provider as ReduxProvider, useDispatch, useSelector } from 'react-redux'
import * as SplashScreen from 'expo-splash-screen'
import store from './src/store'
import { useTheme, CAPSULE_BOTTOM_MARGIN, CAPSULE_TAB_HEIGHT } from './src/theme'
import TabBar, { TabName } from './src/components/common/TabBar'
import MiniPlayer from './src/components/common/MiniPlayer'
import DiscoverScreen from './src/screens/Discover'
import LeaderboardScreen from './src/screens/Leaderboard'
import SearchScreen from './src/screens/Search'
import LibraryScreen from './src/screens/Library'
import TrackListDetail from './src/screens/Detail/TrackListDetail'
import NowPlaying from './src/screens/NowPlaying'
import { playerController, type PlaybackStatus } from './src/core/player'
import { Track } from './src/types/music'
import { LeaderboardBoardItem, SongListItem } from './src/types/discover'
import { getLeaderboardDetail, getSongListDetail } from './src/core/discover'
import { RootState } from './src/store'
import { loadThemeMode, saveThemeMode } from './src/core/config/theme'
import {
  loadMusicSourceSettings,
  saveMusicSourceSettings,
} from './src/core/config/musicSource'
import { applyJoyRuntimeConfig } from './src/core/music/sources/joy'

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync()

interface DetailView {
  title: string
  description?: string
  coverUrl?: string
  gradientColors?: [string, string]
  tracks: Track[]
}

function App() {
  return (
    <ReduxProvider store={store}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </ReduxProvider>
  )
}

function AppContent() {
  const { colors, isDark } = useTheme()
  const dispatch = useDispatch()
  const themeMode = useSelector((state: RootState) => state.config.theme)
  const musicSourceState = useSelector((state: RootState) => state.musicSource)
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<TabName>('discover')
  const [detailView, setDetailView] = useState<DetailView | null>(null)
  const [showNowPlaying, setShowNowPlaying] = useState(false)
  const [isDiscoverMoreVisible, setIsDiscoverMoreVisible] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [themeHydrated, setThemeHydrated] = useState(false)
  const [musicSourceHydrated, setMusicSourceHydrated] = useState(false)
  const [isResolvingTrack, setIsResolvingTrack] = useState(() => playerController.isResolvingTrack())
  const [resolvingHint, setResolvingHint] = useState(() => playerController.getResolvingHint())
  const shouldHideTabBar = activeTab === 'discover' && isDiscoverMoreVisible

  const getReadablePlayError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : '获取歌曲链接失败'
    if (/cannot post|405|404/i.test(message)) {
      return '音源接口地址不可用，请在“我的 > 自定义源管理”检查 API 地址是否正确'
    }
    return message
  }, [])

  const syncPlayerStateToStore = useCallback((playbackStatus?: PlaybackStatus | null) => {
    const snapshot = playerController.getPlayerState()
    dispatch({
      type: 'PLAYER_SYNC_STATE',
      payload: {
        ...snapshot,
        playlist: playerController.getPlaylist(),
        currentIndex: playerController.getCurrentIndex(),
        currentTrack: playerController.getCurrentTrack(),
        isPlaying: playbackStatus?.isPlaying ?? snapshot.isPlaying,
        currentTime: playbackStatus?.positionMillis ?? snapshot.currentTime,
        duration: playbackStatus?.durationMillis ?? snapshot.duration,
      },
    })
  }, [dispatch])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let active = true

    const init = async () => {
      try {
        // 启动时先恢复主题，避免用户每次重启都回到默认主题。
        const savedTheme = await loadThemeMode()
        if (active) {
          dispatch({
            type: 'CONFIG_SET_THEME',
            payload: savedTheme,
          })
        }
        if (active) setThemeHydrated(true)

        // 启动时恢复自定义音源配置，并注入播放运行时。
        const sourceSettings = await loadMusicSourceSettings()
        if (active) {
          dispatch({
            type: 'MUSIC_SOURCE_HYDRATE_SETTINGS',
            payload: sourceSettings,
          })
          applyJoyRuntimeConfig(sourceSettings)
          playerController.setPreferredQuality(sourceSettings.preferredQuality)
          setMusicSourceHydrated(true)
        }

        await playerController.initialize()
        const initialStatus = await playerController.getPlaybackStatus()
        if (active) syncPlayerStateToStore(initialStatus)
        unsubscribe = playerController.onStatusUpdate((status) => {
          if (!active) return
          syncPlayerStateToStore(status)
        })
      } catch (e) {
        console.error('Player init error:', e)
      } finally {
        SplashScreen.hideAsync()
      }
    }
    void init()

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [dispatch, syncPlayerStateToStore])

  useEffect(() => {
    if (!themeHydrated) return
    saveThemeMode(themeMode)
  }, [themeHydrated, themeMode])

  useEffect(() => {
    const unsubscribeResolving = playerController.onResolvingChange(setIsResolvingTrack)
    const unsubscribeHint = playerController.onResolvingHintChange(setResolvingHint)
    return () => {
      unsubscribeResolving()
      unsubscribeHint()
    }
  }, [])

  useEffect(() => {
    if (!musicSourceHydrated) return
    const snapshot = {
      selectedSourceId: musicSourceState.selectedImportedSourceId,
      autoSwitch: musicSourceState.autoSwitch,
      preferredQuality: musicSourceState.preferredQuality,
      importedSources: musicSourceState.importedSources,
    }
    saveMusicSourceSettings(snapshot)
    applyJoyRuntimeConfig(snapshot)
    playerController.setPreferredQuality(snapshot.preferredQuality)
  }, [
    musicSourceHydrated,
    musicSourceState.selectedImportedSourceId,
    musicSourceState.autoSwitch,
    musicSourceState.preferredQuality,
    musicSourceState.importedSources,
  ])

  const handleTrackPress = useCallback(async (track: Track) => {
    try {
      const currentTrack = playerController.getCurrentTrack()
      // 如果点击的是当前正在播放的歌曲，直接打开播放页继续播放
      if (currentTrack?.id === track.id) {
        setShowNowPlaying(true)
        return
      }

      await playerController.insertTrackAndPlay(track, {
        autoPlay: true,
      })
      const playbackStatus = await playerController.getPlaybackStatus()
      syncPlayerStateToStore(playbackStatus)
      setShowNowPlaying(true)
    } catch (e) {
      console.error('Play error:', e)
      Alert.alert('播放失败', getReadablePlayError(e))
    }
  }, [getReadablePlayError, syncPlayerStateToStore])

  const handleLeaderboardPress = useCallback(async(board: LeaderboardBoardItem) => {
    try {
      setDetailLoading(true)
      const detail = await getLeaderboardDetail({
        source: board.source,
        boardId: board.id,
        page: 1,
      })
      if (!detail.list.length) {
        Alert.alert('暂无可播放内容', `${board.source.toUpperCase()} 当前榜单为空，请切换平台重试。`)
        return
      }
      setDetailView({
        title: board.name,
        description: `${board.source.toUpperCase()} 榜单`,
        coverUrl: board.coverUrl,
        tracks: detail.list,
      })
    } catch (error) {
      console.error('Load leaderboard detail error:', error)
      Alert.alert('加载失败', `${board.source.toUpperCase()} 榜单获取失败，请稍后重试或切换平台。`)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const handlePlaylistPress = useCallback(async(playlist: SongListItem) => {
    try {
      setDetailLoading(true)
      const detail = await getSongListDetail({
        source: playlist.source,
        id: playlist.id,
        page: 1,
      })
      if (!detail.list.length) {
        Alert.alert('暂无可播放内容', `${playlist.source.toUpperCase()} 歌单为空，请切换平台重试。`)
        return
      }
      setDetailView({
        title: detail.info.name || playlist.name,
        description: detail.info.description || playlist.description,
        coverUrl: detail.info.coverUrl || playlist.coverUrl,
        tracks: detail.list,
      })
    } catch (error) {
      console.error('Load playlist detail error:', error)
      Alert.alert('加载失败', `${playlist.source.toUpperCase()} 歌单获取失败，请稍后重试或切换平台。`)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const replaceQueueAndPlayAll = useCallback(async() => {
    if (!detailView || detailView.tracks.length === 0) return
    try {
      await playerController.playFromPlaylist(detailView.tracks, 0, {
        autoPlay: true,
      })
      const playbackStatus = await playerController.getPlaybackStatus()
      syncPlayerStateToStore(playbackStatus)
      setShowNowPlaying(true)
    } catch (e) {
      console.error('Play all error:', e)
      Alert.alert('播放失败', getReadablePlayError(e))
    }
  }, [detailView, getReadablePlayError, syncPlayerStateToStore])

  const handlePlayAll = useCallback(() => {
    if (!detailView || detailView.tracks.length === 0) return

    const currentQueue = playerController.getPlaylist()
    if (!currentQueue.length) {
      void replaceQueueAndPlayAll()
      return
    }

    Alert.alert(
      '替换当前播放列表？',
      '播放全部将替换当前播放列表并从第一首开始播放。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '替换并播放',
          style: 'destructive',
          onPress: () => {
            void replaceQueueAndPlayAll()
          },
        },
      ],
    )
  }, [detailView, replaceQueueAndPlayAll])

  const handleDetailBack = useCallback(() => {
    setDetailView(null)
  }, [])

  useEffect(() => {
    if (activeTab !== 'discover' && isDiscoverMoreVisible) {
      setIsDiscoverMoreVisible(false)
    }
  }, [activeTab, isDiscoverMoreVisible])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Main content area */}
      <View style={styles.content}>
        {activeTab === 'discover' && (
          <DiscoverScreen
            onPlaylistPress={handlePlaylistPress}
            onMorePageVisibilityChange={setIsDiscoverMoreVisible}
          />
        )}
        {activeTab === 'leaderboard' && (
          <LeaderboardScreen
            onLeaderboardPress={handleLeaderboardPress}
          />
        )}
        {activeTab === 'search' && (
          <SearchScreen onTrackPress={handleTrackPress} />
        )}
        {activeTab === 'library' && (
          <LibraryScreen onTrackPress={handleTrackPress} />
        )}
      </View>

      {/* Detail overlay */}
      {detailView && (
        <TrackListDetail
          title={detailView.title}
          description={detailView.description}
          coverUrl={detailView.coverUrl}
          gradientColors={detailView.gradientColors}
          tracks={detailView.tracks}
          onBack={handleDetailBack}
          onTrackPress={handleTrackPress}
          onPlayAll={handlePlayAll}
        />
      )}

      {detailLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.text }]}>加载中...</Text>
        </View>
      )}

      {isResolvingTrack && !showNowPlaying && (
        <View
          style={[
            styles.resolveHintOverlay,
            {
              bottom: Math.max(insets.bottom, 16) + (
                shouldHideTabBar ? 64 : CAPSULE_BOTTOM_MARGIN + CAPSULE_TAB_HEIGHT + 64
              ),
            },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.resolveHintCard,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.separator,
              },
            ]}
          >
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.resolveHintText, { color: colors.textSecondary }]} numberOfLines={2}>
              {resolvingHint}
            </Text>
          </View>
        </View>
      )}

      {/* 条形 Mini 播放器 - 位于 TabBar 上方 */}
      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: Math.max(insets.bottom, 16) + (
            shouldHideTabBar ? 10 : CAPSULE_BOTTOM_MARGIN + CAPSULE_TAB_HEIGHT + 10
          ),
        }}
      >
        <MiniPlayer onOpenPlayer={() => setShowNowPlaying(true)} />
      </View>

      {showNowPlaying && (
        <NowPlaying onClose={() => setShowNowPlaying(false)} />
      )}

      {/* TabBar - fixed at bottom */}
      {!shouldHideTabBar && (
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resolveHintOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 70,
    paddingHorizontal: 24,
  },
  resolveHintCard: {
    minHeight: 36,
    maxWidth: 340,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resolveHintText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
})

export default App
