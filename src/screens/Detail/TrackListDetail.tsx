/**
 * Track list detail screen for leaderboard/playlist detail views
 */

import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Dimensions,
  Animated,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, spacing, fontSize, borderRadius, BOTTOM_INSET } from '../../theme'
import TrackListItem from '../../components/common/TrackListItem'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import { useSwipeBack } from '../../hooks/useSwipeBack'
import { Track, type TrackMoreActionHandler } from '../../types/music'

const SCREEN_WIDTH = Dimensions.get('window').width
const HEADER_HEIGHT = 280

interface TrackListDetailProps {
  title: string
  description?: string
  coverUrl?: string
  gradientColors?: [string, string]
  tracks: Track[]
  onBack: () => void
  onTrackPress?: (track: Track) => void
  onTrackMorePress?: TrackMoreActionHandler
  onPlayAll?: () => void
}

export default function TrackListDetail({
  title,
  description,
  coverUrl,
  gradientColors = ['#1C1C1E', '#000000'],
  tracks,
  onBack,
  onTrackPress,
  onTrackMorePress,
  onPlayAll,
}: TrackListDetailProps) {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const { isPlaying, currentTrack } = usePlayerStatus()
  const { panX, panHandlers } = useSwipeBack(onBack)

  const renderHeader = () => (
    <View>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.headerGradient, { paddingTop: insets.top }]}
      >
        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Cover and info */}
        <View style={styles.headerContent}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.headerCover} />
          ) : (
            <View style={[styles.headerCover, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Ionicons name="musical-notes" size={40} color="rgba(255,255,255,0.6)" />
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
            {description && (
              <Text style={styles.headerDescription} numberOfLines={2}>
                {description}
              </Text>
            )}
            <Text style={styles.headerCount}>{tracks.length} 首歌曲</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Play all button */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.playAllButton, { backgroundColor: colors.accent }]}
          onPress={onPlayAll}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={20} color="#FFFFFF" />
          <Text style={styles.playAllText}>播放全部</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          transform: [{ translateX: panX }],
        },
      ]}
      {...panHandlers}
    >
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
        renderItem={({ item, index }) => (
          <TrackListItem
            track={item}
            index={index}
            showIndex
            isCurrentTrack={currentTrack?.id === item.id}
            isPlaying={isPlaying && currentTrack?.id === item.id}
            onPress={onTrackPress}
            onMorePress={onTrackMorePress}
          />
        )}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  headerGradient: {
    height: HEADER_HEIGHT,
    padding: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerCover: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.title2,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerDescription: {
    fontSize: fontSize.footnote,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },
  headerCount: {
    fontSize: fontSize.caption1,
    color: 'rgba(255,255,255,0.5)',
    marginTop: spacing.xs,
  },
  actionRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  playAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: borderRadius.md,
  },
  playAllText: {
    fontSize: fontSize.callout,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
