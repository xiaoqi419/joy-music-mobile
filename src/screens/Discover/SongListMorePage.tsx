import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { borderRadius, BOTTOM_INSET, fontSize, spacing, useTheme } from '../../theme'
import { discoverSourceList, getSongListPage, getSongListSortList, getSongListTags } from '../../core/discover'
import { DiscoverSourceId, SongListItem, SongListTagInfo } from '../../types/discover'
import { useSwipeBack } from '../../hooks/useSwipeBack'
import PlaylistSection from './PlaylistSection'

interface SongListMorePageProps {
  source: DiscoverSourceId
  sortId: string
  tagId: string
  onBack: () => void
  onSourceChange: (source: DiscoverSourceId) => void
  onFiltersChange: (value: { sortId: string; tagId: string; tagName: string }) => void
  onPlaylistPress?: (playlist: SongListItem) => void
}

function normalizeSortLabel(name: string): string {
  const key = String(name || '').toLowerCase()
  if (key.includes('new')) return '最新'
  if (key.includes('hot')) return '最热'
  if (key.includes('recommend')) return '推荐'
  if (key.includes('rise')) return '飙升'
  return name || '默认'
}

function dedupeTags(tags: SongListTagInfo[]): SongListTagInfo[] {
  const map = new Map<string, SongListTagInfo>()
  for (const item of tags) {
    if (!map.has(item.id)) map.set(item.id, item)
  }
  return Array.from(map.values())
}

