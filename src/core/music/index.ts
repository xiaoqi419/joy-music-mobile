/**
 * Music data management module
 * Handles music sources, URL fetching, and library management
 * Based on lx-music-mobile architecture
 */

import { Track, Playlist } from '../../types/music'
import { musicSourceManager, Quality } from './source'
import { joyMusicSource } from './sources/joy'
import { getMusicUrl, getMusicUrlWithRetry, MusicUrlProgress, MusicUrlRequest } from './url'
import { musicUrlCache, clearAllCache } from './cache'

// Initialize music sources on module load
const initializeMusicSources = () => {
  musicSourceManager.registerSource(joyMusicSource, {
    id: 'joy',
    name: 'Joy Source',
    enabled: true,
    supportedQualities: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
  })

  // Set default source
  musicSourceManager.setCurrentSource('joy')
  console.log('[Music] Music sources initialized')
}

// Initialize sources when module is loaded
initializeMusicSources()

class MusicManager {
  private localLibrary: Track[] = []
  private playlists: Map<string, Playlist> = new Map()

  async initializeLibrary(): Promise<void> {
    // Load local music library from storage
    console.log('[MusicManager] Library initialized')
  }

  async getLocalTracks(): Promise<Track[]> {
    return this.localLibrary
  }

  async addTrack(track: Track): Promise<void> {
    if (!this.localLibrary.find(t => t.id === track.id)) {
      this.localLibrary.push(track)
    }
  }

  async removeTrack(trackId: string): Promise<void> {
    this.localLibrary = this.localLibrary.filter(t => t.id !== trackId)
  }

  async createPlaylist(name: string): Promise<Playlist> {
    const playlist: Playlist = {
      id: Math.random().toString(36).substring(7),
      name,
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.playlists.set(playlist.id, playlist)
    return playlist
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    return this.playlists.get(id) || null
  }

  async getAllPlaylists(): Promise<Playlist[]> {
    return Array.from(this.playlists.values())
  }

  async addTrackToPlaylist(playlistId: string, track: Track): Promise<void> {
    const playlist = this.playlists.get(playlistId)
    if (playlist) {
      if (!playlist.tracks.find(t => t.id === track.id)) {
        playlist.tracks.push(track)
        playlist.updatedAt = Date.now()
      }
    }
  }

  async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    const playlist = this.playlists.get(playlistId)
    if (playlist) {
      playlist.tracks = playlist.tracks.filter(t => t.id !== trackId)
      playlist.updatedAt = Date.now()
    }
  }

  /**
   * Get music URL for playback
   * Handles source selection, caching, and fallback
   */
  async getMusicPlayUrl(
    musicInfo: any,
    quality?: Quality,
    isRefresh?: boolean,
    onProgress?: (progress: MusicUrlProgress) => void
  ): Promise<string> {
    return getMusicUrlWithRetry({
      musicId: musicInfo.id || musicInfo.songmid || musicInfo.hash,
      musicInfo,
      quality: quality || 'master',
      isRefresh,
      onProgress,
    }).then(response => response.url)
  }

  /**
   * Change music source
   */
  changeSource(sourceId: string): boolean {
    const success = musicSourceManager.setCurrentSource(sourceId)
    if (success) {
      console.log(`[MusicManager] Source changed to: ${sourceId}`)
    }
    return success
  }

  /**
   * Get all available sources
   */
  getAvailableSources() {
    return musicSourceManager.getAllSources()
  }

  /**
   * Get current source
   */
  getCurrentSource() {
    return musicSourceManager.getCurrentSourceId()
  }

  /**
   * Clear all cache
   */
  async clearCache(): Promise<void> {
    await clearAllCache()
  }
}

export default new MusicManager()
export { musicSourceManager, getMusicUrl, getMusicUrlWithRetry }
export type { Quality, MusicSourceInfo, MusicSourceAPI } from './source'
