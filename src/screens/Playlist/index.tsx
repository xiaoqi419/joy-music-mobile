/**
 * Playlist screen - create/import/manage local playlists.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector } from 'react-redux'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { useTheme, spacing, fontSize, borderRadius, BOTTOM_INSET } from '../../theme'
import { RootState } from '../../store'
import { Playlist, Track, type TrackMoreActionHandler } from '../../types/music'
import { DiscoverSourceId } from '../../types/discover'
import { getSongListDetail } from '../../core/discover'
import { httpRequest } from '../../core/discover/http'
import { emitScrollTopState, subscribeScrollToTop } from '../../core/ui/scrollToTopBus'
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

interface PlaylistExportPayload {
  version: string
  exportedAt: string
  playlists: Playlist[]
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

const DETAIL_TRACK_INITIAL_COUNT = 80
const DETAIL_TRACK_BATCH_SIZE = 80

function createPlaylistId() {
  return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function formatUpdatedAt(updatedAt: number): string {
  const date = new Date(updatedAt)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getPlaylistCover(playlist: Playlist): string | undefined {
  const coverUrl = String(playlist.coverUrl || '').trim()
  if (coverUrl) return coverUrl

  const trackCover = playlist.tracks.find((item) => String(item.coverUrl || '').trim())?.coverUrl
  if (trackCover) return String(trackCover).trim()

  const trackPic = playlist.tracks.find((item) => String(item.picUrl || '').trim())?.picUrl
  if (trackPic) return String(trackPic).trim()

  return undefined
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

function sanitizeExportFileName(name: string): string {
  const sanitized = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 48)
  return sanitized || 'playlist'
}

function normalizeTrackForExport(track: Track): Track {
  return {
    id: String(track.id || ''),
    title: String(track.title || '未知歌曲'),
    artist: String(track.artist || '未知歌手'),
    album: track.album ? String(track.album) : undefined,
    duration: Number(track.duration || 0),
    url: String(track.url || ''),
    coverUrl: track.coverUrl ? String(track.coverUrl) : undefined,
    source: track.source ? String(track.source) : undefined,
    songmid: track.songmid ? String(track.songmid) : undefined,
    copyrightId: track.copyrightId ? String(track.copyrightId) : undefined,
    hash: track.hash ? String(track.hash) : undefined,
    picUrl: track.picUrl ? String(track.picUrl) : undefined,
  }
}

function normalizePlaylistForExport(playlist: Playlist): Playlist {
  return {
    id: String(playlist.id || createPlaylistId()),
    name: String(playlist.name || '未命名歌单'),
    description: playlist.description ? String(playlist.description) : undefined,
    coverUrl: playlist.coverUrl ? String(playlist.coverUrl) : undefined,
    source: playlist.source || 'local',
    tracks: playlist.tracks.map((track) => normalizeTrackForExport(track)),
    createdAt: Number(playlist.createdAt || Date.now()),
    updatedAt: Number(playlist.updatedAt || Date.now()),
  }
}

function createPlaylistExportPayload(playlists: Playlist[]): PlaylistExportPayload {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    playlists: playlists.map((playlist) => normalizePlaylistForExport(playlist)),
  }
}

function getPlaylistSourceLabel(source?: Playlist['source']): string {
  switch (source) {
    case 'imported':
      return '导入歌单'
    case 'network':
      return '网络歌单'
    default:
      return '自建歌单'
  }
}

function getPlaylistPlatformCode(playlist: Playlist): string {
  const trackSource = playlist.tracks.find((track) => track.source)?.source
  if (trackSource) return String(trackSource).toUpperCase()

  const description = String(playlist.description || '')
  const match = description.match(/从\s*([A-Za-z]+)\s*网络歌单导入/i)
  return match?.[1] ? String(match[1]).toUpperCase() : ''
}

function getPlaylistDisplayLabel(playlist: Playlist): string {
  if (playlist.source === 'network') {
    const platformCode = getPlaylistPlatformCode(playlist)
    return platformCode ? `${platformCode}·网络歌单` : '网络歌单'
  }
  return getPlaylistSourceLabel(playlist.source)
}

function hashString(input: string): number {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100
  const l = lightness / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1))
  const m = l - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (hue < 60) {
    r = c; g = x; b = 0
  } else if (hue < 120) {
    r = x; g = c; b = 0
  } else if (hue < 180) {
    r = 0; g = c; b = x
  } else if (hue < 240) {
    r = 0; g = x; b = c
  } else if (hue < 300) {
    r = x; g = 0; b = c
  } else {
    r = c; g = 0; b = x
  }

  const toHex = (value: number) => {
    const normalized = Math.round((value + m) * 255)
    return normalized.toString(16).padStart(2, '0')
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * 从封面 URL 生成稳定的主色渐变。
 * 说明：移动端无原生像素采样时，使用封面 URL 作为种子生成稳定主色，保证不同歌单有差异化氛围色。
 */
