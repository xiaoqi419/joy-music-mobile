/**
 * Expo Audio based music player implementation.
 * Keeps the original public interface to avoid touching controller callers.
 */

import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { Track } from '../../types/music'

export interface PlayerConfig {
  volume?: number
  playbackRate?: number
  shouldPlay?: boolean
}

export interface PlaybackStatus {
  isLoaded: boolean
  isPlaying: boolean
  didJustFinish: boolean
  durationMillis: number
  positionMillis: number
  rate: number
  volume: number
}

class ExpoAudioPlayerWrapper {
  private player: AudioPlayer | null = null
  private isInitialized = false
  private currentTrack: Track | null = null
  private statusUpdateCallback: ((status: PlaybackStatus) => void) | null = null
  private statusSubscription: { remove: () => void } | null = null

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    })
    this.isInitialized = true
    console.log('[ExpoAudioPlayer] Initialized')
  }

  async play(track: Track, url: string, config?: PlayerConfig): Promise<void> {
    if (!this.isInitialized) await this.initialize()

    if (!this.player) {
      this.player = createAudioPlayer(
        { uri: url },
        { updateInterval: 250, keepAudioSessionActive: true }
      )
      this.statusSubscription = this.player.addListener('playbackStatusUpdate', (status) => {
        this.handlePlaybackStatusUpdate(status)
      })
    } else {
      this.player.replace({ uri: url })
    }

    this.player.volume = Math.max(0, Math.min(1, config?.volume ?? 1))
    this.player.setPlaybackRate(config?.playbackRate ?? 1, 'high')
    this.currentTrack = track

    if (config?.shouldPlay ?? true) {
      this.player.play()
    }
  }

  async pause(): Promise<void> {
    if (!this.player) return
    this.player.pause()
  }

  async resume(): Promise<void> {
    if (!this.player) return
    this.player.play()
  }

  async stop(): Promise<void> {
    if (!this.player) return
    try {
      this.player.pause()
      await this.player.seekTo(0)
    } finally {
      this.statusSubscription?.remove()
      this.statusSubscription = null
      this.player.remove()
      this.player = null
      this.currentTrack = null
    }
  }

  async seek(positionMillis: number): Promise<void> {
    if (!this.player) return
    await this.player.seekTo(Math.max(0, positionMillis) / 1000)
  }

  async setVolume(volume: number): Promise<void> {
    if (!this.player) return
    this.player.volume = Math.max(0, Math.min(1, volume))
  }

  async setRate(rate: number): Promise<void> {
    if (!this.player) return
    this.player.setPlaybackRate(rate, 'high')
  }

  async getStatus(): Promise<PlaybackStatus | null> {
    if (!this.player) return null
    const s = this.player.currentStatus
    return {
      isLoaded: s.isLoaded,
      isPlaying: s.playing,
      didJustFinish: s.didJustFinish ?? false,
      durationMillis: Math.max(0, Math.round((s.duration || 0) * 1000)),
      positionMillis: Math.max(0, Math.round((s.currentTime || 0) * 1000)),
      rate: s.playbackRate ?? 1,
      volume: this.player.volume ?? 1,
    }
  }

  setStatusCallback(callback: (status: PlaybackStatus) => void): void {
    this.statusUpdateCallback = callback
  }

  getCurrentTrack(): Track | null {
    return this.currentTrack
  }

  private handlePlaybackStatusUpdate(status: any): void {
    const payload: PlaybackStatus = {
      isLoaded: !!status?.isLoaded,
      isPlaying: !!status?.playing,
      didJustFinish: !!status?.didJustFinish,
      durationMillis: Math.max(0, Math.round((status?.duration || 0) * 1000)),
      positionMillis: Math.max(0, Math.round((status?.currentTime || 0) * 1000)),
      rate: status?.playbackRate ?? 1,
      volume: this.player?.volume ?? 1,
    }
    this.statusUpdateCallback?.(payload)
  }

  isLoaded(): boolean {
    return !!this.player && !!this.player.isLoaded
  }
}

export const expoAVPlayer = new ExpoAudioPlayerWrapper()
