/**
 * Joy Music Mobile - Main App Component
 * iOS music player application powered by React Native + Expo
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type AlertButton,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector } from 'react-redux'
import * as SplashScreen from 'expo-splash-screen'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme, borderRadius, CAPSULE_BOTTOM_MARGIN, CAPSULE_TAB_HEIGHT } from '../theme'
import TabBar, { TabName } from '../components/common/TabBar'
import MiniPlayer from '../components/common/MiniPlayer'
import DiscoverScreen from '../screens/Discover'
import LeaderboardScreen from '../screens/Leaderboard'
import SearchScreen from '../screens/Search'
import PlaylistScreen from '../screens/Playlist'
import LibraryScreen from '../screens/Library'
import TrackListDetail from '../screens/Detail/TrackListDetail'
import NowPlaying from '../screens/NowPlaying'
import { playerController, type PlaybackStatus } from '../core/player'
import { Playlist, Track, type TrackMoreActionContext } from '../types/music'
import { LeaderboardBoardItem, SongListItem } from '../types/discover'
import { getLeaderboardDetail, getSongListDetail } from '../core/discover'
import { RootState } from '../store'
import { loadThemeMode, saveThemeMode } from '../core/config/theme'
import {
  loadMusicSourceSettings,
  saveMusicSourceSettings,
} from '../core/config/musicSource'
import {
  loadPlaylistSettings,
  savePlaylistSettings,
} from '../core/config/playlist'
import { applyJoyRuntimeConfig, hasConfiguredJoySource } from '../core/music/sources/joy'
import { emitScrollToTop, subscribeScrollTopState } from '../core/ui/scrollToTopBus'
import type { UIOverlay } from './uiState'

interface DetailView {
  title: string
  description?: string
  coverUrl?: string
  gradientColors?: [string, string]
  tracks: Track[]
  favoritePayload?: {
    type: 'playlist' | 'leaderboard'
    source: SongListItem['source']
    id: string
  }
}

const SCROLL_FAB_SIZE = 52
type FeedbackTone = 'success' | 'warning' | 'error'

function createPlaylistId() {
  return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export default function AppShell() {
  const { colors, isDark } = useTheme()
  const dispatch = useDispatch()
  const themeMode = useSelector((state: RootState) => state.config.theme)
  const musicSourceState = useSelector((state: RootState) => state.musicSource)
  const playlistState = useSelector((state: RootState) => state.playlist)
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<TabName>('discover')
  const [detailView, setDetailView] = useState<DetailView | null>(null)
  const [showNowPlaying, setShowNowPlaying] = useState(false)
  const [showLeaderboardMore, setShowLeaderboardMore] = useState(false)
  const [isDiscoverMoreVisible, setIsDiscoverMoreVisible] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [themeHydrated, setThemeHydrated] = useState(false)
  const [musicSourceHydrated, setMusicSourceHydrated] = useState(false)
  const [playlistHydrated, setPlaylistHydrated] = useState(false)
  const [isResolvingTrack, setIsResolvingTrack] = useState(() => playerController.isResolvingTrack())
  const [resolvingHint, setResolvingHint] = useState(() => playerController.getResolvingHint())
  const [isScrollAtTop, setIsScrollAtTop] = useState(true)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>('success')
  const [feedbackVisible, setFeedbackVisible] = useState(false)
  const overlayState: UIOverlay = detailView
    ? 'detail'
    : showNowPlaying
      ? 'nowPlaying'
      : showLeaderboardMore
        ? 'leaderboardMore'
        : 'none'
  const shouldHideTabBar = activeTab === 'discover' && (isDiscoverMoreVisible || showLeaderboardMore)
  const miniPlayerBottom = Math.max(insets.bottom, 16) + (
    shouldHideTabBar ? 10 : CAPSULE_BOTTOM_MARGIN + CAPSULE_TAB_HEIGHT + 10
  )
  const scrollTopFabBottom = miniPlayerBottom + 74
  const showScrollFab = overlayState === 'none' && !detailLoading && !isScrollAtTop
  const [fabMounted, setFabMounted] = useState(showScrollFab)
  const fabOpacityAnim = useRef(new Animated.Value(showScrollFab ? 1 : 0)).current
  const fabScaleAnim = useRef(new Animated.Value(showScrollFab ? 1 : 0.9)).current
  const fabTranslateYAnim = useRef(new Animated.Value(showScrollFab ? 0 : 16)).current
  const fabFloatAnim = useRef(new Animated.Value(0)).current
  const fabPressScaleAnim = useRef(new Animated.Value(1)).current
  const fabFloatLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const feedbackOpacityAnim = useRef(new Animated.Value(0)).current
  const feedbackTranslateYAnim = useRef(new Animated.Value(-10)).current
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getReadablePlayError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : '获取歌曲链接失败'
    if (/cannot post|405|404/i.test(message)) {
      return '音源接口地址不可用，请在“我的 > 自定义源管理”检查 API 地址是否正确'
    }
    return message
  }, [])

  const showFeedbackBanner = useCallback((text: string, tone: FeedbackTone = 'success') => {
    if (!text) return
    setFeedbackText(text)
    setFeedbackTone(tone)
    setFeedbackVisible(true)

    feedbackTimerRef.current && clearTimeout(feedbackTimerRef.current)
    feedbackOpacityAnim.stopAnimation()
    feedbackTranslateYAnim.stopAnimation()

    feedbackOpacityAnim.setValue(0)
    feedbackTranslateYAnim.setValue(-10)
    Animated.parallel([
      Animated.timing(feedbackOpacityAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(feedbackTranslateYAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()

    feedbackTimerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(feedbackOpacityAnim, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(feedbackTranslateYAnim, {
          toValue: -10,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setFeedbackVisible(false)
      })
      feedbackTimerRef.current = null
    }, 2200)
  }, [feedbackOpacityAnim, feedbackTranslateYAnim])

  const getTrackIdentity = useCallback((track: Track) => {
    return `${track.source || 'unknown'}::${track.id}`
  }, [])

  const ensureUniquePlaylistName = useCallback((baseName: string) => {
    const name = String(baseName || '').trim() || '未命名歌单'
    const names = new Set(playlistState.playlists.map((item) => item.name))
    if (!names.has(name)) return name
    let suffix = 2
    while (names.has(`${name} (${suffix})`)) {
      suffix += 1
    }
    return `${name} (${suffix})`
  }, [playlistState.playlists])

  const createImportedPlaylist = useCallback((params: {
    name: string
    description?: string
    coverUrl?: string
    tracks: Track[]
  }): Playlist => {
    const now = Date.now()
    const playlist: Playlist = {
      id: createPlaylistId(),
      name: ensureUniquePlaylistName(params.name),
      description: params.description,
      coverUrl: params.coverUrl,
      source: 'imported',
      tracks: params.tracks.map((track) => ({ ...track })),
      createdAt: now,
      updatedAt: now,
    }
    dispatch({ type: 'PLAYLIST_ADD', payload: playlist })
    if (!playlistState.currentPlaylistId) {
      dispatch({ type: 'PLAYLIST_SET_CURRENT', payload: playlist.id })
    }
    return playlist
  }, [dispatch, ensureUniquePlaylistName, playlistState.currentPlaylistId])

  const ensureTracksHaveConfiguredSource = useCallback((tracks: Track[]) => {
    if (!tracks.length) return false
    const missingPlatforms = Array.from(
      new Set(
        tracks
          .map((track) => String(track.source || 'kw').toLowerCase())
          .filter((platform) => !hasConfiguredJoySource(platform)),
      ),
    )
    if (!missingPlatforms.length) return true

    Alert.alert(
      '未配置可用音源',
      `当前曲目来源 ${missingPlatforms.map((item) => item.toUpperCase()).join(' / ')} 未配置可用音源，请先在“我的 > 自定义源管理”中导入并启用对应音源。`,
    )
    return false
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

        // 启动时恢复本地歌单配置。
        const playlistSettings = await loadPlaylistSettings()
        if (active) {
          dispatch({
            type: 'PLAYLIST_HYDRATE',
            payload: playlistSettings,
          })
          setPlaylistHydrated(true)
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
        void SplashScreen.hideAsync().catch(() => {
          // ignore startup race
        })
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

  useEffect(() => {
    if (!playlistHydrated) return
    savePlaylistSettings({
      playlists: playlistState.playlists,
      currentPlaylistId: playlistState.currentPlaylistId,
    })
  }, [playlistHydrated, playlistState.currentPlaylistId, playlistState.playlists])

  useEffect(() => {
    return subscribeScrollTopState((isAtTop) => {
      setIsScrollAtTop(isAtTop)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'discover' && isDiscoverMoreVisible) {
      setIsDiscoverMoreVisible(false)
    }
    if (activeTab !== 'discover' && showLeaderboardMore) {
      setShowLeaderboardMore(false)
    }
    setIsScrollAtTop(true)
  }, [activeTab, isDiscoverMoreVisible, showLeaderboardMore])

  const handleTrackPress = useCallback(async (track: Track) => {
    try {
      const currentTrack = playerController.getCurrentTrack()
      // 如果点击的是当前正在播放的歌曲，直接打开播放页继续播放。
      if (currentTrack?.id === track.id) {
        setShowNowPlaying(true)
        return
      }
      if (!ensureTracksHaveConfiguredSource([track])) {
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
  }, [ensureTracksHaveConfiguredSource, getReadablePlayError, syncPlayerStateToStore])

  const handleAppendTrackToPlaylist = useCallback((track: Track, playlistId: string) => {
    const targetPlaylist = playlistState.playlists.find((item) => item.id === playlistId)
    if (!targetPlaylist) {
      Alert.alert('添加失败', '目标歌单不存在或已删除')
      return
    }

    const exists = targetPlaylist.tracks.some((item) => getTrackIdentity(item) === getTrackIdentity(track))
    if (exists) {
      Alert.alert('已存在', `「${track.title}」已经在「${targetPlaylist.name}」中`)
      return
    }

    dispatch({
      type: 'PLAYLIST_UPDATE',
      payload: {
        ...targetPlaylist,
        tracks: [...targetPlaylist.tracks, { ...track }],
        updatedAt: Date.now(),
      },
    })
    showFeedbackBanner(`已添加到「${targetPlaylist.name}」`, 'success')
  }, [dispatch, getTrackIdentity, playlistState.playlists, showFeedbackBanner])

  const handleAddTrackToPlaylist = useCallback((track: Track) => {
    const customPlaylists = playlistState.playlists
    if (!customPlaylists.length) {
      Alert.alert('暂无自定义歌单', '请先在「歌单」页新建歌单后再添加歌曲')
      return
    }

    Alert.alert(
      '添加到歌单',
      `选择要添加「${track.title}」的歌单`,
      [
        ...customPlaylists.map((playlist) => ({
          text: playlist.name,
          onPress: () => {
            handleAppendTrackToPlaylist(track, playlist.id)
          },
        })),
        { text: '取消', style: 'cancel' as const },
      ],
    )
  }, [handleAppendTrackToPlaylist, playlistState.playlists])

  const handleRemoveTrackFromPlaylist = useCallback((track: Track, playlistId: string) => {
    const targetPlaylist = playlistState.playlists.find((item) => item.id === playlistId)
    if (!targetPlaylist) {
      Alert.alert('移除失败', '目标歌单不存在或已删除')
      return
    }

    const nextTracks = targetPlaylist.tracks.filter(
      (item) => getTrackIdentity(item) !== getTrackIdentity(track),
    )
    if (nextTracks.length === targetPlaylist.tracks.length) {
      Alert.alert('提示', '歌单中未找到该歌曲')
      return
    }

    dispatch({
      type: 'PLAYLIST_UPDATE',
      payload: {
        ...targetPlaylist,
        tracks: nextTracks,
        updatedAt: Date.now(),
      },
    })
    showFeedbackBanner(`已从「${targetPlaylist.name}」移除`, 'warning')
  }, [dispatch, getTrackIdentity, playlistState.playlists, showFeedbackBanner])

  const handleRemoveTrackFromQueue = useCallback(async(track: Track) => {
    try {
      const removed = await playerController.removeTrackFromQueue(track)
      if (!removed) {
        Alert.alert('提示', '当前播放列表中未找到该歌曲')
        return
      }
      const playbackStatus = await playerController.getPlaybackStatus()
      syncPlayerStateToStore(playbackStatus)
      showFeedbackBanner('已从播放队列移除', 'warning')
    } catch (error) {
      Alert.alert('移除失败', getReadablePlayError(error))
    }
  }, [getReadablePlayError, showFeedbackBanner, syncPlayerStateToStore])

  const handleTrackMorePress = useCallback((track: Track, context?: TrackMoreActionContext) => {
    const actionButtons: AlertButton[] = [
      {
        text: '下一首播放',
        onPress: () => {
          if (!ensureTracksHaveConfiguredSource([track])) {
            return
          }
          try {
            playerController.insertTrackNext(track)
            syncPlayerStateToStore()
            showFeedbackBanner('已加入下一首播放', 'success')
          } catch (error) {
            Alert.alert('操作失败', getReadablePlayError(error))
          }
        },
      },
      {
        text: '添加到歌单',
        onPress: () => {
          handleAddTrackToPlaylist(track)
        },
      },
    ]

    const playlistId = context?.playlistId
    if (playlistId) {
      actionButtons.push({
        text: '删除歌曲',
        style: 'destructive',
        onPress: () => {
          handleRemoveTrackFromPlaylist(track, playlistId)
        },
      })
    } else if (context?.playbackQueue) {
      actionButtons.push({
        text: '移除播放列表',
        style: 'destructive',
        onPress: () => {
          void handleRemoveTrackFromQueue(track)
        },
      })
    }
    actionButtons.push({ text: '取消', style: 'cancel' })

    Alert.alert(
      '歌曲操作',
      `${track.title} · ${track.artist}`,
      actionButtons,
    )
  }, [
    ensureTracksHaveConfiguredSource,
    getReadablePlayError,
    handleAddTrackToPlaylist,
    handleRemoveTrackFromPlaylist,
    handleRemoveTrackFromQueue,
    showFeedbackBanner,
    syncPlayerStateToStore,
  ])

  const loadSongListTracks = useCallback(async(source: SongListItem['source'], songListId: string) => {
    const firstPage = await getSongListDetail({
      source,
      id: songListId,
      page: 1,
      refresh: true,
    })
    const tracks: Track[] = [...firstPage.list]
    const pageLimit = Math.min(firstPage.maxPage, 10)
    for (let page = 2; page <= pageLimit; page += 1) {
      const detail = await getSongListDetail({
        source,
        id: songListId,
        page,
        refresh: true,
      })
      tracks.push(...detail.list)
    }
    return { firstPage, tracks, truncated: firstPage.maxPage > pageLimit }
  }, [])

  const loadLeaderboardTracks = useCallback(async(source: LeaderboardBoardItem['source'], boardId: string) => {
    const firstPage = await getLeaderboardDetail({
      source,
      boardId,
      page: 1,
      refresh: true,
    })
    const tracks: Track[] = [...firstPage.list]
    const pageLimit = Math.min(firstPage.maxPage, 6)
    for (let page = 2; page <= pageLimit; page += 1) {
      const detail = await getLeaderboardDetail({
        source,
        boardId,
        page,
        refresh: true,
      })
      tracks.push(...detail.list)
    }
    return { firstPage, tracks, truncated: firstPage.maxPage > pageLimit }
  }, [])

  const handleFavoriteSongList = useCallback(async(payload: {
    source: SongListItem['source']
    id: string
    name: string
    description?: string
    coverUrl?: string
  }) => {
    try {
      setDetailLoading(true)
      const { firstPage, tracks, truncated } = await loadSongListTracks(payload.source, payload.id)
      if (!tracks.length) {
        Alert.alert('收藏失败', `${payload.source.toUpperCase()} 歌单暂无可导入歌曲`)
        return
      }
      const created = createImportedPlaylist({
        name: firstPage.info.name || payload.name,
        description: firstPage.info.description || payload.description || `从${payload.source.toUpperCase()}网络歌单导入`,
        coverUrl: firstPage.info.coverUrl || payload.coverUrl,
        tracks,
      })
      showFeedbackBanner(
        truncated
          ? `已导入「${created.name}」（仅前 10 页）`
          : `已导入「${created.name}」`,
        'success',
      )
    } catch (error) {
      console.error('Favorite playlist error:', error)
      Alert.alert('收藏失败', `${payload.source.toUpperCase()} 歌单导入失败，请稍后重试。`)
    } finally {
      setDetailLoading(false)
    }
  }, [createImportedPlaylist, loadSongListTracks, showFeedbackBanner])

  const handleFavoriteLeaderboard = useCallback(async(payload: {
    source: LeaderboardBoardItem['source']
    id: string
    name: string
    coverUrl?: string
  }) => {
    try {
      setDetailLoading(true)
      const { tracks, truncated } = await loadLeaderboardTracks(payload.source, payload.id)
      if (!tracks.length) {
        Alert.alert('收藏失败', `${payload.source.toUpperCase()} 榜单暂无可导入歌曲`)
        return
      }
      const created = createImportedPlaylist({
        name: `${payload.name}（榜单）`,
        description: `从${payload.source.toUpperCase()}排行榜导入`,
        coverUrl: payload.coverUrl,
        tracks,
      })
      showFeedbackBanner(
        truncated
          ? `已导入「${created.name}」（仅前 6 页）`
          : `已导入「${created.name}」`,
        'success',
      )
    } catch (error) {
      console.error('Favorite leaderboard error:', error)
      Alert.alert('收藏失败', `${payload.source.toUpperCase()} 榜单导入失败，请稍后重试。`)
    } finally {
      setDetailLoading(false)
    }
  }, [createImportedPlaylist, loadLeaderboardTracks, showFeedbackBanner])

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
      const detailTracks = detail.list.map((track) => {
        if (track.coverUrl || track.picUrl || !board.coverUrl) return track
        return {
          ...track,
          coverUrl: board.coverUrl,
          picUrl: board.coverUrl,
        }
      })
      setShowLeaderboardMore(false)
      setDetailView({
        title: board.name,
        description: `${board.source.toUpperCase()} 榜单`,
        coverUrl: board.coverUrl,
        tracks: detailTracks,
        favoritePayload: {
          type: 'leaderboard',
          source: board.source,
          id: board.id,
        },
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
        favoritePayload: {
          type: 'playlist',
          source: playlist.source,
          id: playlist.id,
        },
      })
    } catch (error) {
      console.error('Load playlist detail error:', error)
      Alert.alert('加载失败', `${playlist.source.toUpperCase()} 歌单获取失败，请稍后重试或切换平台。`)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const handleDetailFavorite = useCallback(() => {
    if (!detailView?.favoritePayload) return
    if (detailView.favoritePayload.type === 'playlist') {
      void handleFavoriteSongList({
        source: detailView.favoritePayload.source,
        id: detailView.favoritePayload.id,
        name: detailView.title,
        description: detailView.description,
        coverUrl: detailView.coverUrl,
      })
      return
    }
    void handleFavoriteLeaderboard({
      source: detailView.favoritePayload.source,
      id: detailView.favoritePayload.id,
      name: detailView.title,
      coverUrl: detailView.coverUrl,
    })
  }, [detailView, handleFavoriteLeaderboard, handleFavoriteSongList])

  const playTracksAsQueue = useCallback(async(tracks: Track[]) => {
    if (!tracks.length) return
    if (!ensureTracksHaveConfiguredSource(tracks)) return
    try {
      await playerController.playFromPlaylist(tracks, 0, {
        autoPlay: true,
      })
      const playbackStatus = await playerController.getPlaybackStatus()
      syncPlayerStateToStore(playbackStatus)
      setShowNowPlaying(true)
    } catch (e) {
      console.error('Play all error:', e)
      Alert.alert('播放失败', getReadablePlayError(e))
    }
  }, [ensureTracksHaveConfiguredSource, getReadablePlayError, syncPlayerStateToStore])

  const replaceQueueAndPlayAll = useCallback(async() => {
    if (!detailView || detailView.tracks.length === 0) return
    await playTracksAsQueue(detailView.tracks)
  }, [detailView, playTracksAsQueue])

  const handlePlayAll = useCallback(() => {
    if (!detailView || detailView.tracks.length === 0) return
    if (!ensureTracksHaveConfiguredSource(detailView.tracks)) return

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
  }, [detailView, ensureTracksHaveConfiguredSource, replaceQueueAndPlayAll])

  const handlePlaylistPlayAll = useCallback((tracks: Track[]) => {
    if (!tracks.length) return
    if (!ensureTracksHaveConfiguredSource(tracks)) return
    const currentQueue = playerController.getPlaylist()
    if (!currentQueue.length) {
      void playTracksAsQueue(tracks)
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
            void playTracksAsQueue(tracks)
          },
        },
      ],
    )
  }, [ensureTracksHaveConfiguredSource, playTracksAsQueue])

  const handleDetailBack = useCallback(() => {
    setDetailView(null)
  }, [])

  const handleScrollToTopPress = useCallback(() => {
    emitScrollToTop()
  }, [])

  const handleTabChange = useCallback((nextTab: TabName) => {
    if (nextTab === activeTab) {
      emitScrollToTop()
      return
    }
    setActiveTab(nextTab)
  }, [activeTab])

  const handleFabPressIn = useCallback(() => {
    Animated.spring(fabPressScaleAnim, {
      toValue: 0.93,
      useNativeDriver: true,
      speed: 26,
      bounciness: 0,
    }).start()
  }, [fabPressScaleAnim])

  const handleFabPressOut = useCallback(() => {
    Animated.spring(fabPressScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 5,
    }).start()
  }, [fabPressScaleAnim])

  useEffect(() => {
    let active = true
    if (showScrollFab) {
      setFabMounted(true)
      Animated.parallel([
        Animated.timing(fabOpacityAnim, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(fabScaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 18,
          bounciness: 7,
        }),
        Animated.timing(fabTranslateYAnim, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start()
      return () => {
        active = false
      }
    }

    Animated.parallel([
      Animated.timing(fabOpacityAnim, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(fabScaleAnim, {
        toValue: 0.9,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(fabTranslateYAnim, {
        toValue: 14,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (active && finished) setFabMounted(false)
    })

    return () => {
      active = false
    }
  }, [fabOpacityAnim, fabScaleAnim, fabTranslateYAnim, showScrollFab])

  useEffect(() => {
    if (!showScrollFab) {
      fabFloatLoopRef.current?.stop()
      fabFloatLoopRef.current = null
      fabFloatAnim.setValue(0)
      return
    }

    fabFloatLoopRef.current?.stop()
    fabFloatAnim.setValue(0)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fabFloatAnim, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(fabFloatAnim, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    )
    fabFloatLoopRef.current = loop
    loop.start()

    return () => {
      loop.stop()
      if (fabFloatLoopRef.current === loop) {
        fabFloatLoopRef.current = null
      }
    }
  }, [fabFloatAnim, showScrollFab])

  const fabFloatOffset = fabFloatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -4],
  })

  const feedbackColor = feedbackTone === 'success'
    ? colors.accentGreen
    : feedbackTone === 'warning'
      ? colors.accentWarning
      : colors.danger

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Main content area */}
      <View style={styles.content}>
        <View style={[styles.tabPane, activeTab !== 'discover' && styles.tabPaneHidden]}>
          <DiscoverScreen
            onPlaylistPress={handlePlaylistPress}
            onMorePageVisibilityChange={setIsDiscoverMoreVisible}
            onLeaderboardPress={handleLeaderboardPress}
            onOpenLeaderboardMore={() => {
              setDetailView(null)
              setShowNowPlaying(false)
              setShowLeaderboardMore(true)
            }}
          />
        </View>
        <View style={[styles.tabPane, activeTab !== 'search' && styles.tabPaneHidden]}>
          <SearchScreen onTrackPress={handleTrackPress} onTrackMorePress={handleTrackMorePress} />
        </View>
        <View style={[styles.tabPane, activeTab !== 'playlist' && styles.tabPaneHidden]}>
          <PlaylistScreen
            onTrackPress={handleTrackPress}
            onTrackMorePress={handleTrackMorePress}
            onPlayAll={handlePlaylistPlayAll}
          />
        </View>
        <View style={[styles.tabPane, activeTab !== 'library' && styles.tabPaneHidden]}>
          <LibraryScreen onTrackPress={handleTrackPress} onTrackMorePress={handleTrackMorePress} />
        </View>
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
          onTrackMorePress={handleTrackMorePress}
          onPlayAll={handlePlayAll}
          onFavorite={detailView.favoritePayload ? handleDetailFavorite : undefined}
          favoriteDisabled={!detailView.favoritePayload}
        />
      )}

      {showLeaderboardMore && (
        <LeaderboardScreen
          onLeaderboardPress={handleLeaderboardPress}
          onBack={() => setShowLeaderboardMore(false)}
        />
      )}

      {detailLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.text }]}>加载中...</Text>
        </View>
      )}

      {feedbackVisible && (
        <Animated.View
          style={[
            styles.feedbackBannerWrap,
            {
              top: insets.top + 12,
              opacity: feedbackOpacityAnim,
              transform: [{ translateY: feedbackTranslateYAnim }],
            },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.feedbackBanner,
              {
                backgroundColor: colors.glassSurface,
                borderColor: colors.glassBorder,
              },
            ]}
          >
            <View style={[styles.feedbackDot, { backgroundColor: feedbackColor }]} />
            <Text style={[styles.feedbackText, { color: colors.text }]} numberOfLines={2}>
              {feedbackText}
            </Text>
          </View>
        </Animated.View>
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
          bottom: miniPlayerBottom,
        }}
      >
        <MiniPlayer onOpenPlayer={() => setShowNowPlaying(true)} />
      </View>

      {fabMounted && (
        <Animated.View
          style={[
            styles.scrollTopFabWrap,
            {
              right: 10,
              bottom: scrollTopFabBottom,
              opacity: fabOpacityAnim,
              transform: [
                { translateY: Animated.add(fabTranslateYAnim, fabFloatOffset) },
                { scale: Animated.multiply(fabScaleAnim, fabPressScaleAnim) },
              ],
            },
          ]}
        >
          <Pressable
            style={[
              styles.scrollTopFab,
              {
                width: SCROLL_FAB_SIZE,
                height: SCROLL_FAB_SIZE,
                borderColor: colors.separator,
              },
            ]}
            onPress={handleScrollToTopPress}
            onPressIn={handleFabPressIn}
            onPressOut={handleFabPressOut}
            accessibilityRole="button"
            accessibilityLabel="回到顶部"
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(92, 173, 255, 0.95)', 'rgba(38, 120, 230, 0.94)']
                  : ['rgba(140, 218, 255, 0.98)', 'rgba(60, 151, 255, 0.95)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.scrollTopFabInner}
            >
              <Ionicons name="chevron-up" size={20} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      {overlayState === 'nowPlaying' && (
        <NowPlaying onClose={() => setShowNowPlaying(false)} />
      )}

      {/* TabBar - fixed at bottom */}
      {!shouldHideTabBar && (
        <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
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
  tabPane: {
    flex: 1,
  },
  tabPaneHidden: {
    display: 'none',
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
  feedbackBannerWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 92,
    alignItems: 'center',
  },
  feedbackBanner: {
    maxWidth: 420,
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedbackDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  feedbackText: {
    flex: 1,
    fontSize: 13,
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
  scrollTopFabWrap: {
    position: 'absolute',
    zIndex: 95,
  },
  scrollTopFab: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#071B36',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 10,
  },
  scrollTopFabInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
