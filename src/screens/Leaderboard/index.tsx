/**
 * 排行榜页面 - 展示各平台排行榜卡片与热门歌曲。
 * 从 Discover 页面拆分而来，作为独立 tab 页。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, spacing, fontSize, BOTTOM_INSET } from '../../theme'
import SectionHeader from '../../components/common/SectionHeader'
import SourceChips from '../../components/common/SourceChips'
import LeaderboardSection from '../Discover/LeaderboardSection'
import HotTracksSection from '../Discover/HotTracksSection'
import { Track } from '../../types/music'
import { DiscoverSourceId, LeaderboardBoardItem } from '../../types/discover'
import {
  getHotTracksFromTop,
  getLeaderboardBoards,
  getLeaderboardSetting,
  saveLeaderboardSetting,
} from '../../core/discover'

interface LeaderboardScreenProps {
  onLeaderboardPress?: (board: LeaderboardBoardItem) => void
  onTrackPress?: (track: Track) => void
}

/**
 * 渲染排行榜页面。
 * @param onLeaderboardPress - 点击排行榜卡片回调
 * @param onTrackPress - 点击热门歌曲回调
 */
export default function LeaderboardScreen({
  onLeaderboardPress,
  onTrackPress,
}: LeaderboardScreenProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  const [topSource, setTopSource] = useState<DiscoverSourceId>('kw')
  const [boards, setBoards] = useState<LeaderboardBoardItem[]>([])
  const [hotTracks, setHotTracks] = useState<Track[]>([])

  const [topLoading, setTopLoading] = useState(false)
  const [hotLoading, setHotLoading] = useState(false)
  const [topError, setTopError] = useState<string | null>(null)
  const [hotError, setHotError] = useState<string | null>(null)

  /** 加载排行榜列表 */
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
      console.error('[Leaderboard] Load leaderboard failed:', error)
      setTopError(`${source.toUpperCase()} 排行榜加载失败，可切换平台重试。`)
      setBoards([])
    } finally {
      setTopLoading(false)
    }
  }, [])

  /** 加载热门歌曲 */
  const loadHotTracks = useCallback(async (source: DiscoverSourceId) => {
    try {
      setHotLoading(true)
      setHotError(null)
      const list = await getHotTracksFromTop(source)
      setHotTracks(list)
    } catch (error) {
      console.error('[Leaderboard] Load hot tracks failed:', error)
      setHotError(`${source.toUpperCase()} 热门歌曲加载失败，可切换平台重试。`)
      setHotTracks([])
    } finally {
      setHotLoading(false)
    }
  }, [])

  /** 初始化时读取上次保存的音源 */
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const setting = await getLeaderboardSetting()
        if (!active) return
        setTopSource(setting.source)
      } catch (error) {
        console.error('[Leaderboard] Load setting failed:', error)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  /** 音源变化时重新加载数据 */
  useEffect(() => {
    void loadLeaderboard(topSource)
    void loadHotTracks(topSource)
  }, [topSource, loadLeaderboard, loadHotTracks])

  const sourceChips = useMemo(
    () => <SourceChips value={topSource} onChange={setTopSource} />,
    [topSource]
  )

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={[styles.largeTitle, { color: colors.text }]}>排行榜</Text>
        </View>

        {sourceChips}

        <SectionHeader title="热门榜单" />
        <LeaderboardSection
          boards={boards}
          loading={topLoading}
          error={topError}
          onLeaderboardPress={onLeaderboardPress}
        />

        <SectionHeader title="热门歌曲" />
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
})
