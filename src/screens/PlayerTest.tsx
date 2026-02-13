/**
 * Music player test component
 * Demonstrates playback functionality with ikun source
 */

import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { playerController } from '../core/player'
import { Track } from '../types/music'
import { PlaybackStatus } from '../core/player/expoav'

// Sample test tracks
const TEST_TRACKS: Track[] = [
  {
    id: '1',
    title: '测试歌曲 1',
    artist: '测试艺术家 1',
    album: '测试专辑',
    duration: 180000,
    url: '',
    coverUrl: 'https://via.placeholder.com/300',
    // ikun specific fields
    source: 'kw',
    songmid: 'test_song_1',
    hash: 'test_hash_1',
  },
  {
    id: '2',
    title: '测试歌曲 2',
    artist: '测试艺术家 2',
    album: '测试专辑',
    duration: 200000,
    url: '',
    coverUrl: 'https://via.placeholder.com/300',
    source: 'kw',
    songmid: 'test_song_2',
    hash: 'test_hash_2',
  },
]

export default function PlayerTestComponent() {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<PlaybackStatus | null>(null)

  // Initialize player on mount
  useEffect(() => {
    const initPlayer = async() => {
      try {
        await playerController.initialize()
        playerController.setPlaylist(TEST_TRACKS)

        // Subscribe to status updates
        const unsubscribe = playerController.onStatusUpdate((playbackStatus) => {
          setStatus(playbackStatus)
          setCurrentTime(playbackStatus.positionMillis)
          setDuration(playbackStatus.durationMillis)
          setIsPlaying(playbackStatus.isPlaying)
        })

        return unsubscribe
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize player')
      }
    }

    let unsubscribe: (() => void) | undefined
    initPlayer().then(fn => {
      unsubscribe = fn
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  const handlePlayTrack = async(track: Track) => {
    try {
      setIsLoading(true)
      setError(null)
      setCurrentTrack(track)

      await playerController.playTrack(track, {
        autoPlay: true,
        quality: '320k',
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error playing track'
      setError(errorMsg)
      console.error('Play error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePause = async() => {
    try {
      await playerController.pause()
    } catch (err) {
      console.error('Pause error:', err)
    }
  }

  const handleResume = async() => {
    try {
      await playerController.resume()
    } catch (err) {
      console.error('Resume error:', err)
    }
  }

  const handleStop = async() => {
    try {
      await playerController.stop()
      setCurrentTrack(null)
      setCurrentTime(0)
      setDuration(0)
    } catch (err) {
      console.error('Stop error:', err)
    }
  }

  const handleNext = async() => {
    try {
      await playerController.playNext()
    } catch (err) {
      console.error('Next error:', err)
    }
  }

  const handlePrevious = async() => {
    try {
      await playerController.playPrevious()
    } catch (err) {
      console.error('Previous error:', err)
    }
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <ScrollView style={{ flex: 1, padding: 16, backgroundColor: '#f5f5f5' }}>
      {/* Current Track Info */}
      {currentTrack && (
        <View style={{ marginBottom: 20, padding: 12, backgroundColor: 'white', borderRadius: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
            当前播放
          </Text>
          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>
            {currentTrack.title}
          </Text>
          <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
            {currentTrack.artist}
          </Text>

          {/* Progress */}
          <View style={{ marginBottom: 8 }}>
            <View style={{ height: 4, backgroundColor: '#ddd', borderRadius: 2 }}>
              <View
                style={{
                  height: 4,
                  backgroundColor: '#007AFF',
                  borderRadius: 2,
                  width: `${progressPercent}%`,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {formatTime(currentTime)}
              </Text>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {formatTime(duration)}
              </Text>
            </View>
          </View>

          {/* Playback Status */}
          {status && (
            <Text style={{ fontSize: 11, color: '#999' }}>
              速率: {status.rate.toFixed(1)}x | 音量: {(status.volume * 100).toFixed(0)}%
            </Text>
          )}
        </View>
      )}

      {/* Error Display */}
      {error && (
        <View style={{ marginBottom: 20, padding: 12, backgroundColor: '#fee', borderRadius: 8 }}>
          <Text style={{ color: '#c33', fontSize: 12 }}>
            ❌ 错误: {error}
          </Text>
        </View>
      )}

      {/* Playback Controls */}
      <View style={{ marginBottom: 20, padding: 12, backgroundColor: 'white', borderRadius: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12 }}>
          播放控制
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <TouchableOpacity
            onPress={handlePrevious}
            style={{
              flex: 1,
              padding: 12,
              backgroundColor: '#f0f0f0',
              borderRadius: 8,
              alignItems: 'center',
            }}
          >
            <Text>⏮ 上一首</Text>
          </TouchableOpacity>

          {isPlaying ? (
            <TouchableOpacity
              onPress={handlePause}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: '#007AFF',
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: 'white' }}>⏸ 暂停</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleResume}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: '#007AFF',
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: 'white' }}>▶ 播放</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleNext}
            style={{
              flex: 1,
              padding: 12,
              backgroundColor: '#f0f0f0',
              borderRadius: 8,
              alignItems: 'center',
            }}
          >
            <Text>下一首 ⏭</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleStop}
          style={{
            padding: 12,
            backgroundColor: '#ff3b30',
            borderRadius: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white' }}>⏹ 停止</Text>
        </TouchableOpacity>
      </View>

      {/* Test Tracks */}
      <View style={{ padding: 12, backgroundColor: 'white', borderRadius: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12 }}>
          测试歌曲
        </Text>

        {isLoading && (
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={{ marginTop: 8, color: '#666' }}>
              加载中...
            </Text>
          </View>
        )}

        {!isLoading && TEST_TRACKS.map((track) => (
          <TouchableOpacity
            key={track.id}
            onPress={() => handlePlayTrack(track)}
            style={{
              padding: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#f0f0f0',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>
                {track.title}
              </Text>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {track.artist}
              </Text>
            </View>
            <Text style={{ color: currentTrack?.id === track.id ? '#007AFF' : '#999' }}>
              {currentTrack?.id === track.id ? '▶' : '▷'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}
