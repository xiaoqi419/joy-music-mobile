/**
 * 发现页面 - 展示各平台推荐歌单。
 * 排行榜已拆分至独立 tab 页。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, spacing, fontSize, BOTTOM_INSET } from '../../theme'
import SectionHeader from '../../components/common/SectionHeader'
import SourceChips from '../../components/common/SourceChips'
import PlaylistSection from './PlaylistSection'
import LeaderboardSection from './LeaderboardSection'
import SongListMorePage from './SongListMorePage'
import { DiscoverSourceId, LeaderboardBoardItem, SongListItem } from '../../types/discover'
import {
  getLeaderboardBoards,
  getLeaderboardSetting,
  saveLeaderboardSetting,
  getSongListSortList,
  getSongListPage,
  getSongListSetting,
  saveSongListSetting,
} from '../../core/discover'
import { emitScrollTopState, subscribeScrollToTop } from '../../core/ui/scrollToTopBus'

interface DiscoverScreenProps {
  onPlaylistPress?: (playlist: SongListItem) => void
  onLeaderboardPress?: (board: LeaderboardBoardItem) => void
  onOpenLeaderboardMore?: () => void
  onMorePageVisibilityChange?: (visible: boolean) => void
}

/**
 * 渲染发现页面（推荐歌单）。
 * @param onPlaylistPress - 点击歌单回调
 */
