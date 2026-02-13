/**
 * High-level player controller
 * Orchestrates music source and expo-av player
 * Handles playback workflows
 */

import { Track, PlayerState } from '../../types/music'
import musicManager, { Quality } from '../music'
import { expoAVPlayer, PlaybackStatus } from './expoav'

export interface PlaybackConfig {
  quality?: Quality
  autoPlay?: boolean
  statusCallback?: (status: PlaybackStatus) => void
}

/**
 * Main music player controller
 */
class MusicPlayerController {
  private playlist: Track[] = []
  private currentIndex: number = -1
  private isPlaying: boolean = false
  private currentTrack: Track | null = null
  private statusCallbacks: Set<(status: PlaybackStatus) => void> = new Set()
  private preferredQuality: Quality = '320k'

  constructor() {
    // Set up expo-av player status updates
    expoAVPlayer.setStatusCallback(this.handlePlayerStatusUpdate.bind(this))
  }

  /**
   * Initialize player
   */
  async initialize(): Promise<void> {
    try {
      await expoAVPlayer.initialize()
      console.log('[PlayerController] Initialized')
    } catch (error) {
      console.error('[PlayerController] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Play a track
   */
  async playTrack(track: Track, config?: PlaybackConfig): Promise<void> {
    try {
      console.log(`[PlayerController] Playing track: ${track.title}`)

      // Get playback URL from music manager
      const url = await musicManager.getMusicPlayUrl(
        track,
        config?.quality || this.preferredQuality
      )

      // Play through expo-av
      await expoAVPlayer.play(track, url, {
        shouldPlay: config?.autoPlay ?? true,
        volume: 1.0,
      })

      this.currentTrack = track
      this.isPlaying = true

      // Set status callback if provided
      if (config?.statusCallback) {
        this.statusCallbacks.add(config.statusCallback)
      }
    } catch (error) {
      console.error('[PlayerController] Error playing track:', error)
      throw error
    }
  }

  /**
   * Play from playlist at specific index
   */
  async playFromPlaylist(playlist: Track[], index: number, config?: PlaybackConfig): Promise<void> {
    try {
      if (index < 0 || index >= playlist.length) {
        throw new Error('Invalid playlist index')
      }

      this.playlist = playlist
      this.currentIndex = index

      await this.playTrack(playlist[index], config)
    } catch (error) {
      console.error('[PlayerController] Error playing from playlist:', error)
      throw error
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    try {
      await expoAVPlayer.pause()
      this.isPlaying = false
      console.log('[PlayerController] Paused')
    } catch (error) {
      console.error('[PlayerController] Error pausing:', error)
      throw error
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    try {
      await expoAVPlayer.resume()
      this.isPlaying = true
      console.log('[PlayerController] Resumed')
    } catch (error) {
      console.error('[PlayerController] Error resuming:', error)
      throw error
    }
  }

  /**
   * Play next track
   */
  async playNext(): Promise<void> {
    try {
      if (this.playlist.length === 0) {
        throw new Error('No playlist set')
      }

      // Simple sequential playback
      this.currentIndex = (this.currentIndex + 1) % this.playlist.length

      await this.playTrack(this.playlist[this.currentIndex])
    } catch (error) {
      console.error('[PlayerController] Error playing next:', error)
      throw error
    }
  }

  /**
   * Play previous track
   */
  async playPrevious(): Promise<void> {
    try {
      if (this.playlist.length === 0) {
        throw new Error('No playlist set')
      }

      this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length

      await this.playTrack(this.playlist[this.currentIndex])
    } catch (error) {
      console.error('[PlayerController] Error playing previous:', error)
      throw error
    }
  }

  /**
   * Stop playback
   */
  async stop(): Promise<void> {
    try {
      await expoAVPlayer.stop()
      this.isPlaying = false
      this.currentTrack = null
      console.log('[PlayerController] Stopped')
    } catch (error) {
      console.error('[PlayerController] Error stopping:', error)
      throw error
    }
  }

  /**
   * Seek to position (in milliseconds)
   */
  async seek(positionMillis: number): Promise<void> {
    try {
      await expoAVPlayer.seek(positionMillis)
    } catch (error) {
      console.error('[PlayerController] Error seeking:', error)
      throw error
    }
  }

  /**
   * Set volume (0 to 1)
   */
  async setVolume(volume: number): Promise<void> {
    try {
      await expoAVPlayer.setVolume(volume)
    } catch (error) {
      console.error('[PlayerController] Error setting volume:', error)
      throw error
    }
  }

  /**
   * Set playback rate
   */
  async setRate(rate: number): Promise<void> {
    try {
      await expoAVPlayer.setRate(rate)
    } catch (error) {
      console.error('[PlayerController] Error setting rate:', error)
      throw error
    }
  }

  /**
   * Set preferred quality for playback
   */
  setPreferredQuality(quality: Quality): void {
    this.preferredQuality = quality
    console.log(`[PlayerController] Preferred quality set to: ${quality}`)
  }

  /**
   * Get current playback state
   */
  getPlayerState(): PlayerState {
    return {
      currentTrack: this.currentTrack,
      isPlaying: this.isPlaying,
      currentTime: 0, // Will be updated via status callback
      duration: 0,
      playlist: this.playlist,
      currentIndex: this.currentIndex,
      volume: 1.0,
      repeatMode: 'off',
      shuffleMode: false,
    }
  }

  /**
   * Get current track
   */
  getCurrentTrack(): Track | null {
    return this.currentTrack
  }

  /**
   * Set playlist
   */
  setPlaylist(playlist: Track[]): void {
    this.playlist = playlist
    this.currentIndex = -1
    console.log(`[PlayerController] Playlist set with ${playlist.length} tracks`)
  }

  /**
   * Register status callback
   */
  onStatusUpdate(callback: (status: PlaybackStatus) => void): () => void {
    this.statusCallbacks.add(callback)
    // Return unsubscribe function
    return () => {
      this.statusCallbacks.delete(callback)
    }
  }

  /**
   * Internal: Handle player status updates
   */
  private handlePlayerStatusUpdate(status: PlaybackStatus): void {
    // Broadcast to all registered callbacks
    for (const callback of this.statusCallbacks) {
      try {
        callback(status)
      } catch (error) {
        console.error('[PlayerController] Error in status callback:', error)
      }
    }
  }

  /**
   * Change music source
   */
  changeSource(sourceId: string): boolean {
    return musicManager.changeSource(sourceId)
  }

  /**
   * Get available sources
   */
  getAvailableSources() {
    return musicManager.getAvailableSources()
  }

  /**
   * Get current source
   */
  getCurrentSource(): string {
    return musicManager.getCurrentSource()
  }
}

export const playerController = new MusicPlayerController()