export default function SongListMorePage({
  source,
  sortId,
  tagId,
  onBack,
  onSourceChange,
  onFiltersChange,
  onPlaylistPress,
}: SongListMorePageProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { panX, panHandlers } = useSwipeBack(onBack)

  const [localSortId, setLocalSortId] = useState(sortId)
  const [localTagId, setLocalTagId] = useState(tagId)
  const [tags, setTags] = useState<SongListTagInfo[]>([])
  const [hotTags, setHotTags] = useState<SongListTagInfo[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<SongListItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [showSourceDropdown, setShowSourceDropdown] = useState(false)
  const [reloadSeed, setReloadSeed] = useState(0)

  const sortList = useMemo(() => getSongListSortList(source), [source])
  const safeSortId = localSortId || sortList[0]?.id || 'new'

  useEffect(() => {
    const fallbackSortId = sortList[0]?.id || ''
    setLocalSortId(sortId || fallbackSortId)
    setLocalTagId(tagId || '')
    setShowTagDropdown(false)
    setShowSourceDropdown(false)
  }, [sortId, tagId, sortList])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setTagsLoading(true)
        setTagsError(null)
        const data = await getSongListTags(source)
        if (!active) return
        setTags(data.tags || [])
        setHotTags(data.hotTags || [])
      } catch {
        if (!active) return
        setTagsError(`${source.toUpperCase()} 标签加载失败`)
      } finally {
        if (!active) return
        setTagsLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [source, reloadSeed])

  const allTags = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of dedupeTags([...hotTags, ...tags])) {
      const id = String(item.id || '').trim()
      const name = String(item.name || '').trim()
      if (!id || !name) continue
      if (id.toLowerCase() === 'undefined' || name.toLowerCase() === 'undefined') continue
      if (id.toLowerCase() === 'null' || name.toLowerCase() === 'null') continue
      map.set(id, name)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [hotTags, tags])

  const tagNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of allTags) map.set(item.id, item.name)
    return map
  }, [allTags])

  const selectedTagName = localTagId ? (tagNameMap.get(localTagId) || '未知标签') : '全部标签'

  const loadPlaylists = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true)
      } else {
        setPlaylistLoading(true)
      }
      setPlaylistError(null)
      const page = await getSongListPage({
        source,
        sortId: safeSortId,
        tagId: localTagId || '',
        page: 1,
        refresh,
      })
      setPlaylists(page.list || [])
    } catch {
      setPlaylistError(`${source.toUpperCase()} 歌单加载失败`)
      setPlaylists([])
    } finally {
      setPlaylistLoading(false)
      setRefreshing(false)
    }
  }, [source, safeSortId, localTagId])

  useEffect(() => {
    void loadPlaylists()
  }, [loadPlaylists])

  const handleSortSelect = useCallback((nextSortId: string) => {
    const resolvedSortId = nextSortId || sortList[0]?.id || 'new'
    const tagName = localTagId ? (tagNameMap.get(localTagId) || '') : ''
    setLocalSortId(resolvedSortId)
    onFiltersChange({
      sortId: resolvedSortId,
      tagId: localTagId,
      tagName,
    })
  }, [sortList, localTagId, tagNameMap, onFiltersChange])

  const handleTagSelect = useCallback((nextTagId: string) => {
    const tagName = nextTagId ? (tagNameMap.get(nextTagId) || '') : ''
    setLocalTagId(nextTagId)
    setShowTagDropdown(false)
    onFiltersChange({
      sortId: safeSortId,
      tagId: nextTagId,
      tagName,
    })
  }, [safeSortId, tagNameMap, onFiltersChange])

  const handleSourceSelect = useCallback((nextSource: DiscoverSourceId) => {
    setShowSourceDropdown(false)
    setShowTagDropdown(false)
    if (nextSource !== source) {
      onSourceChange(nextSource)
    }
  }, [source, onSourceChange])

  const handleRefresh = useCallback(() => {
    void loadPlaylists(true)
  }, [loadPlaylists])

  const renderChip = useCallback(
    (
      key: string,
      label: string,
      active: boolean,
      onPress: () => void
    ) => (
      <TouchableOpacity
        key={key}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.accent : colors.surface,
            borderColor: active ? colors.accent : colors.separator,
          },
        ]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.chipText,
            { color: active ? '#fff' : colors.textSecondary },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    ),
    [colors]
  )

  const renderTagChip = useCallback((id: string, name: string) => {
    const active = localTagId === id
    return (
      <TouchableOpacity
        key={`dropdown-tag-${id || 'all'}`}
        style={[
          styles.dropdownTagChip,
          {
            backgroundColor: active ? colors.accentLight : colors.surface,
            borderColor: active ? colors.accent : colors.separator,
          },
        ]}
        onPress={() => handleTagSelect(id)}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.dropdownTagChipText,
            { color: active ? colors.accent : colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
      </TouchableOpacity>
    )
  }, [localTagId, colors, handleTagSelect])

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
      <View
        style={[
          styles.header,
          showSourceDropdown && styles.headerOnTop,
          {
            borderBottomColor: colors.separator,
            paddingTop: insets.top + spacing.sm,
          },
        ]}
      >
        <TouchableOpacity onPress={onBack} style={styles.iconBtn} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: colors.text }]}>歌单筛选</Text>
          <View style={styles.sourceSelectArea}>
            <TouchableOpacity
              style={[
                styles.sourceSelectTrigger,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.separator,
                },
              ]}
              onPress={() => {
                setShowSourceDropdown(v => !v)
                setShowTagDropdown(false)
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                当前平台：{source.toUpperCase()}
              </Text>
              <Ionicons
                name={showSourceDropdown ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {showSourceDropdown && (
              <View
                style={[
                  styles.sourceDropdown,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.separator,
                  },
                ]}
              >
                {discoverSourceList.map(item => {
                  const active = item.id === source
                  return (
                    <TouchableOpacity
                      key={`source-${item.id}`}
                      style={styles.sourceDropdownItem}
                      onPress={() => handleSourceSelect(item.id)}
                      activeOpacity={0.82}
                    >
                      <Text
                        style={[
                          styles.sourceDropdownText,
                          { color: active ? colors.accent : colors.text },
                        ]}
                      >
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </View>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{
          paddingBottom: BOTTOM_INSET + spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>排序</Text>
          <View style={styles.chipWrap}>
            {sortList.map(item =>
              renderChip(
                `sort-${item.id}`,
                normalizeSortLabel(item.name),
                localSortId === item.id,
                () => handleSortSelect(item.id)
              )
            )}
          </View>
        </View>

        <View style={[styles.section, showTagDropdown && styles.tagSectionOnTop]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>标签</Text>
          <View style={styles.tagSelectArea}>
            <TouchableOpacity
              style={[
                styles.tagSelectButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.separator,
                },
              ]}
              onPress={() => {
                setShowTagDropdown(v => !v)
                setShowSourceDropdown(false)
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.tagSelectText, { color: colors.text }]}>
                {selectedTagName}
              </Text>
              <Ionicons
                name={showTagDropdown ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {showTagDropdown && (
              <View
                style={[
                  styles.dropdown,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.separator,
                  },
                ]}
              >
                <ScrollView
                  nestedScrollEnabled
                  style={styles.dropdownScroll}
                  contentContainerStyle={styles.dropdownTagWrap}
                  showsVerticalScrollIndicator={false}
                >
                  {renderTagChip('', '全部标签')}
                  {allTags.map(item => renderTagChip(item.id, item.name))}
                </ScrollView>
              </View>
            )}
          </View>

          {tagsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : null}

          {!!tagsError && (
            <View style={styles.errorRow}>
              <Text style={[styles.errorText, { color: colors.textSecondary }]}>{tagsError}</Text>
              <TouchableOpacity onPress={() => setReloadSeed(v => v + 1)} activeOpacity={0.8}>
                <Text style={[styles.retryText, { color: colors.accent }]}>重试</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>歌单结果</Text>
          <PlaylistSection
            playlists={playlists}
            loading={playlistLoading}
            error={playlistError}
            onPlaylistPress={onPlaylistPress}
            horizontalPadding={0}
          />
        </View>
      </ScrollView>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerOnTop: {
    zIndex: 60,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.headline,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  sourceSelectArea: {
    marginTop: spacing.xs,
    width: 140,
    position: 'relative',
    zIndex: 70,
  },
  sourceSelectTrigger: {
    height: 30,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceDropdown: {
    position: 'absolute',
    top: 34,
    left: 0,
    right: 0,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 12,
  },
  sourceDropdownItem: {
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceDropdownText: {
    fontSize: fontSize.caption1,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  section: {
    marginTop: spacing.lg,
  },
  tagSectionOnTop: {
    zIndex: 30,
  },
  sectionTitle: {
    fontSize: fontSize.title3,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  groupTitle: {
    fontSize: fontSize.footnote,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  tagSelectArea: {
    position: 'relative',
  },
  tagSelectButton: {
    height: 44,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagSelectText: {
    fontSize: fontSize.subhead,
    fontWeight: '600',
  },
  dropdown: {
    position: 'absolute',
    top: 44 + spacing.sm,
    left: 0,
    right: 0,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 12,
  },
  dropdownScroll: {
    maxHeight: 260,
  },
  dropdownTagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
  },
  dropdownTagChip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    maxWidth: '100%',
  },
  dropdownTagChipText: {
    fontSize: fontSize.footnote,
    fontWeight: '600',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: {
    fontSize: fontSize.subhead,
    fontWeight: '600',
  },
  loadingRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  errorRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    fontSize: fontSize.footnote,
  },
  retryText: {
    fontSize: fontSize.footnote,
    fontWeight: '700',
  },
})
