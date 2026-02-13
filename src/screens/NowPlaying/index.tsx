import React, { useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, spacing, fontSize, borderRadius } from '../../theme'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import { playerController } from '../../core/player'

interface NowPlayingProps {
  onClose: () => void
}

function formatMs(ms: number): string {
  const totalSec = Math.floor((ms || 0) / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function NowPlaying({ onClose }: NowPlayingProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { currentTrack, isPlaying, position, duration } = usePlayerStatus()

  const progress = useMemo(() => {
    if (!duration) return 0
    return Math.max(0, Math.min(1, position / duration))
  }, [position, duration])

  if (!currentTrack) return null

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
          <Ionicons name="chevron-down" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>Now Playing</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.body}>
        <View style={[styles.coverWrap, { backgroundColor: colors.surfaceElevated }]}>
          {currentTrack.coverUrl ? (
            <Image source={{ uri: currentTrack.coverUrl }} style={styles.cover} />
          ) : (
            <Ionicons name="musical-notes" size={84} color={colors.textTertiary} />
          )}
        </View>

        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, { color: colors.text }]} numberOfLines={2}>
            {currentTrack.title}
          </Text>
          <Text style={[styles.trackArtist, { color: colors.textSecondary }]} numberOfLines={1}>
            {currentTrack.artist}
          </Text>
        </View>

        <View style={styles.seekWrap}>
          <Slider
            value={progress}
            minimumValue={0}
            maximumValue={1}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.separator}
            thumbTintColor={colors.accent}
            onSlidingComplete={(value) => {
              const nextMs = Math.floor((duration || 0) * value)
              void playerController.seek(nextMs)
            }}
          />
          <View style={styles.timeRow}>
            <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatMs(position)}</Text>
            <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatMs(duration)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => {
              void playerController.playPrevious()
            }}
          >
            <Ionicons name="play-skip-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.playButton, { backgroundColor: colors.accent }]}
            onPress={() => {
              void (isPlaying ? playerController.pause() : playerController.resume())
            }}
          >
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={34} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => {
              void playerController.playNext()
            }}
          >
            <Ionicons name="play-skip-forward" size={28} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.subhead,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    justifyContent: 'space-evenly',
  },
  coverWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  trackInfo: {
    gap: spacing.xs,
  },
  trackTitle: {
    fontSize: fontSize.title2,
    fontWeight: '700',
  },
  trackArtist: {
    fontSize: fontSize.body,
  },
  seekWrap: {
    gap: spacing.xs,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: fontSize.caption1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  controlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
