import AsyncStorage from '@react-native-async-storage/async-storage'
import { Playlist, Track } from '../../types/music'

const PLAYLIST_SETTINGS_KEY = '@joy_playlist_settings'

export interface PlaylistSettingsSnapshot {
  playlists: Playlist[]
  currentPlaylistId: string | null
}

const DEFAULT_PLAYLIST_SETTINGS: PlaylistSettingsSnapshot = {
  playlists: [],
  currentPlaylistId: null,
}

let settingsCache: PlaylistSettingsSnapshot | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function normalizeTrack(input: any, index: number): Track {
  const idSeed = String(input?.id || input?.songmid || input?.hash || `track_${index}`)
  return {
    id: idSeed,
    title: String(input?.title || input?.name || '未知歌曲'),
    artist: String(input?.artist || input?.singer || '未知歌手'),
    album: input?.album ? String(input.album) : undefined,
    duration: Number(input?.duration || 0),
    url: String(input?.url || ''),
    coverUrl: input?.coverUrl ? String(input.coverUrl) : (input?.img ? String(input.img) : undefined),
    source: input?.source ? String(input.source) : undefined,
    songmid: input?.songmid ? String(input.songmid) : undefined,
    copyrightId: input?.copyrightId ? String(input.copyrightId) : undefined,
    hash: input?.hash ? String(input.hash) : undefined,
    picUrl: input?.picUrl ? String(input.picUrl) : undefined,
  }
}

function normalizePlaylist(input: any, index: number): Playlist {
  const tracksRaw = Array.isArray(input?.tracks) ? input.tracks : []
  const tracks = tracksRaw.map((track, trackIndex) => normalizeTrack(track, trackIndex))
  const now = Date.now()
  return {
    id: String(input?.id || `playlist_${now}_${index}`),
    name: String(input?.name || '未命名歌单'),
    description: input?.description ? String(input.description) : undefined,
    coverUrl: input?.coverUrl ? String(input.coverUrl) : undefined,
    source: input?.source === 'network' || input?.source === 'imported' ? input.source : 'local',
    tracks,
    createdAt: Number(input?.createdAt || now),
    updatedAt: Number(input?.updatedAt || now),
  }
}

function sanitizeSnapshot(raw: any): PlaylistSettingsSnapshot {
  const playlists = Array.isArray(raw?.playlists)
    ? raw.playlists.map((item: any, index: number) => normalizePlaylist(item, index))
    : []
  const currentPlaylistId = raw?.currentPlaylistId ? String(raw.currentPlaylistId) : null
  const currentExists = currentPlaylistId && playlists.some((item) => item.id === currentPlaylistId)
  return {
    playlists,
    currentPlaylistId: currentExists ? currentPlaylistId : null,
  }
}

export async function loadPlaylistSettings(): Promise<PlaylistSettingsSnapshot> {
  if (settingsCache) return settingsCache
  try {
    const raw = await AsyncStorage.getItem(PLAYLIST_SETTINGS_KEY)
    if (!raw) {
      settingsCache = { ...DEFAULT_PLAYLIST_SETTINGS }
      return settingsCache
    }
    settingsCache = sanitizeSnapshot(JSON.parse(raw))
    return settingsCache
  } catch {
    settingsCache = { ...DEFAULT_PLAYLIST_SETTINGS }
    return settingsCache
  }
}

export function savePlaylistSettings(snapshot: PlaylistSettingsSnapshot): void {
  settingsCache = sanitizeSnapshot(snapshot)
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void AsyncStorage.setItem(PLAYLIST_SETTINGS_KEY, JSON.stringify(settingsCache))
  }, 220)
}
