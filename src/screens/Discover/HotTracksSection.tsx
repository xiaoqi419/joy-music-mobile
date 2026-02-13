/**
 * Hot tracks section - top tracks list
 */

import React from 'react'
import { View, StyleSheet, Text } from 'react-native'
import TrackListItem from '../../components/common/TrackListItem'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import { fontSize } from '../../theme'
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

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>Loading hot tracks...</Text>
      </View>
    )
  }
  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>{error}</Text>
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
    color: '#8E8E93',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
})
