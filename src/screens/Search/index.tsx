/**
 * Search screen with search bar and mock results
 */

import React, { useState, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, spacing, fontSize, borderRadius, BOTTOM_INSET } from '../../theme'
import TrackListItem from '../../components/common/TrackListItem'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import { uniqueMockTracks, mockHotSearchKeywords } from '../../data/mock'
import { Track } from '../../types/music'

interface SearchScreenProps {
  onTrackPress?: (track: Track) => void
}

export default function SearchScreen({ onTrackPress }: SearchScreenProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { isPlaying, currentTrack } = usePlayerStatus()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return uniqueMockTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album && t.album.toLowerCase().includes(q)),
    )
  }, [query])

  const handleHotKeyword = (keyword: string) => {
    setQuery(keyword)
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with search bar */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={[styles.largeTitle, { color: colors.text }]}>搜索</Text>

        <View style={[styles.searchBar, { backgroundColor: colors.searchBackground }]}>
          <Ionicons name="search" size={18} color={colors.searchPlaceholder} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="搜索歌曲、歌手、专辑"
            placeholderTextColor={colors.searchPlaceholder}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {query.trim() === '' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
        >
          {/* Hot search keywords */}
          <View style={styles.hotSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>热门搜索</Text>
            <View style={styles.tagContainer}>
              {mockHotSearchKeywords.map((keyword) => (
                <TouchableOpacity
                  key={keyword}
                  style={[styles.tag, { backgroundColor: colors.surfaceElevated }]}
                  onPress={() => handleHotKeyword(keyword)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>
                    {keyword}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : results.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            未找到相关结果
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
          renderItem={({ item, index }) => (
            <TrackListItem
              track={item}
              index={index}
              showIndex={false}
              isCurrentTrack={currentTrack?.id === item.id}
              isPlaying={isPlaying && currentTrack?.id === item.id}
              onPress={onTrackPress}
            />
          )}
        />
      )}
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
    marginBottom: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 38,
    borderRadius: borderRadius.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.body,
    height: 38,
    padding: 0,
  },
  hotSection: {
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.headline,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: fontSize.footnote,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.callout,
  },
})
