/**
 * Playlist section - 2-column grid of playlist cards
 */

import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  FlatList,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, spacing, fontSize, borderRadius } from '../../theme'
import { SongListItem } from '../../types/discover'

const SCREEN_WIDTH = Dimensions.get('window').width
const CARD_GAP = spacing.md
const CARD_WIDTH = (SCREEN_WIDTH - spacing.md * 2 - CARD_GAP) / 2

interface PlaylistSectionProps {
  playlists: SongListItem[]
  loading?: boolean
  error?: string | null
  onPlaylistPress?: (playlist: SongListItem) => void
}

/**
 * 渲染歌单卡片（封面 + 播放量角标 + 名称）。
 */
function PlaylistCard({ item, onPress }: { item: SongListItem; onPress?: () => void }) {
  const { colors } = useTheme()

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={[styles.coverContainer, { backgroundColor: colors.surfaceElevated }]}>
        <Image source={{ uri: item.coverUrl || 'https://via.placeholder.com/300' }} style={styles.coverImage} />
        <View style={styles.playCountBadge}>
          <Ionicons name="play" size={10} color="#FFFFFF" />
          <Text style={styles.playCountText}>{item.playCount || '0'}</Text>
        </View>
      </View>
      <Text
        style={[styles.playlistName, { color: colors.text }]}
        numberOfLines={2}
      >
        {item.name}
      </Text>
    </TouchableOpacity>
  )
}

export default function PlaylistSection({
  playlists,
  loading = false,
  error = null,
  onPlaylistPress,
}: PlaylistSectionProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>Loading playlists...</Text>
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

  if (playlists.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>No playlists found.</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={playlists}
        numColumns={2}
        scrollEnabled={false}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <PlaylistCard
            item={item}
            onPress={() => onPlaylistPress?.(item)}
          />
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
  },
  statusText: {
    fontSize: fontSize.subhead,
    color: '#8E8E93',
    paddingVertical: spacing.sm,
  },
  listContent: {
    gap: spacing.md,
  },
  row: {
    gap: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
  },
  coverContainer: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  playCountBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  playCountText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  playlistName: {
    fontSize: fontSize.footnote,
    fontWeight: '500',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
})