export default function DiscoverScreen({
  onPlaylistPress,
  onLeaderboardPress,
  onOpenLeaderboardMore,
  onMorePageVisibilityChange,
}: DiscoverScreenProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  const [songListSource, setSongListSource] = useState<DiscoverSourceId>('kw')
  const [songListSort, setSongListSort] = useState('new')
  const [songListTag, setSongListTag] = useState('')
  const [playlists, setPlaylists] = useState<SongListItem[]>([])
  const [leaderboards, setLeaderboards] = useState<LeaderboardBoardItem[]>([])
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showSongListMore, setShowSongListMore] = useState(false)
  const mainScrollRef = useRef<ScrollView | null>(null)

  useEffect(() => {
    onMorePageVisibilityChange?.(showSongListMore)
  }, [showSongListMore, onMorePageVisibilityChange])

  useEffect(() => {
    return () => {
      onMorePageVisibilityChange?.(false)
    }
  }, [onMorePageVisibilityChange])

  useEffect(() => {
    return subscribeScrollToTop(() => {
      if (showSongListMore) return
      mainScrollRef.current?.scrollTo({ y: 0, animated: true })
    })
  }, [showSongListMore])

  /** 加载歌单列表 */
  const loadSongList = useCallback(
    async (source: DiscoverSourceId, sortId: string, tagId: string, refresh = false) => {
      try {
        if (!refresh) setPlaylistLoading(true)
        setPlaylistError(null)
        console.log('[Discover] loadSongList start, source:', source, 'sortId:', sortId, 'tagId:', tagId)
        const page = await getSongListPage({
          source,
          sortId,
          tagId,
          page: 1,
          refresh,
        })
        console.log('[Discover] loadSongList result, list count:', page.list.length, 'total:', page.total)
        setPlaylists(page.list)
        await saveSongListSetting({ source, sortId, tagId })
      } catch (error: any) {
        console.error('[Discover] Load playlists failed:', error?.message || error, error?.stack)
        setPlaylistError(`${source.toUpperCase()} 歌单加载失败，可切换平台重试。`)
        setPlaylists([])
      } finally {
        setPlaylistLoading(false)
        setRefreshing(false)
      }
    },
    []
  )

  const loadLeaderboard = useCallback(async(source: DiscoverSourceId) => {
    try {
      setLeaderboardLoading(true)
      setLeaderboardError(null)
      const list = await getLeaderboardBoards(source)
      setLeaderboards(list.slice(0, 6))
      await saveLeaderboardSetting({
        source,
        boardId: list[0]?.id || '',
      })
    } catch (error: any) {
      console.error('[Discover] Load leaderboard failed:', error?.message || error, error?.stack)
      setLeaderboards([])
      setLeaderboardError(`${source.toUpperCase()} 榜单加载失败，请稍后重试。`)
    } finally {
      setLeaderboardLoading(false)
    }
  }, [])

  /** 初始化时读取上次保存的歌单设置 */
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const setting = await getSongListSetting()
        const leaderboardSetting = await getLeaderboardSetting()
        if (!active) return
        setSongListSource(setting.source)
        setSongListSort(setting.sortId || 'new')
        setSongListTag(setting.tagId || '')
        if (leaderboardSetting.source && leaderboardSetting.source !== setting.source) {
          setSongListSource(leaderboardSetting.source)
        }
      } catch (error) {
        console.error('[Discover] Load settings failed:', error)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  /** 歌单设置变化时重新加载 */
  useEffect(() => {
    void loadSongList(songListSource, songListSort, songListTag)
  }, [songListSource, songListSort, songListTag, loadSongList])

  useEffect(() => {
    void loadLeaderboard(songListSource)
  }, [songListSource, loadLeaderboard])

  const handleSongListSourceChange = useCallback((source: DiscoverSourceId) => {
    setSongListSource(source)
    const sorts = getSongListSortList(source)
    setSongListSort(sorts[0]?.id || 'new')
    setSongListTag('')
    void saveSongListSetting({
      source,
      sortId: sorts[0]?.id || 'new',
      tagId: '',
      tagName: '',
    })
  }, [])

  const handleMoreFiltersChange = useCallback((value: { sortId: string; tagId: string; tagName: string }) => {
    setSongListSort(prev => (prev === value.sortId ? prev : value.sortId))
    setSongListTag(prev => (prev === value.tagId ? prev : value.tagId))
    void saveSongListSetting({
      source: songListSource,
      sortId: value.sortId,
      tagId: value.tagId,
      tagName: value.tagName,
    })
  }, [songListSource])

  const sourceChips = useMemo(
    () => <SourceChips value={songListSource} onChange={handleSongListSourceChange} />,
    [songListSource, handleSongListSourceChange]
  )

  /** 下拉刷新（跳过缓存） */
  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    void loadSongList(songListSource, songListSort, songListTag, true)
    void loadLeaderboard(songListSource)
  }, [songListSource, songListSort, songListTag, loadSongList, loadLeaderboard])

  const handleMainScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    emitScrollTopState(event.nativeEvent.contentOffset.y <= 4)
  }, [])

  useEffect(() => {
    if (showSongListMore) {
      emitScrollTopState(true)
    }
  }, [showSongListMore])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {showSongListMore ? (
        <SongListMorePage
          source={songListSource}
          sortId={songListSort}
          tagId={songListTag}
          onBack={() => setShowSongListMore(false)}
          onSourceChange={handleSongListSourceChange}
          onFiltersChange={handleMoreFiltersChange}
          onPlaylistPress={onPlaylistPress}
        />
      ) : (
        <ScrollView
          ref={mainScrollRef}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
            <Text style={[styles.largeTitle, { color: colors.text }]}>发现音乐</Text>
          </View>

          <SectionHeader title="推荐歌单" showMore onMorePress={() => setShowSongListMore(true)} />
          {sourceChips}

          <SectionHeader
            title="热门榜单"
            showMore={Boolean(onOpenLeaderboardMore)}
            onMorePress={onOpenLeaderboardMore}
          />
          <LeaderboardSection
            boards={leaderboards}
            loading={leaderboardLoading}
            error={leaderboardError}
            onLeaderboardPress={onLeaderboardPress}
          />

          {/* 刷新提示横幅 */}
          {refreshing && (
            <View style={[styles.refreshBanner, { backgroundColor: colors.accentLight }]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.refreshText, { color: colors.accent }]}>正在刷新歌单…</Text>
            </View>
          )}

          <View style={{ opacity: refreshing ? 0.5 : 1 }}>
            <PlaylistSection
              playlists={playlists}
              loading={playlistLoading}
              error={playlistError}
              onPlaylistPress={onPlaylistPress}
            />
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  largeTitle: {
    fontSize: fontSize.largeTitle,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  refreshBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 10,
  },
  refreshText: {
    fontSize: fontSize.footnote,
    fontWeight: '600',
  },
})
