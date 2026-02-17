/**
 * High-level player controller
 * Orchestrates music source and expo-audio player
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

export type PlayMode = 'list_once' | 'list_loop' | 'single_loop' | 'shuffle'

/**
 * Main music player controller
 */
class MusicPlayerController {
  private playlist: Track[] = []
  private currentIndex: number = -1
  private isPlaying: boolean = false
  private currentTrack: Track | null = null
  private currentTimeMillis: number = 0
  private durationMillis: number = 0
  private repeatMode: PlayerState['repeatMode'] = 'all'
  private shuffleMode = false
  private isHandlingTrackFinish = false
  private statusCallbacks: Set<(status: PlaybackStatus) => void> = new Set()
  private preferredQuality: Quality = '320k'

  constructor() {
    // Set up player status updates
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

      const existsInQueueIndex = this.playlist.findIndex(t => t.id === track.id)
      if (existsInQueueIndex >= 0) {
        this.currentIndex = existsInQueueIndex
      } else if (this.playlist.length === 0) {
        this.playlist = [track]
        this.currentIndex = 0
      }

      // Get playback URL from music manager
      const url = await musicManager.getMusicPlayUrl(
        track,
        config?.quality || this.preferredQuality
      )

      // Play through player engine
      await expoAVPlayer.play(track, url, {
        shouldPlay: config?.autoPlay ?? true,
        volume: 1.0,
      })

      this.currentTrack = track
      this.isPlaying = config?.autoPlay ?? true

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

      this.playlist = [...playlist]
      this.currentIndex = index

      await this.playTrack(this.playlist[index], config)
    } catch (error) {
      console.error('[PlayerController] Error playing from playlist:', error)
      throw error
    }
  }

  /**
   * Insert a track into the global queue and play it immediately.
   * If the track already exists in queue, jump to that item instead of duplicating.
   */
  async insertTrackAndPlay(track: Track, config?: PlaybackConfig): Promise<void> {
    try {
      const existsIndex = this.playlist.findIndex(item => item.id === track.id)
      if (existsIndex >= 0) {
        this.currentIndex = existsIndex
        await this.playTrack(this.playlist[existsIndex], config)
        return
      }

      const insertIndex = this.currentIndex >= 0
        ? Math.min(this.currentIndex + 1, this.playlist.length)
        : this.playlist.length
      const nextQueue = [...this.playlist]
      nextQueue.splice(insertIndex, 0, track)

      this.playlist = nextQueue
      this.currentIndex = insertIndex
      await this.playTrack(track, config)
    } catch (error) {
      console.error('[PlayerController] Error inserting and playing track:', error)
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

      const nextIndex = this.getNextIndex()
      if (nextIndex === null) {
        console.log('[PlayerController] Reached end of queue in list_once mode')
        return
      }
      this.currentIndex = nextIndex

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

      const prevIndex = this.getPreviousIndex()
      if (prevIndex === null) {
        console.log('[PlayerController] Reached start of queue in list_once mode')
        return
      }
      this.currentIndex = prevIndex

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
      currentTime: this.currentTimeMillis,
      duration: this.durationMillis,
      playlist: this.playlist,
      currentIndex: this.currentIndex,
      volume: 1.0,
      repeatMode: this.repeatMode,
      shuffleMode: this.shuffleMode,
    }
  }

  /**
   * Get current track
   */
  getCurrentTrack(): Track | null {
    return this.currentTrack
  }

  /**
   * Get current play mode.
   */
  getPlayMode(): PlayMode {
    if (this.shuffleMode) return 'shuffle'
    if (this.repeatMode === 'all') return 'list_loop'
    if (this.repeatMode === 'one') return 'single_loop'
    return 'list_once'
  }

  /**
   * Set play mode.
   */
  setPlayMode(mode: PlayMode): void {
    switch (mode) {
      case 'list_loop':
        this.repeatMode = 'all'
        this.shuffleMode = false
        break
      case 'single_loop':
        this.repeatMode = 'one'
        this.shuffleMode = false
        break
      case 'shuffle':
        this.repeatMode = 'all'
        this.shuffleMode = true
        break
      case 'list_once':
      default:
        this.repeatMode = 'off'
        this.shuffleMode = false
        break
    }
    console.log(`[PlayerController] Play mode set: ${mode}`)
  }

  /**
   * Cycle play mode and return next mode.
   */
  cyclePlayMode(): PlayMode {
    const modes: PlayMode[] = ['list_once', 'list_loop', 'single_loop', 'shuffle']
    const currentMode = this.getPlayMode()
    const currentIndex = modes.indexOf(currentMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    this.setPlayMode(nextMode)
    return nextMode
  }

  /**
   * Get current playback status from the audio engine
   */
  async getPlaybackStatus(): Promise<PlaybackStatus | null> {
    return expoAVPlayer.getStatus()
  }

  /**
   * Set playlist
   */
  setPlaylist(playlist: Track[]): void {
    this.playlist = [...playlist]
    this.currentIndex = playlist.length ? 0 : -1
    this.currentTrack = playlist.length ? playlist[0] : null
    console.log(`[PlayerController] Playlist set with ${playlist.length} tracks`)
  }

  /**
   * Get queue snapshot.
   */
  getPlaylist(): Track[] {
    return [...this.playlist]
  }

  /**
   * Get current queue index.
   */
  getCurrentIndex(): number {
    return this.currentIndex
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
    this.isPlaying = status.isPlaying
    this.currentTimeMillis = status.positionMillis
    this.durationMillis = status.durationMillis

    if (status.didJustFinish) {
      void this.handleTrackDidFinish()
    }

    // Broadcast to all registered callbacks
    for (const callback of this.statusCallbacks) {
      try {
        callback(status)
      } catch (error) {
        console.error('[PlayerController] Error in status callback:', error)
      }
    }
  }

  private async handleTrackDidFinish(): Promise<void> {
    if (this.isHandlingTrackFinish) return
    if (!this.playlist.length) return

    this.isHandlingTrackFinish = true
    try {
      const nextIndex = this.getNextIndex()
      if (nextIndex === null) {
        this.isPlaying = false
        return
      }
      this.currentIndex = nextIndex
      await this.playTrack(this.playlist[nextIndex], {
        autoPlay: true,
        quality: this.preferredQuality,
      })
    } catch (error) {
      console.error('[PlayerController] Error handling track finish:', error)
    } finally {
      this.isHandlingTrackFinish = false
    }
  }

  private getNextIndex(): number | null {
    if (!this.playlist.length) return null

    if (this.repeatMode === 'one') {
      return this.currentIndex >= 0 ? this.currentIndex : 0
    }

    if (this.shuffleMode) {
      return this.getRandomQueueIndex(this.currentIndex)
    }

    if (this.currentIndex < 0) return 0
    const nextIndex = this.currentIndex + 1
    if (nextIndex < this.playlist.length) return nextIndex

    if (this.repeatMode === 'all') return 0
    return null
  }

  private getPreviousIndex(): number | null {
    if (!this.playlist.length) return null

    if (this.repeatMode === 'one') {
      return this.currentIndex >= 0 ? this.currentIndex : 0
    }

    if (this.shuffleMode) {
      return this.getRandomQueueIndex(this.currentIndex)
    }

    if (this.currentIndex < 0) return 0
    const prevIndex = this.currentIndex - 1
    if (prevIndex >= 0) return prevIndex

    if (this.repeatMode === 'all') return this.playlist.length - 1
    return null
  }

  private getRandomQueueIndex(excludeIndex: number): number {
    if (this.playlist.length <= 1) {
      return this.playlist.length === 1 ? 0 : -1
    }

    let nextIndex = excludeIndex
    while (nextIndex === excludeIndex) {
      nextIndex = Math.floor(Math.random() * this.playlist.length)
    }
    return nextIndex
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
