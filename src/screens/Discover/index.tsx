/**
 * Discover screen - main discovery page with leaderboards, playlists, and hot tracks
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, spacing, fontSize, BOTTOM_INSET, borderRadius } from '../../theme'
import SectionHeader from '../../components/common/SectionHeader'
import LeaderboardSection from './LeaderboardSection'
import PlaylistSection from './PlaylistSection'
import HotTracksSection from './HotTracksSection'
import { Track } from '../../types/music'
import {
  DiscoverSourceId,
  LeaderboardBoardItem,
  SongListItem,
} from '../../types/discover'
import {
  discoverSourceList,
  getHotTracksFromTop,
  getLeaderboardBoards,
  getLeaderboardSetting,
  getSongListPage,
  getSongListSetting,
  saveLeaderboardSetting,
  saveSongListSetting,
} from '../../core/discover'

interface DiscoverScreenProps {
  onLeaderboardPress?: (board: LeaderboardBoardItem) => void
  onPlaylistPress?: (playlist: SongListItem) => void
  onTrackPress?: (track: Track) => void
}

function SourceChips({
  value,
  onChange,
}: {
  value: DiscoverSourceId
  onChange: (source: DiscoverSourceId) => void
}) {
  const { colors } = useTheme()
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsWrap}
    >
      {discoverSourceList.map(item => {
        const active = item.id === value
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.accentLight : colors.surface,
                borderColor: active ? colors.accent : colors.separator,
              },
            ]}
            onPress={() => onChange(item.id)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? colors.accent : colors.textSecondary },
              ]}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

export default function DiscoverScreen({
  onLeaderboardPress,
  onPlaylistPress,
  onTrackPress,
}: DiscoverScreenProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  const [topSource, setTopSource] = useState<DiscoverSourceId>('kw')
  const [songListSource, setSongListSource] = useState<DiscoverSourceId>('kw')
  const [songListSort, setSongListSort] = useState('new')
  const [songListTag, setSongListTag] = useState('')

  const [boards, setBoards] = useState<LeaderboardBoardItem[]>([])
  const [playlists, setPlaylists] = useState<SongListItem[]>([])
  const [hotTracks, setHotTracks] = useState<Track[]>([])

  const [topLoading, setTopLoading] = useState(false)
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [hotLoading, setHotLoading] = useState(false)
  const [topError, setTopError] = useState<string | null>(null)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [hotError, setHotError] = useState<string | null>(null)

  const loadLeaderboard = useCallback(async (source: DiscoverSourceId) => {
    try {
      setTopLoading(true)
      setTopError(null)
      const list = await getLeaderboardBoards(source)
      setBoards(list)
      await saveLeaderboardSetting({
        source,
        boardId: list[0]?.id || '',
      })
    } catch (error) {
      console.error('[Discover] Load leaderboard failed:', error)
      setTopError(`${source.toUpperCase()} 排行榜加载失败，可切换平台重试。`)
      setBoards([])
    } finally {
      setTopLoading(false)
    }
  }, [])

  const loadHotTracks = useCallback(async (source: DiscoverSourceId) => {
    try {
      setHotLoading(true)
      setHotError(null)
      const list = await getHotTracksFromTop(source)
      setHotTracks(list)
    } catch (error) {
      console.error('[Discover] Load hot tracks failed:', error)
      setHotError(`${source.toUpperCase()} 热门歌曲加载失败，可切换平台重试。`)
      setHotTracks([])
    } finally {
      setHotLoading(false)
    }
  }, [])

  const loadSongList = useCallback(
    async (source: DiscoverSourceId, sortId: string, tagId: string) => {
      try {
        setPlaylistLoading(true)
        setPlaylistError(null)
        const page = await getSongListPage({
          source,
          sortId,
          tagId,
          page: 1,
        })
        setPlaylists(page.list)
        await saveSongListSetting({
          source,
          sortId,
          tagId,
        })
      } catch (error) {
        console.error('[Discover] Load playlists failed:', error)
        setPlaylistError(`${source.toUpperCase()} 歌单加载失败，可切换平台重试。`)
        setPlaylists([])
      } finally {
        setPlaylistLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    let active = true
    ;(async() => {
      try {
        const [topSetting, songSetting] = await Promise.all([
          getLeaderboardSetting(),
          getSongListSetting(),
        ])
        if (!active) return
        setTopSource(topSetting.source)
        setSongListSource(songSetting.source)
        setSongListSort(songSetting.sortId || 'new')
        setSongListTag(songSetting.tagId || '')
      } catch (error) {
        console.error('[Discover] Load settings failed:', error)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    void loadLeaderboard(topSource)
    void loadHotTracks(topSource)
  }, [topSource, loadLeaderboard, loadHotTracks])

  useEffect(() => {
    void loadSongList(songListSource, songListSort, songListTag)
  }, [songListSource, songListSort, songListTag, loadSongList])

  const leaderboardHeader = useMemo(
    () => <SourceChips value={topSource} onChange={setTopSource} />,
    [topSource]
  )
  const songListHeader = useMemo(
    () => <SourceChips value={songListSource} onChange={setSongListSource} />,
    [songListSource]
  )

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={[styles.largeTitle, { color: colors.text }]}>发现音乐</Text>
        </View>

        <SectionHeader title="排行榜" />
        {leaderboardHeader}
        <LeaderboardSection
          boards={boards}
          loading={topLoading}
          error={topError}
          onLeaderboardPress={onLeaderboardPress}
        />

        <SectionHeader title="推荐歌单" showMore onMorePress={() => {}} />
        {songListHeader}
        <PlaylistSection
          playlists={playlists}
          loading={playlistLoading}
          error={playlistError}
          onPlaylistPress={onPlaylistPress}
        />

        <SectionHeader title="热门歌曲" showMore onMorePress={() => {}} />
        <HotTracksSection
          tracks={hotTracks}
          loading={hotLoading}
          error={hotError}
          onTrackPress={onTrackPress}
        />
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
  chipsWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
})
