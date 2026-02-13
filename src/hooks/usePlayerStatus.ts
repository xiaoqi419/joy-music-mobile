/**
 * Hook to subscribe to player controller status updates
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

export function usePlayerStatus(): PlayerStatus {
  const [status, setStatus] = useState<PlayerStatus>({
    isPlaying: false,
    currentTrack: playerController.getCurrentTrack(),
    position: 0,
    duration: 0,
    progress: 0,
  })

  useEffect(() => {
    setStatus(prev => ({
      ...prev,
      currentTrack: playerController.getCurrentTrack(),
    }))

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
