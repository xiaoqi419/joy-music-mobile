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
  // ikun music source specific fields
  source?: string
  songmid?: string
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

export interface AppConfig {
  theme: 'light' | 'dark'
  language: string
  cachePath: string
  maxCacheSize: number
}
