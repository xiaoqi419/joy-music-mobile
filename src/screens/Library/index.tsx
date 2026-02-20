/**
 * Library screen - user's music collection
 */

import React, { useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, spacing, fontSize, borderRadius, BOTTOM_INSET } from '../../theme'
import TrackListItem from '../../components/common/TrackListItem'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '../../store'
import { ThemeMode, Track } from '../../types/music'

interface LibraryScreenProps {
  onTrackPress?: (track: Track) => void
}

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  count?: number
  color: string
  onPress?: () => void
}

interface ThemeOptionItem {
  value: ThemeMode
  label: string
  description: string
  icon: keyof typeof Ionicons.glyphMap
}

const THEME_OPTIONS: ThemeOptionItem[] = [
  {
    value: 'system',
    label: '跟随系统',
    description: '自动切换浅色与深色',
    icon: 'phone-portrait-outline',
  },
  {
    value: 'light',
    label: '浅色',
    description: '始终使用浅色界面',
    icon: 'sunny-outline',
  },
  {
    value: 'dark',
    label: '深色',
    description: '始终使用深色界面',
    icon: 'moon-outline',
  },
]

function MenuItem({ icon, label, count, color, onPress }: MenuItemProps) {
  const { colors } = useTheme()

  return (
    <TouchableOpacity
      style={[styles.menuItem, { borderBottomColor: colors.separator }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.menuIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={20} color="#FFFFFF" />
      </View>
      <Text style={[styles.menuLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.menuRight}>
        {count !== undefined && (
          <Text style={[styles.menuCount, { color: colors.textTertiary }]}>{count}</Text>
        )}
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  )
}

export default function LibraryScreen({ onTrackPress }: LibraryScreenProps) {
  const { colors } = useTheme()
  const dispatch = useDispatch()
  const insets = useSafeAreaInsets()
  const { isPlaying, currentTrack } = usePlayerStatus()
  const playerState = useSelector((state: RootState) => state.player)
  const themeMode = useSelector((state: RootState) => state.config.theme)

  const handleThemeChange = useCallback((mode: ThemeMode) => {
    dispatch({
      type: 'CONFIG_SET_THEME',
      payload: mode,
    })
  }, [dispatch])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
      >
        {/* Large title */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={[styles.largeTitle, { color: colors.text }]}>我的</Text>
        </View>

        <View style={styles.appearanceSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>外观</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>主题</Text>
          </View>
          <View style={[styles.appearanceCard, { backgroundColor: colors.surface }]}>
            {THEME_OPTIONS.map((option, index) => {
              const isSelected = themeMode === option.value
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.themeItem,
                    index < THEME_OPTIONS.length - 1
                      ? { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }
                      : null,
                    isSelected
                      ? { backgroundColor: colors.accentLight }
                      : null,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleThemeChange(option.value)}
                >
                  <View
                    style={[
                      styles.themeIconWrap,
                      { backgroundColor: isSelected ? colors.accent : colors.surfaceSecondary },
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={16}
                      color={isSelected ? '#FFFFFF' : colors.textSecondary}
                    />
                  </View>
                  <View style={styles.themeMeta}>
                    <Text style={[styles.themeLabel, { color: colors.text }]}>{option.label}</Text>
                    <Text style={[styles.themeDesc, { color: colors.textSecondary }]}>{option.description}</Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Menu items */}
        <View style={[styles.menuContainer, { backgroundColor: colors.surface }]}>
          <MenuItem
            icon="time"
            label="最近播放"
            count={playerState.playlist.length}
            color="#FF9500"
          />
          <MenuItem
            icon="heart"
            label="我喜欢的"
            count={0}
            color="#FF2D55"
          />
          <MenuItem
            icon="download"
            label="本地音乐"
            count={0}
            color="#5856D6"
          />
        </View>

        {/* Current playlist */}
        {playerState.playlist.length > 0 && (
          <View style={styles.playlistSection}>
            <View style={styles.playlistHeader}>
              <Text style={[styles.playlistTitle, { color: colors.text }]}>
                当前播放列表
              </Text>
              <Text style={[styles.playlistCount, { color: colors.textSecondary }]}>
                {playerState.playlist.length} 首
              </Text>
            </View>
            <View style={[styles.playlistContainer, { backgroundColor: colors.surface }]}>
              {playerState.playlist.map((track, index) => (
                <TrackListItem
                  key={track.id}
                  track={track}
                  index={index}
                  showIndex
                  isCurrentTrack={currentTrack?.id === track.id}
                  isPlaying={isPlaying && currentTrack?.id === track.id}
                  onPress={onTrackPress}
                />
              ))}
            </View>
          </View>
        )}

        {/* Empty state when no playlist */}
        {playerState.playlist.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes-outline" size={56} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              还没有音乐
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
              去发现页面探索更多音乐吧
            </Text>
          </View>
        )}
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
    paddingBottom: spacing.md,
  },
  largeTitle: {
    fontSize: fontSize.largeTitle,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  appearanceSection: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.headline,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: fontSize.footnote,
    fontWeight: '500',
  },
  appearanceCard: {
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  themeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  themeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeMeta: {
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  themeLabel: {
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  themeDesc: {
    marginTop: 2,
    fontSize: fontSize.caption1,
  },
  menuContainer: {
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: '500',
    marginLeft: spacing.md,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  menuCount: {
    fontSize: fontSize.subhead,
  },
  playlistSection: {
    marginTop: spacing.lg,
  },
  playlistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  playlistTitle: {
    fontSize: fontSize.headline,
    fontWeight: '600',
  },
  playlistCount: {
    fontSize: fontSize.footnote,
  },
  playlistContainer: {
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.headline,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: fontSize.subhead,
  },
})
