/**
 * Hot tracks section - top tracks list
 */

import React from 'react'
import { View, StyleSheet, Text } from 'react-native'
import TrackListItem from '../../components/common/TrackListItem'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import { fontSize, useTheme } from '../../theme'
import { Track } from '../../types/music'

interface HotTracksSectionProps {
  tracks: Track[]
  loading?: boolean
  error?: string | null
  onTrackPress?: (track: Track) => void
}

export default function HotTracksSection({
  tracks,
  loading = false,
  error = null,
  onTrackPress,
}: HotTracksSectionProps) {
  const { isPlaying, currentTrack } = usePlayerStatus()
  const { colors } = useTheme()

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>正在加载热门歌曲...</Text>
      </View>
    )
  }
  if (error) {
    return (
      <View style={styles.container}>
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>{error}</Text>
      </View>
    )
  }
  if (!tracks.length) {
    return (
      <View style={styles.container}>
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>当前平台暂无热门歌曲</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {tracks.map((track, index) => (
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
  )
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
  },
  statusText: {
    fontSize: fontSize.subhead,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
})
