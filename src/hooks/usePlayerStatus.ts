/**
 * Hook to subscribe to player controller status updates.
 *
 * usePlayerStatus  — 全量订阅（含高频 position），用于 MiniPlayer / NowPlaying
 * usePlayerTrack   — 仅 track + isPlaying 变化时才 re-render，用于 Search / HotTracks 等列表
 */

import { useState, useEffect, useRef } from 'react'
import { playerController } from '../core/player'
import { Track } from '../types/music'

export interface PlayerStatus {
  isPlaying: boolean
  currentTrack: Track | null
  position: number
  duration: number
  progress: number
}

export interface PlayerTrackInfo {
  isPlaying: boolean
  currentTrack: Track | null
}

/**
 * 全量播放状态（含 position/duration/progress）。
 * 每 250ms 更新一次，适用于进度条等需要实时位置的场景。
 */
export function usePlayerStatus(): PlayerStatus {
  const [status, setStatus] = useState<PlayerStatus>({
    isPlaying: false,
    currentTrack: playerController.getCurrentTrack(),
    position: 0,
    duration: 0,
    progress: 0,
  })

  useEffect(() => {
    /** 挂载时立即读取播放器当前状态，避免暂停时初始值为 0 */
    playerController.getPlaybackStatus().then(playbackStatus => {
      if (playbackStatus) {
        const track = playerController.getCurrentTrack()
        setStatus({
          currentTrack: track,
          isPlaying: playbackStatus.isPlaying,
          position: playbackStatus.positionMillis,
          duration: playbackStatus.durationMillis,
          progress: playbackStatus.durationMillis > 0
            ? playbackStatus.positionMillis / playbackStatus.durationMillis
            : 0,
        })
      }
    })

    const unsubscribe = playerController.onStatusUpdate((playbackStatus) => {
      const track = playerController.getCurrentTrack()
      setStatus(prev => ({
        ...prev,
        currentTrack: track,
        isPlaying: playbackStatus.isPlaying,
        position: playbackStatus.positionMillis,
        duration: playbackStatus.durationMillis,
        progress: playbackStatus.durationMillis > 0
          ? playbackStatus.positionMillis / playbackStatus.durationMillis
          : 0,
      }))
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return status
}

/**
 * 轻量播放信息（仅 currentTrack + isPlaying）。
 * 只有在 track 切换或播放/暂停状态变化时才触发 re-render，
 * 不会因为 position 变化（250ms 一次）而更新。
 */
export function usePlayerTrack(): PlayerTrackInfo {
  const [info, setInfo] = useState<PlayerTrackInfo>({
    isPlaying: false,
    currentTrack: playerController.getCurrentTrack(),
  })
  const prevRef = useRef({ trackId: info.currentTrack?.id ?? '', isPlaying: false })

  useEffect(() => {
    playerController.getPlaybackStatus().then(playbackStatus => {
      if (playbackStatus) {
        const track = playerController.getCurrentTrack()
        const trackId = track?.id ?? ''
        if (trackId !== prevRef.current.trackId || playbackStatus.isPlaying !== prevRef.current.isPlaying) {
          prevRef.current = { trackId, isPlaying: playbackStatus.isPlaying }
          setInfo({ currentTrack: track, isPlaying: playbackStatus.isPlaying })
        }
      }
    })

    const unsubscribe = playerController.onStatusUpdate((playbackStatus) => {
      const track = playerController.getCurrentTrack()
      const trackId = track?.id ?? ''
      if (trackId !== prevRef.current.trackId || playbackStatus.isPlaying !== prevRef.current.isPlaying) {
        prevRef.current = { trackId, isPlaying: playbackStatus.isPlaying }
        setInfo({ currentTrack: track, isPlaying: playbackStatus.isPlaying })
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return info
}