function buildCoverGradientColors(coverUrl: string | undefined, isDark: boolean): [string, string] {
  if (!coverUrl) {
    return isDark ? ['#5A3B1E', '#3A2818'] : ['#B77933', '#895826']
  }

  const seed = hashString(coverUrl)
  const hue = seed % 360
  const saturation = 55 + (seed % 18)
  const lightA = isDark ? 30 + (seed % 8) : 44 + (seed % 8)
  const lightB = Math.max(16, lightA - (isDark ? 12 : 10))

  const primary = hslToHex(hue, saturation, lightA)
  const secondary = hslToHex((hue + 18) % 360, Math.max(38, saturation - 9), lightB)
  return [primary, secondary]
}

function collectSongListInputCandidates(input: string): string[] {
  const value = input.trim()
  if (!value) return []

  const candidates: string[] = [value]
  const urlMatches = value.match(/https?:\/\/[^\s]+/ig) || []
  for (const rawUrl of urlMatches) {
    const url = rawUrl
      .replace(/^[\s"'`([{<【（]+/, '')
      .replace(/[\s"'`)\]}>，。！？!?,.;:】）]+$/, '')
    if (url && !candidates.includes(url)) {
      candidates.push(url)
    }
  }
  return candidates
}

function getSongListIdRegexes(source: DiscoverSourceId): RegExp[] {
  switch (source) {
    case 'wy':
      return [
        /music\.163\.com\/playlist\?id=(\d+)/i,
        /music\.163\.com\/.*[?&]id=(\d+)/i,
        /playlist\/(\d+)/i,
        /[?&]id=(\d+)/i,
      ]
    case 'tx':
      return [
        /y\.qq\.com\/n\/ryqq\/playlist\/(\d+)/i,
        /music\.qq\.com\/.*[?&]id=(\d+)/i,
        /i\.y\.qq\.com\/v8\/playsquare\/playlist\.html.*[?&]id=(\d+)/i,
        /i\.y\.qq\.com\/n2\/m\/share\/details\/taoge\.html.*[?&]id=(\d+)/i,
        /playlist[?&]id=(\d+)/i,
        /i\.y\.qq\.com\/.*[?&]id=(\d+)/i,
        /[?&]id=(\d+)/i,
      ]
    case 'kw':
      return [
        /kuwo\.cn\/playlist_detail\/(\d+)/i,
        /m\.kuwo\.cn\/h5app\/playlist\/(\d+)/i,
        /h5app\.kuwo\.cn\/m\/bodian\/collection\.html.*[?&]playlistId=(\d+)/i,
        /[?&]playlistId=(\d+)/i,
        /[?&](?:pid|id)=(\d+)/i,
      ]
    case 'kg':
      return [
        /kugou\.com\/yy\/special\/single\/(\d+)/i,
        /m\.kugou\.com\/playlist\?id=(\d+)/i,
        /[?&]id=(\d+)/i,
        /kugou\.com\/.*[?&]specialid=(\d+)/i,
        /[?&]specialid=(\d+)/i,
      ]
    case 'mg':
      return [
        /music\.migu\.cn\/v3\/music\/playlist\/(\d+)/i,
        /m\.music\.migu\.cn\/playlist\?id=(\d+)/i,
        /music\.migu\.cn\/playlist\?id=(\d+)/i,
        /[?&]playlistId=(\d+)/i,
        /[?&]id=(\d+)/i,
      ]
    default:
      return []
  }
}

function parseSongListId(source: DiscoverSourceId, input: string): string | null {
  const candidates = collectSongListInputCandidates(input)
  if (!candidates.length) return null
  const regexes = getSongListIdRegexes(source)
  if (!regexes.length) return null

  const extract = (value: string): string | null => {
    for (const regex of regexes) {
      const match = value.match(regex)
      if (match?.[1]) return match[1]
    }
    return null
  }

  for (const value of candidates) {
    if (/^\d+$/.test(value)) return value
    const songListId = extract(value)
    if (songListId) return songListId
  }
  return null
}

async function resolveSongListShareUrl(url: string): Promise<string | null> {
  try {
    const response = await httpRequest<string>(url, { timeoutMs: 8000 })
    return response.url || url
  } catch {
    return null
  }
}

async function parseSongListIdWithShareUrl(source: DiscoverSourceId, input: string): Promise<string | null> {
  const parsedDirect = parseSongListId(source, input)
  if (parsedDirect) return parsedDirect

  const urlCandidates = collectSongListInputCandidates(input)
    .filter((item) => /^https?:\/\//i.test(item))
  for (const candidateUrl of urlCandidates) {
    const resolvedUrl = await resolveSongListShareUrl(candidateUrl)
    if (!resolvedUrl) continue
    const resolvedId = parseSongListId(source, resolvedUrl)
    if (resolvedId) return resolvedId
  }
  return null
}

export default function PlaylistScreen({ onTrackPress, onTrackMorePress, onPlayAll }: PlaylistScreenProps) {
  const { colors, isDark } = useTheme()
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
  const [detailVisibleTrackCount, setDetailVisibleTrackCount] = useState(DETAIL_TRACK_INITIAL_COUNT)
  const detailVisibleTracks = useMemo(() => {
    if (!selectedPlaylist) return []
    return selectedPlaylist.tracks.slice(0, Math.min(detailVisibleTrackCount, selectedPlaylist.tracks.length))
  }, [detailVisibleTrackCount, selectedPlaylist])
  const hasMoreDetailTracks = useMemo(() => {
    if (!selectedPlaylist) return false
    return detailVisibleTracks.length < selectedPlaylist.tracks.length
  }, [detailVisibleTracks.length, selectedPlaylist])

  const mainListRef = useRef<FlatList<Playlist> | null>(null)
  const detailListRef = useRef<FlatList<Track> | null>(null)
  const { panX, panHandlers } = useSwipeBack(() => setSelectedPlaylistId(null))

  useEffect(() => {
    if (!selectedPlaylistId) {
      panX.setValue(0)
    }
  }, [panX, selectedPlaylistId])

  useEffect(() => {
    return subscribeScrollToTop(() => {
      if (selectedPlaylist) {
        detailListRef.current?.scrollToOffset({ offset: 0, animated: true })
        return
      }
      mainListRef.current?.scrollToOffset({ offset: 0, animated: true })
    })
  }, [selectedPlaylist])

  const handleMainListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (selectedPlaylist) return
    emitScrollTopState(event.nativeEvent.contentOffset.y <= 4)
  }, [selectedPlaylist])

  const handleDetailListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!selectedPlaylist) return
    emitScrollTopState(event.nativeEvent.contentOffset.y <= 4)
  }, [selectedPlaylist])

  useEffect(() => {
    emitScrollTopState(true)
  }, [selectedPlaylistId])

  useEffect(() => {
    setDetailVisibleTrackCount(DETAIL_TRACK_INITIAL_COUNT)
  }, [selectedPlaylistId])

  const openPlaylistDetail = useCallback((playlistId: string) => {
    panX.setValue(0)
    setSelectedPlaylistId(playlistId)
  }, [panX])

  const closePlaylistDetail = useCallback(() => {
    panX.setValue(0)
    setSelectedPlaylistId(null)
  }, [panX])

  const handleLoadMoreDetailTracks = useCallback(() => {
    if (!selectedPlaylist) return
    setDetailVisibleTrackCount((prev) => {
      if (prev >= selectedPlaylist.tracks.length) return prev
      return Math.min(prev + DETAIL_TRACK_BATCH_SIZE, selectedPlaylist.tracks.length)
    })
  }, [selectedPlaylist])

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')

  const [showImportModal, setShowImportModal] = useState(false)
  const [showNetworkImportModal, setShowNetworkImportModal] = useState(false)
  const [networkSource, setNetworkSource] = useState<DiscoverSourceId>('wy')
  const [networkInput, setNetworkInput] = useState('')
  const [importLoading, setImportLoading] = useState(false)

  const closeNetworkImportModal = useCallback(() => {
    if (importLoading) return
    setShowNetworkImportModal(false)
  }, [importLoading])

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

    const playlistId = await parseSongListIdWithShareUrl(networkSource, input)
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
            closePlaylistDetail()
          }
        },
      },
    ])
  }, [closePlaylistDetail, currentPlaylistId, dispatch, selectedPlaylistId])

  const handlePlayAll = useCallback((playlist: Playlist) => {
    if (!playlist.tracks.length) {
      Alert.alert('歌单为空', '请先导入或添加歌曲')
      return
    }
    dispatch({ type: 'PLAYLIST_SET_CURRENT', payload: playlist.id })
    onPlayAll?.(playlist.tracks)
  }, [dispatch, onPlayAll])

  const writePlaylistExportFile = useCallback(async(payload: PlaylistExportPayload, baseName: string) => {
    const storageRoot = FileSystem.documentDirectory || FileSystem.cacheDirectory
    if (!storageRoot) {
      throw new Error('当前环境不支持导出本地文件')
    }

    const exportDir = `${storageRoot}joy_playlist_exports`
    await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true })

    const filename = `${sanitizeExportFileName(baseName)}_${Date.now()}.json`
    const fileUri = `${exportDir}/${filename}`
    await FileSystem.writeAsStringAsync(
      fileUri,
      JSON.stringify(payload, null, 2),
      { encoding: FileSystem.EncodingType.UTF8 },
    )

    return fileUri
  }, [])

  const handleExportPlaylist = useCallback(async(playlist: Playlist) => {
    try {
      const payload = createPlaylistExportPayload([playlist])
      const fileUri = await writePlaylistExportFile(payload, playlist.name)
      let sharedSuccessfully = false
      try {
        const shareResult = await Share.share({
          title: '导出歌单',
          url: fileUri,
          message: Platform.OS === 'ios'
            ? undefined
            : `歌单导出文件：${fileUri}`,
        })
        sharedSuccessfully = shareResult.action === Share.sharedAction
      } catch (shareError) {
        console.warn('Export share failed:', shareError)
      }

      if (!sharedSuccessfully) {
        return
      }

      Alert.alert(
        '导出成功',
        `已生成可导入 JSON 文件：\n${fileUri}\n\n可通过系统分享面板发送或保存该文件。`,
      )
    } catch (error) {
      Alert.alert('导出失败', error instanceof Error ? error.message : '导出歌单失败')
    }
  }, [writePlaylistExportFile])

  const handleFavoritePlaylist = useCallback((playlist: Playlist) => {
    if (playlist.source !== 'network') {
      return
    }

    const platform = getPlaylistPlatformCode(playlist) || '网络'
    const now = Date.now()
    const importedPlaylist: Playlist = {
      id: createPlaylistId(),
      name: ensureUniqueName(playlist.name),
      description: playlist.description || `收藏自 ${platform}·网络歌单`,
      coverUrl: playlist.coverUrl,
      source: 'imported',
      tracks: playlist.tracks.map((track) => ({ ...track })),
      createdAt: now,
      updatedAt: now,
    }
    savePlaylist(importedPlaylist, true)
    Alert.alert('收藏成功', `已将「${importedPlaylist.name}」导入为自定义歌单`)
  }, [ensureUniqueName, savePlaylist])

  const handleDetailQuickAction = useCallback((action: 'comment' | 'search') => {
    if (action === 'search') {
      Alert.alert('提示', '歌单内搜索功能即将上线')
      return
    }
    Alert.alert('提示', '评论功能正在规划中')
  }, [])

  const renderDetailTrackItem = useCallback(({ item, index }: { item: Track; index: number }) => {
    const isCurrent = currentTrack?.id === item.id
    const rowCover = String(item.coverUrl || item.picUrl || '').trim()
    return (
      <Pressable
        style={({ pressed }) => [
          styles.detailTrackRow,
          {
            backgroundColor: isCurrent
              ? (isDark ? 'rgba(255,191,104,0.16)' : 'rgba(201,128,41,0.12)')
              : 'transparent',
            opacity: pressed ? 0.88 : 1,
          },
        ]}
        onPress={() => onTrackPress?.(item)}
      >
        <View style={styles.detailTrackIndex}>
          {isCurrent
            ? <Ionicons name={isPlaying ? 'volume-high' : 'pause'} size={16} color={colors.accent} />
            : <Text style={[styles.detailTrackIndexText, { color: colors.textTertiary }]}>{index + 1}</Text>}
        </View>
        <View style={[styles.detailTrackCover, { backgroundColor: colors.surfaceSecondary }]}>
          {rowCover
            ? <Image source={{ uri: rowCover }} style={styles.detailTrackCoverImage} resizeMode="cover" />
            : <Ionicons name="musical-note" size={15} color={colors.textTertiary} />}
        </View>
        <View style={styles.detailTrackInfo}>
          <Text
            numberOfLines={1}
            style={[
              styles.detailTrackTitle,
              { color: isCurrent ? colors.accent : colors.text },
            ]}
          >
            {item.title || '未知歌曲'}
          </Text>
          <Text numberOfLines={1} style={[styles.detailTrackMeta, { color: colors.textSecondary }]}>
            {item.artist || '未知歌手'}
            {item.album ? ` · ${item.album}` : ''}
          </Text>
        </View>
        <Pressable
          style={styles.detailTrackMore}
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation?.()
            onTrackMorePress?.(item, { playlistId: selectedPlaylistId || undefined })
          }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={colors.textTertiary} />
        </Pressable>
      </Pressable>
    )
  }, [colors.accent, colors.surfaceSecondary, colors.text, colors.textSecondary, colors.textTertiary, currentTrack?.id, isDark, isPlaying, onTrackMorePress, onTrackPress, selectedPlaylistId])

  const renderPlaylistCard = useCallback(({ item }: { item: Playlist }) => {
    const isCurrent = item.id === currentPlaylistId
    const coverUrl = getPlaylistCover(item)
    const sourceLabel = getPlaylistDisplayLabel(item)
    return (
      <Pressable
        style={({ pressed }) => [
          styles.playlistCard,
          {
            backgroundColor: isCurrent
              ? (isDark ? 'rgba(184,125,67,0.28)' : '#FFF1E0')
              : colors.surface,
            borderColor: isCurrent
              ? (isDark ? 'rgba(255,196,128,0.5)' : '#E3BA8D')
              : colors.separator,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        onPress={() => openPlaylistDetail(item.id)}
      >
        <View style={styles.playlistCardHeader}>
          <View style={[styles.coverPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
            {coverUrl
              ? <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
              : <Ionicons name="albums-outline" size={22} color={colors.textSecondary} />}
          </View>
          <View style={styles.playlistMeta}>
            <Text style={[styles.playlistName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.playlistDesc, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.description || '未填写描述'}
            </Text>
            <View style={styles.playlistMetaRow}>
              <Text style={[styles.playlistMetaText, { color: colors.textSecondary }]}>{sourceLabel}</Text>
              <Text style={[styles.playlistMetaDot, { color: colors.textTertiary }]}>·</Text>
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
            onPressIn={(event) => event.stopPropagation?.()}
            onPress={(event) => {
              event.stopPropagation?.()
              handleDeletePlaylist(item)
            }}
          >
            <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.playlistActions}>
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
  }, [colors.accent, colors.separator, colors.surface, colors.surfaceSecondary, colors.text, colors.textSecondary, colors.textTertiary, currentPlaylistId, handleDeletePlaylist, handlePlayAll, isDark, openPlaylistDetail])

  const renderMain = () => (
    <FlatList
      ref={mainListRef}
      onScroll={handleMainListScroll}
      scrollEventThrottle={16}
      data={playlists}
      keyExtractor={(item) => item.id}
      renderItem={renderPlaylistCard}
      contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}
      ListHeaderComponent={(
        <>
          <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
            <Text style={[styles.largeTitle, { color: colors.text }]}>歌单</Text>
            <Text style={[styles.headerDesc, { color: colors.textSecondary }]}>管理与导入你的音乐收藏</Text>
          </View>

          <LinearGradient
            colors={isDark ? ['#5A3B1E', '#3F2A17'] : ['#B57A3B', '#8C5B2B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroMain}>
                <Text style={styles.heroTitle}>我的音乐库</Text>
                <Text style={styles.heroSubtitle}>
                  {playlists.length} 个歌单 · {totalTracks} 首歌曲
                </Text>
              </View>
              <View style={styles.heroBadge}>
                <Ionicons name="musical-notes-outline" size={14} color="#FDF4E7" />
                <Text style={styles.heroBadgeText}>{currentPlaylistId ? '已选择当前歌单' : '未选择当前歌单'}</Text>
              </View>
            </View>

            <View style={styles.heroActionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.heroPrimaryAction,
                  { opacity: pressed ? 0.84 : 1 },
                ]}
                onPress={() => setShowCreateModal(true)}
              >
                <Ionicons name="add-circle-outline" size={18} color="#5A3A1A" />
                <Text style={styles.heroPrimaryActionText}>新建歌单</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.heroSecondaryAction,
                  { opacity: pressed ? 0.84 : 1 },
                ]}
                onPress={() => setShowImportModal(true)}
              >
                <Ionicons name="download-outline" size={17} color="#FDF4E7" />
                <Text style={styles.heroSecondaryActionText}>导入歌单</Text>
              </Pressable>
            </View>
          </LinearGradient>
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
    const detailCover = getPlaylistCover(selectedPlaylist)
    const sourceLabel = getPlaylistDisplayLabel(selectedPlaylist)
    const canFavoritePlaylist = false
    const detailHeroColors = buildCoverGradientColors(detailCover, isDark)
    const normalizedDescription = String(selectedPlaylist.description || '').trim()
    const detailHint = /网络歌单导入/i.test(normalizedDescription) ? '' : normalizedDescription

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
          ref={detailListRef}
          onScroll={handleDetailListScroll}
          scrollEventThrottle={16}
          data={detailVisibleTracks}
          keyExtractor={(item, index) => `${item.id}_${index}`}
          onEndReachedThreshold={0.35}
          onEndReached={handleLoadMoreDetailTracks}
          initialNumToRender={18}
          maxToRenderPerBatch={24}
          windowSize={9}
          removeClippedSubviews
          updateCellsBatchingPeriod={40}
          ListHeaderComponent={(
            <>
              <LinearGradient
                colors={detailHeroColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.detailHero}
              >
                <View style={[styles.detailHeader, { paddingTop: insets.top + spacing.sm }]}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.backButton,
                      { backgroundColor: 'rgba(255,255,255,0.18)', opacity: pressed ? 0.82 : 1 },
                    ]}
                    onPress={closePlaylistDetail}
                  >
                    <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
                  </Pressable>
                </View>

                <View style={styles.detailHeroMain}>
                  <View style={styles.detailCoverOuter}>
                    <View style={[styles.detailCover, styles.detailHeroCover, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                      {detailCover
                        ? <Image source={{ uri: detailCover }} style={styles.detailCoverImage} resizeMode="cover" />
                        : <Ionicons name="albums-outline" size={32} color="#FFFFFF" />}
                    </View>
                  </View>

                  <View style={styles.detailHeroText}>
                    <Text style={styles.detailHeroTitle} numberOfLines={2}>{selectedPlaylist.name}</Text>
                    <View style={styles.detailHeroBottomInfo}>
                      <Text style={styles.detailHeroMeta} numberOfLines={1}>
                        {sourceLabel} · {selectedPlaylist.tracks.length} 首
                      </Text>
                      <Text style={styles.detailHeroMeta} numberOfLines={1}>
                        更新于 {formatUpdatedAt(selectedPlaylist.updatedAt)}
                      </Text>
                      {!!detailHint && (
                        <Text style={styles.detailHeroHint} numberOfLines={2}>
                          {detailHint}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                <View style={styles.detailHeroActionRow}>
                  <Pressable
                    style={({ pressed }) => [styles.detailActionCapsule, { opacity: pressed ? 0.84 : 1 }]}
                    onPress={() => { void handleExportPlaylist(selectedPlaylist) }}
                  >
                    <Ionicons name="download-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.detailActionCapsuleText}>导出</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.detailActionCapsule, { opacity: pressed ? 0.84 : 1 }]}
                    onPress={() => handleDetailQuickAction('comment')}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.detailActionCapsuleText}>评论</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.detailActionCapsule,
                      !canFavoritePlaylist && styles.detailActionCapsuleDisabled,
                      { opacity: canFavoritePlaylist ? (pressed ? 0.84 : 1) : 0.56 },
                    ]}
                    onPress={() => handleFavoritePlaylist(selectedPlaylist)}
                    disabled={!canFavoritePlaylist}
                  >
                    <Ionicons name="bookmark-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.detailActionCapsuleText}>
                      {canFavoritePlaylist ? '收藏' : '已收藏'}
                    </Text>
                  </Pressable>
                </View>
              </LinearGradient>

              <View style={[styles.detailPlayCard, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
                <View style={styles.detailPlayMain}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.detailPlayRoundBtn,
                      { backgroundColor: colors.accent, opacity: pressed ? 0.84 : 1 },
                    ]}
                    onPress={() => handlePlayAll(selectedPlaylist)}
                  >
                    <Ionicons name="play" size={20} color="#FFFFFF" />
                  </Pressable>

                  <View style={styles.detailPlayTextWrap}>
                    <Text style={[styles.detailPlayTitle, { color: colors.text }]}>播放全部</Text>
                    <Text style={[styles.detailPlaySubTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {selectedPlaylist.tracks.length} 首 · {sourceLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailPlayTools}>
                  <Pressable
                    style={({ pressed }) => [styles.detailToolBtn, { opacity: pressed ? 0.82 : 1 }]}
                    onPress={() => handleDetailQuickAction('search')}
                  >
                    <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.detailToolBtn, { opacity: pressed ? 0.82 : 1 }]}
                    onPress={() => Alert.alert('提示', '排序功能即将上线')}
                  >
                    <Ionicons name="reorder-three-outline" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>

              {currentTrack && (
                <View style={styles.detailContinueRow}>
                  <Ionicons name="play-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.detailContinueText, { color: colors.textSecondary }]} numberOfLines={1}>
                    继续播放：{currentTrack.title}
                  </Text>
                </View>
              )}
              <View style={styles.detailListHeaderRow}>
                <Text style={[styles.detailListHeaderTitle, { color: colors.text }]}>歌曲列表</Text>
                <Text style={[styles.detailListHeaderMeta, { color: colors.textSecondary }]}>
                  共 {selectedPlaylist.tracks.length} 首
                </Text>
              </View>
            </>
          )}
          ListFooterComponent={hasMoreDetailTracks ? (
            <View style={styles.detailListFooter}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.detailListFooterText, { color: colors.textSecondary }]}>
                正在加载更多歌曲…
              </Text>
            </View>
          ) : null}
          contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.lg }}
          renderItem={renderDetailTrackItem}
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
                        opacity: importLoading ? 0.55 : (pressed ? 0.86 : 1),
                      },
                    ]}
                    disabled={importLoading}
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
              editable={!importLoading}
              style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: colors.surfaceSecondary, opacity: importLoading ? 0.55 : (pressed ? 0.84 : 1) },
                ]}
                onPress={closeNetworkImportModal}
                disabled={importLoading}
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
          {importLoading && (
            <View style={styles.importGuardMask}>
              <View style={[styles.importGuardCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.separator }]}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[styles.importGuardText, { color: colors.textSecondary }]}>歌单导入中，请勿退出</Text>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {importLoading && (
        <View style={styles.loadingMask} pointerEvents="auto">
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
    paddingBottom: spacing.xs,
  },
  largeTitle: {
    fontSize: fontSize.largeTitle,
    fontWeight: '800',
    letterSpacing: 0.25,
  },
  headerDesc: {
    marginTop: 2,
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  heroCard: {
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm + 2,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroMain: {
    flex: 1,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: fontSize.title2,
    fontWeight: '800',
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    color: '#F8E9D8',
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroBadgeText: {
    color: '#FDF4E7',
    fontSize: fontSize.caption2,
    fontWeight: '700',
  },
  heroActionRow: {
    marginTop: spacing.sm + 2,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroPrimaryAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: borderRadius.full,
    backgroundColor: '#FFE5C2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  heroPrimaryActionText: {
    color: '#5A3A1A',
    fontSize: fontSize.subhead,
    fontWeight: '700',
  },
  heroSecondaryAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  heroSecondaryActionText: {
    color: '#FFFFFF',
    fontSize: fontSize.subhead,
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
    marginBottom: spacing.md - 2,
    padding: spacing.md,
    minHeight: 132,
  },
  playlistCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  coverPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  playlistMeta: {
    flex: 1,
  },
  playlistName: {
    fontSize: fontSize.headline,
    fontWeight: '700',
  },
  playlistDesc: {
    marginTop: 3,
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
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
  },
  playlistActions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    minHeight: 40,
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
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  detailHero: {
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    paddingBottom: spacing.md,
    overflow: 'hidden',
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeroMain: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailCoverOuter: {
    width: 114,
    height: 114,
    borderRadius: borderRadius.lg + 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeroCover: {
    width: 106,
    height: 106,
    borderRadius: borderRadius.lg,
  },
  detailHeroText: {
    flex: 1,
    minHeight: 106,
    justifyContent: 'center',
  },
  detailHeroBottomInfo: {
    marginTop: spacing.xs,
  },
  detailHeroTitle: {
    color: '#FFFFFF',
    fontSize: fontSize.title2,
    fontWeight: '700',
  },
  detailHeroMeta: {
    marginTop: 4,
    color: '#F9ECDD',
    fontSize: fontSize.footnote,
    fontWeight: '600',
  },
  detailHeroHint: {
    marginTop: 2,
    color: '#F4E7D8',
    fontSize: fontSize.caption2,
    fontWeight: '600',
  },
  detailHeroActionRow: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  detailActionCapsule: {
    flex: 1,
    minHeight: 38,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  detailActionCapsuleDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  detailActionCapsuleText: {
    color: '#FFFFFF',
    fontSize: fontSize.subhead,
    fontWeight: '700',
  },
  detailPlayCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  detailPlayMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailPlayRoundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailPlayTextWrap: {
    flex: 1,
  },
  detailPlayTitle: {
    fontSize: fontSize.title3,
    fontWeight: '800',
  },
  detailPlaySubTitle: {
    marginTop: 2,
    fontSize: fontSize.footnote,
  },
  detailPlayTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailToolBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCover: {
    width: 68,
    height: 68,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  detailCoverImage: {
    width: '100%',
    height: '100%',
  },
  detailContinueRow: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailContinueText: {
    flex: 1,
    fontSize: fontSize.footnote,
    fontWeight: '600',
  },
  detailListHeaderRow: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailListHeaderTitle: {
    fontSize: fontSize.callout,
    fontWeight: '700',
  },
  detailListHeaderMeta: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  detailListFooter: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  detailListFooterText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  detailTrackRow: {
    height: 66,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailTrackIndex: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTrackIndexText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  detailTrackCover: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginLeft: spacing.xs,
    marginRight: spacing.sm,
  },
  detailTrackCoverImage: {
    width: '100%',
    height: '100%',
  },
  detailTrackInfo: {
    flex: 1,
  },
  detailTrackTitle: {
    fontSize: fontSize.callout,
    fontWeight: '600',
  },
  detailTrackMeta: {
    marginTop: spacing.xs,
    fontSize: fontSize.caption1,
  },
  detailTrackMore: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
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
  importGuardMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  importGuardCard: {
    minHeight: 44,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  importGuardText: {
    fontSize: fontSize.caption1,
    fontWeight: '700',
  },
  loadingMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadingCard: {
    minHeight: 44,
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
