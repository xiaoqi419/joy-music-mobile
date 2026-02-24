/**
 * 搜索页面
 * 目标：现代化视觉 + 多平台动态搜索 + 流畅交互（防抖、分页、热搜）。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme, spacing, fontSize, borderRadius, BOTTOM_INSET } from '../../theme'
import TrackListItem from '../../components/common/TrackListItem'
import SourceChips from '../../components/common/SourceChips'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import musicSearch from '../../core/search'
import { DiscoverSourceId } from '../../types/discover'
import { Track, type TrackMoreActionHandler } from '../../types/music'

interface SearchScreenProps {
  onTrackPress?: (track: Track) => void
  onTrackMorePress?: TrackMoreActionHandler
}

const SEARCH_PAGE_LIMIT = 20

const getTrackIdentity = (track: Track): string =>
  track.id ||
  [
    track.source || 'unknown',
    track.songmid || 'na',
    track.hash || 'na',
    track.title || 'na',
    track.artist || 'na',
  ].join('__')

const dedupeTracks = (tracks: Track[]): Track[] => {
  const seen = new Set<string>()
  const result: Track[] = []
  for (const track of tracks) {
    const key = getTrackIdentity(track)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(track)
  }
  return result
}

export default function SearchScreen({ onTrackPress, onTrackMorePress }: SearchScreenProps) {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const { isPlaying, currentTrack } = usePlayerStatus()

  const [source, setSource] = useState<DiscoverSourceId>('kw')
  const [query, setQuery] = useState('')
  const [hotKeywords, setHotKeywords] = useState<string[]>([])

  const [tracks, setTracks] = useState<Track[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [searched, setSearched] = useState(false)

  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestTokenRef = useRef(0)
  const skipDebounceRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trimmedQuery = query.trim()

  const loadHotKeywords = useCallback(async (targetSource: DiscoverSourceId) => {
    try {
      const list = await musicSearch.getHotSearch(targetSource, 18)
      setHotKeywords(list)
    } catch (err) {
      console.warn('[Search] load hot keywords failed:', err)
      setHotKeywords([])
    }
  }, [])

  useEffect(() => {
    void loadHotKeywords(source)
  }, [source, loadHotKeywords])

  const runSearch = useCallback(
    async (keyword: string, targetPage: number, mode: 'initial' | 'more' | 'refresh') => {
      const token = ++requestTokenRef.current

      if (mode === 'more') {
        setLoadingMore(true)
      } else if (mode === 'refresh') {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      if (targetPage === 1) {
        setError(null)
      }

      try {
        const result = await musicSearch.searchTracksBySource({
          query: keyword,
          source,
          page: targetPage,
          limit: SEARCH_PAGE_LIMIT,
        })

        // 避免慢请求覆盖新请求结果（例如快速切换平台/关键词）。
        if (token !== requestTokenRef.current) return

        setTracks(prev => {
          if (targetPage === 1) return dedupeTracks(result.list)
          return dedupeTracks([...prev, ...result.list])
        })
        setTotal(prev => {
          if (targetPage === 1) return result.total
          return result.total > 0 ? Math.max(prev, result.total) : prev
        })
        setPage(prev => {
          if (targetPage === 1) return result.page
          return result.list.length > 0 ? result.page : prev
        })
        setHasMore(result.hasMore && result.list.length > 0)
        setSearched(true)
        setError(null)
      } catch (err) {
        if (token !== requestTokenRef.current) return
        console.error('[Search] search failed:', err)
        if (mode === 'more') {
          // 分页加载失败（含“已到末页”）时不打断主列表体验，直接收口。
          setHasMore(false)
          setError(null)
          return
        }
        setError(`${source.toUpperCase()} 搜索失败，请稍后重试。`)
        if (targetPage === 1) {
          setTracks([])
          setTotal(0)
          setHasMore(false)
          setPage(1)
          setSearched(true)
        }
      } finally {
        if (token !== requestTokenRef.current) return
        setLoading(false)
        setLoadingMore(false)
        setRefreshing(false)
      }
    },
    [source]
  )

  useEffect(() => {
    if (!trimmedQuery) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      requestTokenRef.current += 1
      setTracks([])
      setTotal(0)
      setPage(1)
      setHasMore(false)
      setSearched(false)
      setError(null)
      setLoading(false)
      setLoadingMore(false)
      setRefreshing(false)
      return
    }

    if (skipDebounceRef.current) {
      skipDebounceRef.current = false
      return
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    debounceTimerRef.current = setTimeout(() => {
      void runSearch(trimmedQuery, 1, 'initial')
      debounceTimerRef.current = null
    }, 360)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [trimmedQuery, source, runSearch])

  const handleSubmitSearch = useCallback(() => {
    if (!trimmedQuery) return
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    void runSearch(trimmedQuery, 1, 'initial')
  }, [trimmedQuery, runSearch])

  const handleSelectHotKeyword = useCallback((keyword: string) => {
    const value = keyword.trim()
    if (!value) return
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    skipDebounceRef.current = true
    setQuery(value)
    void runSearch(value, 1, 'initial')
  }, [runSearch])

  const handleLoadMore = useCallback(() => {
    if (!trimmedQuery || loading || loadingMore || refreshing || !hasMore) return
    void runSearch(trimmedQuery, page + 1, 'more')
  }, [trimmedQuery, loading, loadingMore, refreshing, hasMore, page, runSearch])

  const handleRefresh = useCallback(() => {
    if (!trimmedQuery || loading || loadingMore) return
    void runSearch(trimmedQuery, 1, 'refresh')
  }, [trimmedQuery, loading, loadingMore, runSearch])

  const resultSummary = useMemo(() => {
    if (!trimmedQuery) return `${source.toUpperCase()} 热门搜索`
    if (loading && !tracks.length) return '正在搜索...'
    if (error) return error
    return `共找到 ${total} 首歌曲`
  }, [trimmedQuery, source, loading, tracks.length, error, total])

  const renderTrackItem = useCallback(({ item, index }: { item: Track; index: number }) => (
    <TrackListItem
      track={item}
      index={index}
      showIndex={false}
      isCurrentTrack={currentTrack?.id === item.id}
      isPlaying={isPlaying && currentTrack?.id === item.id}
      onPress={onTrackPress}
      onMorePress={onTrackMorePress}
    />
  ), [currentTrack?.id, isPlaying, onTrackMorePress, onTrackPress])

  const renderListFooter = useCallback(() => {
    if (loadingMore) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>加载更多中...</Text>
        </View>
      )
    }
    if (trimmedQuery && searched && !hasMore && tracks.length > 0) {
      return (
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textTertiary }]}>已加载全部结果</Text>
        </View>
      )
    }
    return <View style={styles.footerSpace} />
  }, [loadingMore, trimmedQuery, searched, hasMore, tracks.length, colors.accent, colors.textSecondary, colors.textTertiary])

  const renderEmptyResult = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Ionicons name="search-outline" size={44} color={colors.textTertiary} />
      <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>未找到相关结果</Text>
      <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
        试试更短关键词，或者切换平台后再搜索
      </Text>
    </View>
  ), [colors.textSecondary, colors.textTertiary])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <LinearGradient
          colors={isDark ? ['#20354E', '#0E1825'] : ['#EEF5FF', '#DEEAFE']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={[styles.largeTitle, { color: isDark ? '#FFFFFF' : '#12203A' }]}>搜索</Text>
          <Text style={[styles.subtitle, { color: isDark ? 'rgba(255,255,255,0.78)' : '#425774' }]}>
            一次连接多个平台，快速定位可播放歌曲
          </Text>

          <View style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : '#FFFFFF' }]}>
            <Ionicons name="search" size={18} color={isDark ? 'rgba(255,255,255,0.78)' : colors.searchPlaceholder} />
            <TextInput
              style={[styles.searchInput, { color: isDark ? '#FFFFFF' : colors.text }]}
              placeholder="搜索歌曲、歌手、专辑"
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.55)' : colors.searchPlaceholder}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={handleSubmitSearch}
              clearButtonMode="while-editing"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.75}>
                <Ionicons name="close-circle" size={18} color={isDark ? 'rgba(255,255,255,0.62)' : colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      </View>

      <View style={styles.sourceWrap}>
        <SourceChips value={source} onChange={setSource} />
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>{resultSummary}</Text>
        {loading && trimmedQuery ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>

      {!trimmedQuery ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
        >
          <View style={styles.hotSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>热搜趋势</Text>
            <View style={styles.tagContainer}>
              {hotKeywords.map(keyword => (
                <TouchableOpacity
                  key={keyword}
                  style={[styles.tag, { backgroundColor: colors.surface }]}
                  onPress={() => handleSelectHotKeyword(keyword)}
                  activeOpacity={0.72}
                >
                  <Ionicons name="trending-up-outline" size={12} color={colors.accent} />
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{keyword}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={item => item.id}
          renderItem={renderTrackItem}
          contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
          onEndReachedThreshold={0.35}
          onEndReached={handleLoadMore}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={!loading && searched ? renderEmptyResult : null}
          ListFooterComponent={renderListFooter}
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
    paddingBottom: spacing.sm,
  },
  heroCard: {
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  largeTitle: {
    fontSize: fontSize.largeTitle,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  subtitle: {
    fontSize: fontSize.subhead,
    fontWeight: '500',
    lineHeight: 20,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: 42,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.body,
    paddingVertical: 0,
  },
  sourceWrap: {
    marginTop: spacing.xs,
  },
  metaRow: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaText: {
    fontSize: fontSize.footnote,
    fontWeight: '600',
  },
  hotSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.headline,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: fontSize.footnote,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.callout,
    fontWeight: '600',
  },
  emptyDesc: {
    fontSize: fontSize.footnote,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  footerText: {
    fontSize: fontSize.footnote,
    fontWeight: '500',
  },
  footerSpace: {
    height: spacing.md,
  },
})
