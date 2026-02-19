/**
 * 排行榜纵向列表区。
 * 目标：一次性展示更多榜单，避免横向滑动成本过高。
 */

import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, spacing, fontSize, borderRadius } from '../../theme'
import { LeaderboardBoardItem } from '../../types/discover'

interface LeaderboardSectionProps {
  boards: LeaderboardBoardItem[]
  loading?: boolean
  error?: string | null
  onLeaderboardPress?: (board: LeaderboardBoardItem) => void
}

export default function LeaderboardSection({
  boards,
  loading = false,
  error = null,
  onLeaderboardPress,
}: LeaderboardSectionProps) {
  const { colors } = useTheme()

  if (loading) {
    return (
      <View style={styles.stateWrap}>
        <Text style={[styles.stateText, { color: colors.textSecondary }]}>正在加载排行榜...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.stateWrap}>
        <Text style={[styles.stateText, { color: colors.textSecondary }]}>{error}</Text>
      </View>
    )
  }

  if (boards.length === 0) {
    return (
      <View style={styles.stateWrap}>
        <Text style={[styles.stateText, { color: colors.textSecondary }]}>当前平台暂无可用榜单</Text>
      </View>
    )
  }

  return (
    <View style={styles.listWrap}>
      {boards.map((board, index) => (
        <TouchableOpacity
          key={board.id}
          activeOpacity={0.82}
          onPress={() => onLeaderboardPress?.(board)}
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.separator,
            },
          ]}
        >
          {board.coverUrl ? (
            <Image
              source={{ uri: board.coverUrl }}
              style={styles.cover}
            />
          ) : (
            <View
              style={[
                styles.coverFallback,
                { backgroundColor: colors.accentLight },
              ]}
            >
              <Ionicons name="musical-notes-outline" size={18} color={colors.accent} />
            </View>
          )}

          <View style={styles.content}>
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.rankBadge,
                  {
                    backgroundColor: index < 3 ? colors.accentLight : colors.surfaceSecondary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rankText,
                    { color: index < 3 ? colors.accent : colors.textSecondary },
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {board.name}
              </Text>
            </View>

            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {board.updateFrequency || `${board.source.toUpperCase()} 平台榜单`}
            </Text>
            <Text style={[styles.meta, { color: colors.textTertiary }]} numberOfLines={1}>
              榜单 ID：{board.bangId}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  listWrap: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cover: {
    width: 54,
    height: 54,
    borderRadius: 10,
  },
  coverFallback: {
    width: 54,
    height: 54,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rankText: {
    fontSize: fontSize.caption2,
    fontWeight: '700',
  },
  title: {
    flex: 1,
    fontSize: fontSize.callout,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: fontSize.caption1,
    fontWeight: '500',
  },
  meta: {
    fontSize: fontSize.caption2,
  },
  stateWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  stateText: {
    fontSize: fontSize.subhead,
  },
})
