/**
 * 排行榜页面 - 展示各平台完整榜单。
 * 从 Discover 页面拆分而来，作为独立 tab 页。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, spacing, fontSize, borderRadius, BOTTOM_INSET } from '../../theme'
import SectionHeader from '../../components/common/SectionHeader'
import SourceChips from '../../components/common/SourceChips'
import LeaderboardSection from '../Discover/LeaderboardSection'
import { DiscoverSourceId, LeaderboardBoardItem } from '../../types/discover'
import {
  getLeaderboardBoards,
  getLeaderboardSetting,
  saveLeaderboardSetting,
} from '../../core/discover'

interface LeaderboardScreenProps {
  onLeaderboardPress?: (board: LeaderboardBoardItem) => void
}

/**
 * 渲染排行榜页面。
 * @param onLeaderboardPress - 点击排行榜卡片回调
 */
export default function LeaderboardScreen({
  onLeaderboardPress,
}: LeaderboardScreenProps) {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()

  const [topSource, setTopSource] = useState<DiscoverSourceId>('kw')
  const [boards, setBoards] = useState<LeaderboardBoardItem[]>([])
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  const [topLoading, setTopLoading] = useState(false)
  const [topError, setTopError] = useState<string | null>(null)

  /** 加载排行榜列表 */
  const loadLeaderboard = useCallback(async (source: DiscoverSourceId) => {
    try {
      setTopLoading(true)
      setTopError(null)
      const list = await getLeaderboardBoards(source)
      setBoards(list)
      setLastUpdatedAt(new Date())
      await saveLeaderboardSetting({
        source,
        boardId: list[0]?.id || '',
      })
    } catch (error: any) {
      console.error('[Leaderboard] Load leaderboard failed:', error?.message || error, error?.stack)
      setTopError(`${source.toUpperCase()} 排行榜加载失败，请稍后重试。`)
      setBoards([])
    } finally {
      setTopLoading(false)
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
  }, [topSource, loadLeaderboard])

  const handleRefresh = useCallback(() => {
    void loadLeaderboard(topSource)
  }, [topSource, loadLeaderboard])

  const sourceChips = useMemo(
    () => <SourceChips value={topSource} onChange={setTopSource} />,
    [topSource]
  )

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return '数据准备中'
    const hh = String(lastUpdatedAt.getHours()).padStart(2, '0')
    const mm = String(lastUpdatedAt.getMinutes()).padStart(2, '0')
    return `最近更新 ${hh}:${mm}`
  }, [lastUpdatedAt])

  const leaderboardStatusLabel = useMemo(() => {
    if (topLoading) return '正在同步榜单'
    if (topError) return '同步失败'
    return `已收录 ${boards.length} 个榜单`
  }, [topLoading, topError, boards.length])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
      >
        <View style={[styles.headerWrap, { paddingTop: insets.top + spacing.md }]}>
          <LinearGradient
            colors={
              isDark
                ? ['#1D2E4D', '#0B1220']
                : ['#E9F2FF', '#D9E8FF']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroHeader}>
              <View style={styles.heroTitleWrap}>
                <Text style={[styles.largeTitle, { color: isDark ? '#FFFFFF' : '#12203A' }]}>排行榜</Text>
                <Text style={[styles.heroSubtitle, { color: isDark ? 'rgba(255,255,255,0.78)' : '#3A4B69' }]}>
                  聚合平台热榜，实时发现正在上升的歌曲
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.refreshBtn,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(18,32,58,0.08)',
                  },
                ]}
                onPress={handleRefresh}
              >
                <Ionicons name="refresh" size={18} color={isDark ? '#FFFFFF' : '#12203A'} />
              </TouchableOpacity>
            </View>

            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(18,32,58,0.08)' },
                ]}
              >
                <Ionicons
                  name="musical-notes-outline"
                  size={14}
                  color={isDark ? '#FFFFFF' : '#12203A'}
                />
                <Text style={[styles.badgeText, { color: isDark ? '#FFFFFF' : '#12203A' }]}>
                  {topSource.toUpperCase()} 平台
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(18,32,58,0.08)' },
                ]}
              >
                <Ionicons name="podium-outline" size={14} color={isDark ? '#FFFFFF' : '#12203A'} />
                <Text style={[styles.badgeText, { color: isDark ? '#FFFFFF' : '#12203A' }]}>
                  {leaderboardStatusLabel}
                </Text>
              </View>
            </View>

            <Text style={[styles.updateText, { color: isDark ? 'rgba(255,255,255,0.72)' : '#3A4B69' }]}>
              {lastUpdatedLabel}
            </Text>
          </LinearGradient>
        </View>

        <View style={styles.sourceHeader}>
          <Text style={[styles.sourceHeaderText, { color: colors.textSecondary }]}>选择平台</Text>
        </View>
        {sourceChips}

        <SectionHeader title="全部榜单" />
        <LeaderboardSection
          boards={boards}
          loading={topLoading}
          error={topError}
          onLeaderboardPress={onLeaderboardPress}
        />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  heroCard: {
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroTitleWrap: {
    flex: 1,
  },
  largeTitle: {
    fontSize: fontSize.largeTitle,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.subhead,
    lineHeight: 20,
    fontWeight: '500',
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badgeText: {
    fontSize: fontSize.caption1,
    fontWeight: '700',
  },
  updateText: {
    fontSize: fontSize.caption1,
    fontWeight: '500',
  },
  sourceHeader: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  sourceHeaderText: {
    fontSize: fontSize.footnote,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
