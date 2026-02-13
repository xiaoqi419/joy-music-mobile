/**
 * Mini player bar with frosted glass effect
 * Sits above the TabBar, shows current track info and controls
 */

import React, { useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, spacing, fontSize, borderRadius, MINI_PLAYER_HEIGHT } from '../../theme'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import { playerController } from '../../core/player'

interface MiniPlayerProps {
  onOpenPlayer?: () => void
}

export default function MiniPlayer({ onOpenPlayer }: MiniPlayerProps) {
  const { colors, isDark } = useTheme()
  const { isPlaying, currentTrack, progress } = usePlayerStatus()

  const handlePlayPause = useCallback(async () => {
    try {
      if (isPlaying) {
        await playerController.pause()
      } else {
        await playerController.resume()
      }
    } catch (e) {
      console.error('MiniPlayer play/pause error:', e)
    }
  }, [isPlaying])

  const handleNext = useCallback(async () => {
    try {
      await playerController.playNext()
    } catch (e) {
      console.error('MiniPlayer next error:', e)
    }
  }, [])

  if (!currentTrack) return null

  return (
    <View style={styles.wrapper}>
      <View style={[styles.container, { borderRadius: borderRadius.lg }]}>
        <BlurView
          intensity={90}
          tint={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { borderRadius: borderRadius.lg, overflow: 'hidden' }]}
        />

        {/* Progress bar at top */}
        <View style={[styles.progressTrack, { backgroundColor: colors.separator }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.accent,
                width: `${Math.min(progress * 100, 100)}%`,
              },
            ]}
          />
        </View>

        <View style={styles.content}>
          {/* Cover art */}
          <TouchableOpacity
            style={styles.trackArea}
            activeOpacity={0.9}
            onPress={onOpenPlayer}
          >
            <View style={[styles.cover, { backgroundColor: colors.surfaceElevated }]}>
              {currentTrack.coverUrl ? (
                <Image
                  source={{ uri: currentTrack.coverUrl }}
                  style={styles.coverImage}
                />
              ) : (
                <Ionicons name="musical-note" size={20} color={colors.textTertiary} />
              )}
            </View>

            {/* Track info */}
            <View style={styles.info}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {currentTrack.title}
              </Text>
              <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>
                {currentTrack.artist}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Controls */}
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handlePlayPause}
            activeOpacity={0.6}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleNext}
            activeOpacity={0.6}
          >
            <Ionicons name="play-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: 0,
  },
  container: {
    height: MINI_PLAYER_HEIGHT,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 2,
    width: '100%',
  },
  progressFill: {
    height: 2,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  trackArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: {
    width: 40,
    height: 40,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.subhead,
    fontWeight: '600',
  },
  artist: {
    fontSize: fontSize.caption1,
    marginTop: 1,
  },
  controlButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
