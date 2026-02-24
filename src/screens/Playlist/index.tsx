/**
 * Playlist screen - create/import/manage local playlists.
 */

import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector } from 'react-redux'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { useTheme, spacing, fontSize, borderRadius, BOTTOM_INSET } from '../../theme'
import { RootState } from '../../store'
import { Playlist, Track, type TrackMoreActionHandler } from '../../types/music'
import { DiscoverSourceId } from '../../types/discover'
import { getSongListDetail } from '../../core/discover'
import TrackListItem from '../../components/common/TrackListItem'
import { useSwipeBack } from '../../hooks/useSwipeBack'

interface PlaylistScreenProps {
  onTrackPress?: (track: Track) => void
  onTrackMorePress?: TrackMoreActionHandler
  onPlayAll?: (tracks: Track[]) => void
}

interface ImportCandidate {
  name: string
  description?: string
  tracks: Track[]
}

const IMPORT_SOURCE_OPTIONS: Array<{
  id: DiscoverSourceId
  label: string
}> = [
  { id: 'wy', label: '网易云' },
  { id: 'tx', label: 'QQ' },
  { id: 'kw', label: '酷我' },
  { id: 'kg', label: '酷狗' },
  { id: 'mg', label: '咪咕' },
]

function createPlaylistId() {
  return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function formatUpdatedAt(updatedAt: number): string {
  const date = new Date(updatedAt)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function normalizeTrack(raw: any, index: number): Track {
  const id = String(raw?.id || raw?.songmid || raw?.hash || `import_${index}`)
  return {
    id,
    title: String(raw?.title || raw?.name || '未知歌曲'),
    artist: String(raw?.artist || raw?.singer || '未知歌手'),
    album: raw?.album ? String(raw.album) : undefined,
    duration: Number(raw?.duration || raw?.interval || 0),
    url: String(raw?.url || ''),
    coverUrl: raw?.coverUrl ? String(raw.coverUrl) : (raw?.img ? String(raw.img) : undefined),
    source: raw?.source ? String(raw.source) : undefined,
    songmid: raw?.songmid ? String(raw.songmid) : undefined,
    copyrightId: raw?.copyrightId ? String(raw.copyrightId) : undefined,
    hash: raw?.hash ? String(raw.hash) : undefined,
    picUrl: raw?.picUrl ? String(raw.picUrl) : undefined,
  }
}

function parsePlaylistCandidates(raw: unknown): ImportCandidate[] {
  if (!raw) return []

  if (Array.isArray(raw)) {
    if (!raw.length) return []
    const first = raw[0] as any
    if (Array.isArray(first?.tracks)) {
      return raw
        .map((item: any, index) => ({
          name: String(item?.name || `导入歌单 ${index + 1}`),
          description: item?.description ? String(item.description) : undefined,
          tracks: Array.isArray(item?.tracks) ? item.tracks.map((track: any, trackIndex: number) => normalizeTrack(track, trackIndex)) : [],
        }))
        .filter((item) => item.tracks.length > 0)
    }
    return [{
      name: `导入歌单 ${new Date().toLocaleDateString('zh-CN')}`,
      tracks: raw.map((track, index) => normalizeTrack(track, index)),
    }]
  }

  const parsed = raw as any
  if (Array.isArray(parsed?.playlists)) {
    return parsed.playlists
      .map((item: any, index: number) => ({
        name: String(item?.name || `导入歌单 ${index + 1}`),
        description: item?.description ? String(item.description) : undefined,
        tracks: Array.isArray(item?.tracks) ? item.tracks.map((track: any, trackIndex: number) => normalizeTrack(track, trackIndex)) : [],
      }))
      .filter((item: ImportCandidate) => item.tracks.length > 0)
  }

  if (Array.isArray(parsed?.tracks)) {
    return [{
      name: String(parsed?.name || `导入歌单 ${new Date().toLocaleDateString('zh-CN')}`),
      description: parsed?.description ? String(parsed.description) : undefined,
      tracks: parsed.tracks.map((track: any, index: number) => normalizeTrack(track, index)),
    }]
  }

  return []
}

function parseSongListId(source: DiscoverSourceId, input: string): string | null {
  const value = input.trim()
  if (/^\d+$/.test(value)) return value

  const extract = (regexes: RegExp[]): string | null => {
    for (const regex of regexes) {
      const match = value.match(regex)
      if (match?.[1]) return match[1]
    }
    return null
  }

  switch (source) {
    case 'wy':
      return extract([
        /music\.163\.com\/playlist\?id=(\d+)/i,
        /music\.163\.com\/.*[?&]id=(\d+)/i,
        /playlist\/(\d+)/i,
      ])
    case 'tx':
      return extract([
        /y\.qq\.com\/n\/ryqq\/playlist\/(\d+)/i,
        /i\.y\.qq\.com\/.*[?&]id=(\d+)/i,
        /[?&]id=(\d+)/i,
      ])
    case 'kw':
      return extract([
        /kuwo\.cn\/playlist_detail\/(\d+)/i,
        /[?&](?:pid|id)=(\d+)/i,
      ])
    case 'kg':
      return extract([
        /kugou\.com\/yy\/special\/single\/(\d+)/i,
        /kugou\.com\/.*[?&]specialid=(\d+)/i,
      ])
    case 'mg':
      return extract([
        /music\.migu\.cn\/v3\/music\/playlist\/(\d+)/i,
        /[?&]id=(\d+)/i,
      ])
    default:
      return null
  }
}

export default function PlaylistScreen({ onTrackPress, onTrackMorePress, onPlayAll }: PlaylistScreenProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const dispatch = useDispatch()

  const playlistState = useSelector((state: RootState) => state.playlist)
  const playerState = useSelector((state: RootState) => state.player)
  const currentTrack = playerState.currentTrack
  const isPlaying = playerState.isPlaying

  const playlists = playlistState.playlists
  const currentPlaylistId = playlistState.currentPlaylistId

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const selectedPlaylist = useMemo(
    () => playlists.find((item) => item.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId],
  )
  const { panX, panHandlers } = useSwipeBack(() => setSelectedPlaylistId(null))

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')

  const [showImportModal, setShowImportModal] = useState(false)
  const [showNetworkImportModal, setShowNetworkImportModal] = useState(false)
  const [networkSource, setNetworkSource] = useState<DiscoverSourceId>('wy')
  const [networkInput, setNetworkInput] = useState('')
  const [importLoading, setImportLoading] = useState(false)

  const closeNetworkImportModal = useCallback(() => {
    setShowNetworkImportModal(false)
  }, [])

  const openNetworkImportModal = useCallback(() => {
    // 先关闭导入方式弹窗，再打开网络导入，避免双 Modal 叠加导致点击无响应。
    setShowImportModal(false)
    setNetworkSource('wy')
    setNetworkInput('')
    setTimeout(() => {
      setShowNetworkImportModal(true)
    }, 120)
  }, [])

  const totalTracks = useMemo(
    () => playlists.reduce((sum, item) => sum + item.tracks.length, 0),
    [playlists],
  )

  const savePlaylist = useCallback((playlist: Playlist, setAsCurrent = false) => {
    dispatch({ type: 'PLAYLIST_ADD', payload: playlist })
    if (setAsCurrent || !currentPlaylistId) {
      dispatch({ type: 'PLAYLIST_SET_CURRENT', payload: playlist.id })
    }
  }, [currentPlaylistId, dispatch])

  const ensureUniqueName = useCallback((baseName: string): string => {
    const names = new Set(playlists.map((item) => item.name))
    if (!names.has(baseName)) return baseName
    let index = 2
    while (names.has(`${baseName} (${index})`)) {
      index += 1
    }
    return `${baseName} (${index})`
  }, [playlists])

  const handleCreatePlaylist = useCallback(() => {
    const name = createName.trim()
    if (!name) {
      Alert.alert('提示', '歌单名称不能为空')
      return
    }
    const now = Date.now()
    const playlist: Playlist = {
      id: createPlaylistId(),
      name: ensureUniqueName(name),
      description: createDescription.trim() || undefined,
      source: 'local',
      tracks: [],
      createdAt: now,
      updatedAt: now,
    }
    savePlaylist(playlist, true)
    setShowCreateModal(false)
    setCreateName('')
    setCreateDescription('')
  }, [createDescription, createName, ensureUniqueName, savePlaylist])

  const handleImportFromCurrentQueue = useCallback(() => {
    if (!playerState.playlist.length) {
      Alert.alert('当前队列为空', '请先播放歌曲后再导入歌单')
      return
    }
    const now = Date.now()
    const baseName = `播放队列 ${new Date(now).toLocaleDateString('zh-CN')}`
    const playlist: Playlist = {
      id: createPlaylistId(),
      name: ensureUniqueName(baseName),
      description: `从当前播放队列导入，共 ${playerState.playlist.length} 首`,
      source: 'imported',
      tracks: playerState.playlist.map((track) => ({ ...track })),
      createdAt: now,
      updatedAt: now,
    }
    savePlaylist(playlist, true)
    setShowImportModal(false)
    Alert.alert('导入成功', `已导入 ${playlist.tracks.length} 首歌曲`)
  }, [ensureUniqueName, playerState.playlist, savePlaylist])

  const handleImportFromFile = useCallback(async() => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled) return
      const file = result.assets?.[0]
      if (!file?.uri) {
        Alert.alert('导入失败', '未读取到文件')
        return
      }

      setImportLoading(true)
      const rawText = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      const parsed = JSON.parse(rawText)
      const candidates = parsePlaylistCandidates(parsed)
      if (!candidates.length) {
        Alert.alert('导入失败', '文件中没有有效的歌单数据')
        return
      }

      const now = Date.now()
      const imported: Playlist[] = candidates.map((candidate, index) => ({
        id: createPlaylistId(),
        name: ensureUniqueName(candidate.name || `导入歌单 ${index + 1}`),
        description: candidate.description || `从本地文件导入，共 ${candidate.tracks.length} 首`,
        source: 'imported',
        tracks: candidate.tracks,
        createdAt: now,
        updatedAt: now,
      }))

      imported.forEach((playlist, index) => savePlaylist(playlist, index === 0))
      setShowImportModal(false)
      Alert.alert('导入成功', `已导入 ${imported.length} 个歌单`)
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '本地文件导入失败')
    } finally {
      setImportLoading(false)
    }
  }, [ensureUniqueName, savePlaylist])

  const handleImportFromNetwork = useCallback(async() => {
    const input = networkInput.trim()
    if (!input) {
      Alert.alert('提示', '请输入歌单链接或歌单 ID')
      return
    }

    const playlistId = parseSongListId(networkSource, input)
    if (!playlistId) {
      Alert.alert('识别失败', '未识别到有效歌单 ID，请检查链接或直接输入纯数字 ID')
      return
    }

    try {
      setImportLoading(true)
      const firstPage = await getSongListDetail({
        source: networkSource,
        id: playlistId,
        page: 1,
        refresh: true,
      })
      const allTracks: Track[] = [...firstPage.list]
      const pageLimit = Math.min(firstPage.maxPage, 10)
      for (let page = 2; page <= pageLimit; page += 1) {
        const detail = await getSongListDetail({
          source: networkSource,
          id: playlistId,
          page,
          refresh: true,
        })
        allTracks.push(...detail.list)
      }

      if (!allTracks.length) {
        Alert.alert('导入失败', `${networkSource.toUpperCase()} 该歌单暂无歌曲`)
        return
      }

      const now = Date.now()
      const playlist: Playlist = {
        id: createPlaylistId(),
        name: ensureUniqueName(firstPage.info.name || `${networkSource.toUpperCase()} 歌单 ${playlistId}`),
        description: firstPage.info.description || `从${networkSource.toUpperCase()}网络歌单导入`,
        coverUrl: firstPage.info.coverUrl,
        source: 'network',
        tracks: allTracks,
        createdAt: now,
        updatedAt: now,
      }
      savePlaylist(playlist, true)
      setShowNetworkImportModal(false)
      setShowImportModal(false)
      setNetworkInput('')

      if (firstPage.maxPage > 10) {
        Alert.alert('导入成功', `已导入 ${allTracks.length} 首（为保证速度，仅导入前 10 页）`)
      } else {
        Alert.alert('导入成功', `已导入 ${allTracks.length} 首`)
      }
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '网络歌单导入失败')
    } finally {
      setImportLoading(false)
    }
  }, [ensureUniqueName, networkInput, networkSource, savePlaylist])

  const handleDeletePlaylist = useCallback((playlist: Playlist) => {
    Alert.alert('删除歌单', `确认删除「${playlist.name}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          dispatch({ type: 'PLAYLIST_REMOVE', payload: playlist.id })
          if (currentPlaylistId === playlist.id) {
            dispatch({ type: 'PLAYLIST_SET_CURRENT', payload: null })
          }
          if (selectedPlaylistId === playlist.id) {
            setSelectedPlaylistId(null)
          }
        },
      },
    ])
  }, [currentPlaylistId, dispatch, selectedPlaylistId])

  const handleSetCurrentPlaylist = useCallback((playlistId: string) => {
    dispatch({ type: 'PLAYLIST_SET_CURRENT', payload: playlistId })
  }, [dispatch])

  const handlePlayAll = useCallback((playlist: Playlist) => {
    if (!playlist.tracks.length) {
      Alert.alert('歌单为空', '请先导入或添加歌曲')
      return
    }
    onPlayAll?.(playlist.tracks)
  }, [onPlayAll])

  const renderPlaylistCard = useCallback(({ item }: { item: Playlist }) => {
    const isCurrent = item.id === currentPlaylistId
    return (
      <Pressable
        style={({ pressed }) => [
          styles.playlistCard,
          {
            backgroundColor: isCurrent ? colors.accentLight : colors.surface,
            borderColor: isCurrent ? colors.accent : colors.separator,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        onPress={() => setSelectedPlaylistId(item.id)}
      >
        <View style={styles.playlistCardHeader}>
          <View style={[styles.coverPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="albums-outline" size={18} color={colors.textSecondary} />
          </View>
          <View style={styles.playlistMeta}>
            <Text style={[styles.playlistName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.playlistDesc, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.description || '未填写描述'}
            </Text>
            <View style={styles.playlistMetaRow}>
              <Text style={[styles.playlistMetaText, { color: colors.textSecondary }]}>{item.tracks.length} 首</Text>
              <Text style={[styles.playlistMetaDot, { color: colors.textTertiary }]}>·</Text>
              <Text style={[styles.playlistMetaText, { color: colors.textSecondary }]}>更新于 {formatUpdatedAt(item.updatedAt)}</Text>
              {isCurrent && (
                <>
                  <Text style={[styles.playlistMetaDot, { color: colors.textTertiary }]}>·</Text>
                  <Text style={[styles.currentBadgeText, { color: colors.accent }]}>当前歌单</Text>
                </>
              )}
            </View>
          </View>
          <Pressable
            style={styles.deleteButton}
            hitSlop={8}
            onPress={() => handleDeletePlaylist(item)}
          >
            <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.playlistActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => handleSetCurrentPlaylist(item.id)}
          >
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>设为当前</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.86 : 1 },
            ]}
            onPress={() => handlePlayAll(item)}
          >
            <Ionicons name="play" size={14} color="#FFFFFF" />
            <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>播放全部</Text>
          </Pressable>
        </View>
      </Pressable>
    )
  }, [colors.accent, colors.accentLight, colors.separator, colors.surface, colors.surfaceSecondary, colors.text, colors.textSecondary, colors.textTertiary, currentPlaylistId, handleDeletePlaylist, handlePlayAll, handleSetCurrentPlaylist])

  const renderMain = () => (
    <FlatList
      data={playlists}
      keyExtractor={(item) => item.id}
      renderItem={renderPlaylistCard}
      contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
      ListHeaderComponent={(
        <>
          <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
            <Text style={[styles.largeTitle, { color: colors.text }]}>歌单</Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>我的歌单</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{playlists.length}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.separator }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>歌曲总数</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{totalTracks}</Text>
            </View>
          </View>

          <View style={styles.topActions}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryAction,
                { backgroundColor: colors.accent, opacity: pressed ? 0.86 : 1 },
              ]}
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>新建歌单</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryAction,
                { backgroundColor: colors.surface, borderColor: colors.separator, opacity: pressed ? 0.86 : 1 },
              ]}
              onPress={() => setShowImportModal(true)}
            >
              <Ionicons name="download-outline" size={17} color={colors.textSecondary} />
              <Text style={[styles.secondaryActionText, { color: colors.textSecondary }]}>导入歌单</Text>
            </Pressable>
          </View>
        </>
      )}
      ListEmptyComponent={(
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
          <Ionicons name="albums-outline" size={24} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>还没有歌单</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>创建或导入你的第一个歌单</Text>
        </View>
      )}
    />
  )

  const renderDetail = () => {
    if (!selectedPlaylist) return null

    return (
      <Animated.View
        style={[
          styles.detailContainer,
          {
            backgroundColor: colors.background,
            transform: [{ translateX: panX }],
          },
        ]}
        {...panHandlers}
      >
        <FlatList
          data={selectedPlaylist.tracks}
          keyExtractor={(item, index) => `${item.id}_${index}`}
          ListHeaderComponent={(
            <>
              <View style={[styles.detailHeader, { paddingTop: insets.top + spacing.md }]}>
                <Pressable
                  style={({ pressed }) => [
                    styles.backButton,
                    { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
                  ]}
                  onPress={() => setSelectedPlaylistId(null)}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
                  <Text style={[styles.backText, { color: colors.textSecondary }]}>返回</Text>
                </Pressable>
                <Text style={[styles.detailTitle, { color: colors.text }]} numberOfLines={1}>歌单详情</Text>
                <View style={styles.detailHeaderRight} />
              </View>

              <View style={[styles.detailInfoCard, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
                <Text style={[styles.detailPlaylistName, { color: colors.text }]} numberOfLines={2}>{selectedPlaylist.name}</Text>
                <Text style={[styles.detailPlaylistDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                  {selectedPlaylist.description || '未填写描述'}
                </Text>
                <View style={styles.detailMetaRow}>
                  <Text style={[styles.detailMetaText, { color: colors.textSecondary }]}>{selectedPlaylist.tracks.length} 首歌曲</Text>
                  <Text style={[styles.playlistMetaDot, { color: colors.textTertiary }]}>·</Text>
                  <Text style={[styles.detailMetaText, { color: colors.textSecondary }]}>更新于 {formatUpdatedAt(selectedPlaylist.updatedAt)}</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.playAllBtn,
                    { backgroundColor: colors.accent, opacity: pressed ? 0.86 : 1 },
                  ]}
                  onPress={() => handlePlayAll(selectedPlaylist)}
                >
                  <Ionicons name="play" size={16} color="#FFFFFF" />
                  <Text style={styles.playAllBtnText}>播放全部</Text>
                </Pressable>
              </View>
            </>
          )}
          contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
          renderItem={({ item, index }) => (
            <TrackListItem
              track={item}
              index={index}
              showIndex
              isCurrentTrack={currentTrack?.id === item.id}
              isPlaying={isPlaying && currentTrack?.id === item.id}
              onPress={onTrackPress}
              onMorePress={(track) => onTrackMorePress?.(track, { playlistId: selectedPlaylist.id })}
            />
          )}
        />
      </Animated.View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderMain()}
      {renderDetail()}

      <Modal transparent visible={showCreateModal} animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalMask}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>新建歌单</Text>
            <TextInput
              value={createName}
              onChangeText={setCreateName}
              placeholder="歌单名称"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
            />
            <TextInput
              value={createDescription}
              onChangeText={setCreateDescription}
              placeholder="歌单描述（可选）"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.84 : 1 },
                ]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>取消</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: colors.accent, opacity: pressed ? 0.84 : 1 },
                ]}
                onPress={handleCreatePlaylist}
              >
                <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>创建</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showImportModal} animationType="fade" onRequestClose={() => setShowImportModal(false)}>
        <View style={styles.modalMask}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>导入歌单</Text>

            <Pressable
              style={({ pressed }) => [
                styles.importOption,
                { borderBottomColor: colors.separator, opacity: pressed ? 0.82 : 1 },
              ]}
              onPress={handleImportFromCurrentQueue}
            >
              <Ionicons name="list-outline" size={18} color={colors.textSecondary} />
              <View style={styles.importMeta}>
                <Text style={[styles.importTitle, { color: colors.text }]}>从当前播放队列导入</Text>
                <Text style={[styles.importDesc, { color: colors.textSecondary }]}>将当前队列保存为新歌单</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.importOption,
                { borderBottomColor: colors.separator, opacity: pressed ? 0.82 : 1 },
              ]}
              onPress={() => { void handleImportFromFile() }}
            >
              <Ionicons name="document-attach-outline" size={18} color={colors.textSecondary} />
              <View style={styles.importMeta}>
                <Text style={[styles.importTitle, { color: colors.text }]}>从本地 JSON 文件导入</Text>
                <Text style={[styles.importDesc, { color: colors.textSecondary }]}>支持单歌单或多歌单结构</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.importOption,
                { opacity: pressed ? 0.82 : 1 },
              ]}
              onPress={openNetworkImportModal}
            >
              <Ionicons name="globe-outline" size={18} color={colors.textSecondary} />
              <View style={styles.importMeta}>
                <Text style={[styles.importTitle, { color: colors.text }]}>从网络歌单导入</Text>
                <Text style={[styles.importDesc, { color: colors.textSecondary }]}>输入链接或歌单 ID 自动导入</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.singleBtn,
                { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.84 : 1 },
              ]}
              onPress={() => setShowImportModal(false)}
            >
              <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>关闭</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={showNetworkImportModal}
        animationType="fade"
        onRequestClose={closeNetworkImportModal}
      >
        <View style={styles.modalMask}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>网络歌单导入</Text>
            <Text style={[styles.networkHint, { color: colors.textSecondary }]}>选择平台并输入歌单链接或歌单 ID</Text>

            <View style={styles.sourceWrap}>
              {IMPORT_SOURCE_OPTIONS.map((option) => {
                const active = option.id === networkSource
                return (
                  <Pressable
                    key={option.id}
                    style={({ pressed }) => [
                      styles.sourceChip,
                      {
                        backgroundColor: active ? colors.accent : colors.surfaceSecondary,
                        opacity: pressed ? 0.86 : 1,
                      },
                    ]}
                    onPress={() => setNetworkSource(option.id)}
                  >
                    <Text style={[styles.sourceChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <TextInput
              value={networkInput}
              onChangeText={setNetworkInput}
              placeholder="粘贴歌单链接或输入纯数字 ID"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.84 : 1 },
                ]}
                onPress={closeNetworkImportModal}
              >
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>取消</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: colors.accent, opacity: pressed ? 0.84 : 1 },
                ]}
                onPress={() => { void handleImportFromNetwork() }}
                disabled={importLoading}
              >
                {importLoading
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>开始导入</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {importLoading && (
        <View style={styles.loadingMask} pointerEvents="none">
          <View style={[styles.loadingCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.separator }]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>歌单导入中...</Text>
          </View>
        </View>
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
  largeTitle: {
    fontSize: fontSize.largeTitle,
    fontWeight: '800',
    letterSpacing: 0.25,
  },
  summaryCard: {
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: fontSize.title3,
    fontWeight: '800',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    marginHorizontal: spacing.md,
  },
  topActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  primaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: fontSize.callout,
    fontWeight: '700',
  },
  secondaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  secondaryActionText: {
    fontSize: fontSize.callout,
    fontWeight: '700',
  },
  emptyCard: {
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    marginTop: spacing.sm,
  },
  emptyTitle: {
    marginTop: spacing.sm,
    fontSize: fontSize.headline,
    fontWeight: '700',
  },
  emptyDesc: {
    marginTop: spacing.xs,
    fontSize: fontSize.footnote,
  },
  playlistCard: {
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
    padding: spacing.md,
    minHeight: 128,
  },
  playlistCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  coverPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistMeta: {
    flex: 1,
  },
  playlistName: {
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  playlistDesc: {
    marginTop: 2,
    fontSize: fontSize.caption1,
  },
  playlistMetaRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistMetaText: {
    fontSize: fontSize.caption2,
    fontWeight: '600',
  },
  playlistMetaDot: {
    marginHorizontal: 4,
    fontSize: fontSize.caption2,
    fontWeight: '700',
  },
  currentBadgeText: {
    fontSize: fontSize.caption2,
    fontWeight: '700',
  },
  deleteButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },
  playlistActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: borderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnText: {
    fontSize: fontSize.subhead,
    fontWeight: '700',
  },
  detailContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  backButton: {
    minHeight: 34,
    minWidth: 64,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
  },
  backText: {
    fontSize: fontSize.caption1,
    fontWeight: '700',
  },
  detailTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.headline,
    fontWeight: '700',
    marginHorizontal: spacing.sm,
  },
  detailHeaderRight: {
    width: 64,
  },
  detailInfoCard: {
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  detailPlaylistName: {
    fontSize: fontSize.title3,
    fontWeight: '800',
  },
  detailPlaylistDesc: {
    marginTop: spacing.xs,
    fontSize: fontSize.footnote,
  },
  detailMetaRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailMetaText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  playAllBtn: {
    marginTop: spacing.md,
    minHeight: 42,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  playAllBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.callout,
    fontWeight: '700',
  },
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  modalCard: {
    width: '100%',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.title3,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    fontSize: fontSize.subhead,
    fontWeight: '700',
  },
  importOption: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  importMeta: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  importTitle: {
    fontSize: fontSize.callout,
    fontWeight: '700',
  },
  importDesc: {
    marginTop: 2,
    fontSize: fontSize.caption1,
  },
  singleBtn: {
    marginTop: spacing.md,
    minHeight: 40,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  sourceChip: {
    minHeight: 30,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceChipText: {
    fontSize: fontSize.caption1,
    fontWeight: '700',
  },
  networkHint: {
    fontSize: fontSize.footnote,
    marginBottom: spacing.sm,
  },
  loadingMask: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: BOTTOM_INSET + spacing.lg,
    pointerEvents: 'none',
  },
  loadingCard: {
    minHeight: 36,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  loadingText: {
    fontSize: fontSize.caption1,
    fontWeight: '700',
  },
})
