/**
 * Type definitions for music player
 */

export interface Track {
  id: string
  title: string
  artist: string
  album?: string
  duration: number
  url: string
  coverUrl?: string
  // Joy 音源适配字段
  source?: string
  songmid?: string
  copyrightId?: string
  hash?: string
  picUrl?: string
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: number
  updatedAt: number
}

export interface PlayerState {
  currentTrack: Track | null
  isPlaying: boolean
  currentTime: number
  duration: number
  playlist: Track[]
  currentIndex: number
  volume: number
  repeatMode: 'off' | 'all' | 'one'
  shuffleMode: boolean
}

export interface SearchResult {
  tracks: Track[]
  playlists: Playlist[]
  artists: any[]
}

export type ThemeMode = 'system' | 'light' | 'dark'

export interface AppConfig {
  theme: ThemeMode
  language: string
  cachePath: string
  maxCacheSize: number
}
