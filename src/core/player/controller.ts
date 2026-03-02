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

const QUALITY_RETRY_ORDER: Quality[] = [
  'master',
  'atmos_plus',
  'atmos',
  'hires',
  'flac24bit',
  'flac',
  '320k',
  '128k',
]

const PLAYBACK_START_TIMEOUT_MS = 4500
const PLAYBACK_STATUS_POLL_MS = 220

class StalePlayRequestError extends Error {
  constructor() {
    super('stale play request')
    this.name = 'StalePlayRequestError'
  }
}

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
  private preferredQuality: Quality = 'master'
  private currentResolvedQuality: Quality | null = null
  private resolvingCallbacks: Set<(isResolving: boolean) => void> = new Set()
  private resolvingHint = '正在获取可播放链接...'
  private resolvingHintCallbacks: Set<(hint: string) => void> = new Set()
  private resolvedQualityCallbacks: Set<(quality: Quality | null) => void> = new Set()
  private playRequestId = 0
  private resolvingRequestId: number | null = null

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
    const playRequestId = ++this.playRequestId
    this.beginResolveTrackUrl(playRequestId)
    this.setResolvingHintForRequest(playRequestId, '正在获取可播放链接...')
    try {
      console.log(`[PlayerController] Playing track: ${track.title}`)

      const existsInQueueIndex = this.playlist.findIndex(t => t.id === track.id)
      if (existsInQueueIndex >= 0) {
        this.currentIndex = existsInQueueIndex
      } else if (this.playlist.length === 0) {
        this.playlist = [track]
        this.currentIndex = 0
      }

      const shouldAutoPlay = config?.autoPlay ?? true
      const qualityAttempts = this.buildQualityAttempts(config?.quality || this.preferredQuality)
      let lastError: Error | null = null

      for (let index = 0; index < qualityAttempts.length; index += 1) {
        const quality = qualityAttempts[index]
        let resolvedAttemptQuality: Quality | null = null
        let cacheHitAttempt = false
        try {
          this.assertPlayRequestActive(playRequestId)
          this.setResolvingHintForRequest(
            playRequestId,
            `正在尝试 ${quality} 音质（${index + 1}/${qualityAttempts.length}）`
          )
          if (index > 0) {
            this.setResolvingHintForRequest(playRequestId, `当前音质播放失败，正在降级重试 ${quality}...`)
          }
          console.log(
            `[PlayerController] Attempt quality ${quality} (${index + 1}/${qualityAttempts.length})`
          )

          // Get playback URL from music manager
          const playUrlResponse = await musicManager.resolveMusicPlayUrl(
            track,
            quality,
            index > 0,
            (progress) => {
              const qualityProgress = `音质 ${index + 1}/${qualityAttempts.length}`
              this.setResolvingHintForRequest(playRequestId, `${qualityProgress} · ${progress.message}`)
            }
          )
          this.assertPlayRequestActive(playRequestId)
          resolvedAttemptQuality = playUrlResponse.quality
          cacheHitAttempt = Boolean(playUrlResponse.cacheHit)

          // Play through player engine
          await expoAVPlayer.play(track, playUrlResponse.url, {
            shouldPlay: shouldAutoPlay,
            volume: 1.0,
          })
          this.assertPlayRequestActive(playRequestId)

          const started = await this.waitForPlaybackReady(shouldAutoPlay, playRequestId)
          if (!started) {
            throw new Error('音频加载超时，未进入可播放状态')
          }
          this.assertPlayRequestActive(playRequestId)

          this.setCurrentResolvedQuality(playUrlResponse.quality)
          this.currentTrack = track
          this.isPlaying = shouldAutoPlay
          lastError = null
          break
        } catch (error) {
          if (error instanceof StalePlayRequestError) {
            return
          }
          lastError = error instanceof Error ? error : new Error(String(error))
          const qualityLabel = resolvedAttemptQuality && resolvedAttemptQuality !== quality
            ? `${quality} -> ${resolvedAttemptQuality}`
            : quality
          console.warn(
            `[PlayerController] Play attempt failed with quality ${qualityLabel}:`,
            lastError.message
          )
          if (cacheHitAttempt) {
            console.warn(
              `[PlayerController] Cached source failed for ${qualityLabel}, stop quality fallback chain`
            )
            break
          }
          if (playRequestId === this.playRequestId) {
            // 不在降级循环里执行 stop()，避免底层 seek/remove 卡住后导致后续音质不再继续尝试。
            // 下一轮 play() 会通过 replace(url) 覆盖当前流。
            await expoAVPlayer.pause().catch(() => {})
          }
          const nextQuality = qualityAttempts[index + 1]
          if (nextQuality) {
            console.log(`[PlayerController] Retrying with next quality: ${nextQuality}`)
          }

          // If resolver already downgraded this attempt (e.g. master -> flac24bit),
          // skip intermediate attempts that would map to the same resolved quality.
          if (
            playRequestId === this.playRequestId &&
            resolvedAttemptQuality &&
            resolvedAttemptQuality !== quality
          ) {
            const resolvedIndex = qualityAttempts.indexOf(resolvedAttemptQuality)
            if (resolvedIndex > index) {
              index = resolvedIndex
            }
          }
        }
      }

      this.assertPlayRequestActive(playRequestId)
      if (lastError) {
        throw lastError
      }

      // Set status callback if provided
      if (config?.statusCallback) {
        this.statusCallbacks.add(config.statusCallback)
      }
    } catch (error) {
      if (error instanceof StalePlayRequestError) {
        return
      }
      console.error('[PlayerController] Error playing track:', error)
      throw error
    } finally {
      this.endResolveTrackUrl(playRequestId)
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
   * Insert a track to play next in queue.
   * If the track already exists, move it right after current index.
   */
  insertTrackNext(track: Track): number {
    if (!this.playlist.length) {
      this.playlist = [track]
      this.currentIndex = this.currentIndex >= 0 ? this.currentIndex : 0
      if (!this.currentTrack) {
        this.currentTrack = track
      }
      console.log(`[PlayerController] Inserted next track into empty queue: ${track.title}`)
      return 0
    }

    const existsIndex = this.playlist.findIndex(item => item.id === track.id)
    if (existsIndex === this.currentIndex) {
      return existsIndex
    }

    const anchorIndex = this.currentIndex >= 0 ? this.currentIndex : 0
    let insertIndex = Math.min(anchorIndex + 1, this.playlist.length)

    const nextQueue = [...this.playlist]
    if (existsIndex >= 0) {
      const [existingTrack] = nextQueue.splice(existsIndex, 1)
      if (existsIndex < insertIndex) {
        insertIndex -= 1
      }
      nextQueue.splice(insertIndex, 0, existingTrack)
      this.playlist = nextQueue
      console.log(`[PlayerController] Moved track to next: ${track.title}`)
      return insertIndex
    }

    nextQueue.splice(insertIndex, 0, track)
    this.playlist = nextQueue
    console.log(`[PlayerController] Inserted track to next: ${track.title}`)
    return insertIndex
  }

  /**
   * Move a track position inside current queue.
   */
  moveTrackInQueue(fromIndex: number, toIndex: number): boolean {
    if (!this.playlist.length) return false
    if (fromIndex < 0 || toIndex < 0) return false
    if (fromIndex >= this.playlist.length || toIndex >= this.playlist.length) return false
    if (fromIndex === toIndex) return false

    const nextQueue = [...this.playlist]
    const [movingTrack] = nextQueue.splice(fromIndex, 1)
    nextQueue.splice(toIndex, 0, movingTrack)

    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex
    } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
      this.currentIndex -= 1
    } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
      this.currentIndex += 1
    }

    this.playlist = nextQueue
    this.currentTrack = this.currentIndex >= 0 ? this.playlist[this.currentIndex] : null
    console.log(`[PlayerController] Moved queue track from ${fromIndex} to ${toIndex}`)
    return true
  }

  /**
   * Remove a track from queue.
   * If removing current playing track, automatically switch to next available track.
   */
  async removeTrackFromQueue(track: Track): Promise<boolean> {
    const removeIndex = this.playlist.findIndex(item => item.id === track.id)
    if (removeIndex < 0) return false

    const nextQueue = [...this.playlist]
    nextQueue.splice(removeIndex, 1)

    if (nextQueue.length === 0) {
      this.playlist = []
      this.currentIndex = -1
      this.currentTrack = null
      this.isPlaying = false
      this.currentTimeMillis = 0
      this.durationMillis = 0
      this.playRequestId += 1
      this.clearResolveTrackState()
      this.setCurrentResolvedQuality(null)
      await expoAVPlayer.stop().catch(() => {})
      console.log(`[PlayerController] Removed track and cleared queue: ${track.title}`)
      return true
    }

    if (removeIndex < this.currentIndex) {
      this.playlist = nextQueue
      this.currentIndex -= 1
      this.currentTrack = this.playlist[this.currentIndex] || null
      console.log(`[PlayerController] Removed track before current index: ${track.title}`)
      return true
    }

    if (removeIndex > this.currentIndex) {
      this.playlist = nextQueue
      if (this.currentIndex >= this.playlist.length) {
        this.currentIndex = this.playlist.length - 1
      }
      this.currentTrack = this.currentIndex >= 0 ? this.playlist[this.currentIndex] : null
      console.log(`[PlayerController] Removed track from queue: ${track.title}`)
      return true
    }

    // removeIndex === currentIndex
    this.playlist = nextQueue
    const nextIndex = Math.min(removeIndex, this.playlist.length - 1)
    this.currentIndex = nextIndex
    const nextTrack = this.playlist[nextIndex]

    if (this.isPlaying) {
      await this.playTrack(nextTrack, {
        autoPlay: true,
        quality: this.preferredQuality,
      })
    } else {
      this.currentTrack = nextTrack
      this.setCurrentResolvedQuality(null)
    }

    console.log(`[PlayerController] Removed current track: ${track.title}`)
    return true
  }

  /**
   * Clear current playback queue and stop player.
   */
  async clearQueue(): Promise<void> {
    this.playlist = []
    this.currentIndex = -1
    this.currentTrack = null
    this.isPlaying = false
    this.currentTimeMillis = 0
    this.durationMillis = 0
    this.playRequestId += 1
    this.clearResolveTrackState()
    this.setCurrentResolvedQuality(null)
    await expoAVPlayer.stop().catch(() => {})
    console.log('[PlayerController] Queue cleared')
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
      this.playRequestId += 1
      this.clearResolveTrackState()
      await expoAVPlayer.stop()
      this.isPlaying = false
      this.currentTrack = null
      this.setCurrentResolvedQuality(null)
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
    if (this.preferredQuality === quality) return
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

    // 某些失败/替换流场景会出现 didJustFinish 抖动，必须满足“已加载且接近结尾”再自动下一首。
    const isNearEnd = status.durationMillis > 0
      && status.positionMillis >= Math.max(0, status.durationMillis - 800)
    if (status.didJustFinish && status.isLoaded && isNearEnd && !this.isResolvingTrack()) {
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

  /**
   * 订阅“正在解析播放链接”状态，用于 UI 展示缓冲提示。
   */
  onResolvingChange(callback: (isResolving: boolean) => void): () => void {
    this.resolvingCallbacks.add(callback)
    callback(this.isResolvingTrack())
    return () => {
      this.resolvingCallbacks.delete(callback)
    }
  }

  /**
   * 订阅链接解析提示文案，用于展示当前降级重试进度。
   */
  onResolvingHintChange(callback: (hint: string) => void): () => void {
    this.resolvingHintCallbacks.add(callback)
    callback(this.resolvingHint)
    return () => {
      this.resolvingHintCallbacks.delete(callback)
    }
  }

  /**
   * 订阅当前实际播放音质（最终成功拿到链接的音质）。
   */
  onResolvedQualityChange(callback: (quality: Quality | null) => void): () => void {
    this.resolvedQualityCallbacks.add(callback)
    callback(this.currentResolvedQuality)
    return () => {
      this.resolvedQualityCallbacks.delete(callback)
    }
  }

  /**
   * 当前是否仍在解析歌曲播放链接。
   */
  isResolvingTrack(): boolean {
    return this.resolvingRequestId !== null
  }

  getResolvingHint(): string {
    return this.resolvingHint
  }

  getCurrentResolvedQuality(): Quality | null {
    return this.currentResolvedQuality
  }

  private beginResolveTrackUrl(requestId: number): void {
    this.resolvingRequestId = requestId
    this.emitResolvingState()
  }

  private endResolveTrackUrl(requestId: number): void {
    if (this.resolvingRequestId !== requestId) return
    this.resolvingRequestId = null
    this.emitResolvingState()
  }

  private clearResolveTrackState(): void {
    if (this.resolvingRequestId === null) return
    this.resolvingRequestId = null
    this.emitResolvingState()
  }

  private emitResolvingState(): void {
    const isResolving = this.isResolvingTrack()
    for (const callback of this.resolvingCallbacks) {
      try {
        callback(isResolving)
      } catch (error) {
        console.error('[PlayerController] Error in resolving callback:', error)
      }
    }
  }

  private setResolvingHint(hint: string): void {
    if (!hint || this.resolvingHint === hint) return
    this.resolvingHint = hint
    for (const callback of this.resolvingHintCallbacks) {
      try {
        callback(hint)
      } catch (error) {
        console.error('[PlayerController] Error in resolving hint callback:', error)
      }
    }
  }

  private setResolvingHintForRequest(requestId: number, hint: string): void {
    if (requestId !== this.playRequestId) return
    if (this.resolvingRequestId !== requestId) return
    this.setResolvingHint(hint)
  }

  private setCurrentResolvedQuality(quality: Quality | null): void {
    if (this.currentResolvedQuality === quality) return
    this.currentResolvedQuality = quality
    for (const callback of this.resolvedQualityCallbacks) {
      try {
        callback(quality)
      } catch (error) {
        console.error('[PlayerController] Error in resolved quality callback:', error)
      }
    }
  }

  /**
   * Build quality retry chain: requested first, then strictly degrade.
   */
  private buildQualityAttempts(primary: Quality): Quality[] {
    const startIndex = QUALITY_RETRY_ORDER.indexOf(primary)
    if (startIndex < 0) {
      return [...QUALITY_RETRY_ORDER]
    }
    return QUALITY_RETRY_ORDER.slice(startIndex)
  }

  /**
   * Wait until player actually enters playable state.
   */
  private async waitForPlaybackReady(shouldPlay: boolean, requestId: number): Promise<boolean> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < PLAYBACK_START_TIMEOUT_MS) {
      this.assertPlayRequestActive(requestId)
      const status = await expoAVPlayer.getStatus()
      if (status?.isLoaded) {
        // 只要已加载成功就认为可播放，避免把慢起播/瞬时缓冲误判为失败。
        if (!shouldPlay || status.isPlaying || status.positionMillis >= 0) {
          return true
        }
      }
      await new Promise((resolve) => setTimeout(resolve, PLAYBACK_STATUS_POLL_MS))
    }
    return false
  }

  private assertPlayRequestActive(requestId: number): void {
    if (requestId !== this.playRequestId) {
      throw new StalePlayRequestError()
    }
  }
}

export const playerController = new MusicPlayerController()
