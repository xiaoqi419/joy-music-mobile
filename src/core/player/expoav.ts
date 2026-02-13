/**
 * Expo-AV based music player implementation
 * Handles playback control using expo-av library
 * iOS compatible
 */

import { Audio } from 'expo-av'
import { Track } from '../../types/music'

export interface PlayerConfig {
  volume?: number
  playbackRate?: number
  shouldPlay?: boolean
}

export interface PlaybackStatus {
  isLoaded: boolean
  isPlaying: boolean
  isDonePlay: boolean
  durationMillis: number
  positionMillis: number
  rate: number
  volume: number
}

/**
 * Music player using expo-av
 * Handles all audio playback operations
 */
class ExpoAVPlayer {
  private sound: Audio.Sound | null = null
  private isInitialized: boolean = false
  private currentTrack: Track | null = null
  private statusUpdateCallback: ((status: PlaybackStatus) => void) | null = null

  /**
   * Initialize audio session (iOS requires this)
   */
  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        return
      }

      // Set audio mode for iOS
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionHandlingIOS: Audio.INTERRUPTION_MODE_IOS_DUCK_OTHERS,
      })

      this.isInitialized = true
      console.log('[ExpoAVPlayer] Initialized')
    } catch (error) {
      console.error('[ExpoAVPlayer] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Load and play a track
   */
  async play(track: Track, url: string, config?: PlayerConfig): Promise<void> {
    try {
      // Initialize if needed
      if (!this.isInitialized) {
        await this.initialize()
      }

      // Unload previous sound
      if (this.sound) {
        try {
          await this.sound.unloadAsync()
        } catch (error) {
          console.warn('[ExpoAVPlayer] Error unloading previous sound:', error)
        }
      }

      console.log(`[ExpoAVPlayer] Loading track: ${track.title}`)

      // Create new sound object
      const sound = new Audio.Sound()

      // Set up status update callback
      sound.setOnPlaybackStatusUpdate(this.handlePlaybackStatusUpdate.bind(this))

      // Load audio file
      await sound.loadAsync(
        { uri: url },
        {
          volume: config?.volume ?? 1.0,
          rate: config?.playbackRate ?? 1.0,
          shouldPlay: false,
        }
      )

      this.sound = sound
      this.currentTrack = track

      // Start playback if requested
      if (config?.shouldPlay ?? true) {
        await sound.playAsync()
        console.log(`[ExpoAVPlayer] Playing: ${track.title}`)
      }
    } catch (error) {
      console.error('[ExpoAVPlayer] Error playing track:', error)
      throw error
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.pauseAsync()
        console.log('[ExpoAVPlayer] Paused')
      }
    } catch (error) {
      console.error('[ExpoAVPlayer] Error pausing:', error)
      throw error
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.playAsync()
        console.log('[ExpoAVPlayer] Resumed')
      }
    } catch (error) {
      console.error('[ExpoAVPlayer] Error resuming:', error)
      throw error
    }
  }

  /**
   * Stop playback and unload
   */
  async stop(): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.stopAsync()
        await this.sound.unloadAsync()
        this.sound = null
        this.currentTrack = null
        console.log('[ExpoAVPlayer] Stopped')
      }
    } catch (error) {
      console.error('[ExpoAVPlayer] Error stopping:', error)
      throw error
    }
  }

  /**
   * Seek to specific time
   */
  async seek(positionMillis: number): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.setPositionAsync(positionMillis)
        console.log(`[ExpoAVPlayer] Seeked to ${positionMillis}ms`)
      }
    } catch (error) {
      console.error('[ExpoAVPlayer] Error seeking:', error)
      throw error
    }
  }

  /**
   * Set volume (0 to 1)
   */
  async setVolume(volume: number): Promise<void> {
    try {
      const normalizedVolume = Math.max(0, Math.min(1, volume))
      if (this.sound) {
        await this.sound.setVolumeAsync(normalizedVolume)
        console.log(`[ExpoAVPlayer] Volume set to ${normalizedVolume}`)
      }
    } catch (error) {
      console.error('[ExpoAVPlayer] Error setting volume:', error)
      throw error
    }
  }

  /**
   * Set playback rate
   */
  async setRate(rate: number): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.setRateAsync(rate, true)
        console.log(`[ExpoAVPlayer] Rate set to ${rate}`)
      }
    } catch (error) {
      console.error('[ExpoAVPlayer] Error setting rate:', error)
      throw error
    }
  }

  /**
   * Get current playback status
   */
  async getStatus(): Promise<PlaybackStatus | null> {
    try {
      if (!this.sound) {
        return null
      }

      const status = await this.sound.getStatusAsync()

      if (!status.isLoaded) {
        return null
      }

      return {
        isLoaded: status.isLoaded,
        isPlaying: status.isPlaying,
        isDonePlay: status.isDonePlay,
        durationMillis: status.durationMillis ?? 0,
        positionMillis: status.positionMillis ?? 0,
        rate: status.rate ?? 1.0,
        volume: status.volume ?? 1.0,
      }
    } catch (error) {
      console.error('[ExpoAVPlayer] Error getting status:', error)
      return null
    }
  }

  /**
   * Set status update callback
   */
  setStatusCallback(callback: (status: PlaybackStatus) => void): void {
    this.statusUpdateCallback = callback
  }

  /**
   * Get current track
   */
  getCurrentTrack(): Track | null {
    return this.currentTrack
  }

  /**
   * Internal: Handle playback status updates
   */
  private handlePlaybackStatusUpdate(status: any): void {
    if (!status.isLoaded) {
      return
    }

    const playbackStatus: PlaybackStatus = {
      isLoaded: status.isLoaded,
      isPlaying: status.isPlaying,
      isDonePlay: status.isDonePlay,
      durationMillis: status.durationMillis ?? 0,
      positionMillis: status.positionMillis ?? 0,
      rate: status.rate ?? 1.0,
      volume: status.volume ?? 1.0,
    }

    // Call callback if set
    if (this.statusUpdateCallback) {
      this.statusUpdateCallback(playbackStatus)
    }
  }

  /**
   * Check if player has a sound loaded
   */
  isLoaded(): boolean {
    return this.sound !== null && this.isInitialized
  }
}

export const expoAVPlayer = new ExpoAVPlayer()
