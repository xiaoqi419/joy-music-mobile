/**
 * 发现页面 - 展示各平台推荐歌单。
 * 排行榜已拆分至独立 tab 页。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, spacing, fontSize, BOTTOM_INSET } from '../../theme'
import SectionHeader from '../../components/common/SectionHeader'
import SourceChips from '../../components/common/SourceChips'
import PlaylistSection from './PlaylistSection'
import { DiscoverSourceId, SongListItem } from '../../types/discover'
import {
  getSongListPage,
  getSongListSetting,
  saveSongListSetting,
} from '../../core/discover'

interface DiscoverScreenProps {
  onPlaylistPress?: (playlist: SongListItem) => void
}

/**
 * 渲染发现页面（推荐歌单）。
 * @param onPlaylistPress - 点击歌单回调
 */
export default function DiscoverScreen({
  onPlaylistPress,
}: DiscoverScreenProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  const [songListSource, setSongListSource] = useState<DiscoverSourceId>('kw')
  const [songListSort, setSongListSort] = useState('new')
  const [songListTag, setSongListTag] = useState('')
  const [playlists, setPlaylists] = useState<SongListItem[]>([])
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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

  /** 初始化时读取上次保存的歌单设置 */
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const setting = await getSongListSetting()
        if (!active) return
        setSongListSource(setting.source)
        setSongListSort(setting.sortId || 'new')
        setSongListTag(setting.tagId || '')
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

  const sourceChips = useMemo(
    () => <SourceChips value={songListSource} onChange={setSongListSource} />,
    [songListSource]
  )

  /** 下拉刷新（跳过缓存） */
  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    void loadSongList(songListSource, songListSort, songListTag, true)
  }, [songListSource, songListSort, songListTag, loadSongList])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
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

        <SectionHeader title="推荐歌单" showMore onMorePress={() => {}} />
        {sourceChips}

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
