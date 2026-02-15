/**
 * Joy Music Mobile - Main App Component
 * iOS music player application powered by React Native + Expo
 */

import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, StatusBar, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Provider as ReduxProvider, useDispatch } from 'react-redux'
import * as SplashScreen from 'expo-splash-screen'
import store from './src/store'
import { useTheme, CAPSULE_BOTTOM_MARGIN } from './src/theme'
import TabBar, { TabName } from './src/components/common/TabBar'
import MiniPlayer from './src/components/common/MiniPlayer'
import DiscoverScreen from './src/screens/Discover'
import SearchScreen from './src/screens/Search'
import LibraryScreen from './src/screens/Library'
import TrackListDetail from './src/screens/Detail/TrackListDetail'
import NowPlaying from './src/screens/NowPlaying'
import { playerController } from './src/core/player'
import { Track } from './src/types/music'
import { LeaderboardBoardItem, SongListItem } from './src/types/discover'
import { getLeaderboardDetail, getSongListDetail } from './src/core/discover'

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
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<TabName>('discover')
  const [detailView, setDetailView] = useState<DetailView | null>(null)
  const [showNowPlaying, setShowNowPlaying] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        await playerController.initialize()
      } catch (e) {
        console.error('Player init error:', e)
      } finally {
        SplashScreen.hideAsync()
      }
    }
    init()
  }, [])

  const handleTrackPress = useCallback(async (track: Track) => {
    try {
      dispatch({ type: 'PLAYER_SET_CURRENT_TRACK', payload: track })
      await playerController.playTrack(track, {
        autoPlay: true,
        quality: '320k',
      })
      setShowNowPlaying(true)
    } catch (e) {
      console.error('Play error:', e)
    }
  }, [dispatch])

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
        description: `${board.source.toUpperCase()} leaderboard`,
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

  const handlePlayAll = useCallback(async () => {
    if (!detailView || detailView.tracks.length === 0) return
    try {
      playerController.setPlaylist(detailView.tracks)
      dispatch({ type: 'PLAYER_SET_PLAYLIST', payload: detailView.tracks })
      dispatch({ type: 'PLAYER_SET_CURRENT_TRACK', payload: detailView.tracks[0] })
      await playerController.playFromPlaylist(detailView.tracks, 0, {
        autoPlay: true,
        quality: '320k',
      })
      setShowNowPlaying(true)
    } catch (e) {
      console.error('Play all error:', e)
    }
  }, [detailView, dispatch])

  const handleDetailBack = useCallback(() => {
    setDetailView(null)
  }, [])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Main content area */}
      <View style={styles.content}>
        {activeTab === 'discover' && (
          <DiscoverScreen
            onLeaderboardPress={handleLeaderboardPress}
            onPlaylistPress={handlePlaylistPress}
            onTrackPress={handleTrackPress}
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

      {/* 悬浮球播放器 - 位于 TabBar 右侧同级 */}
      <View
        style={{
          position: 'absolute',
          right: 24,
          bottom: Math.max(insets.bottom, 16) + CAPSULE_BOTTOM_MARGIN,
        }}
      >
        <MiniPlayer onOpenPlayer={() => setShowNowPlaying(true)} />
      </View>

      {showNowPlaying && (
        <NowPlaying onClose={() => setShowNowPlaying(false)} />
      )}

      {/* TabBar - fixed at bottom */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
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
})

export default App
