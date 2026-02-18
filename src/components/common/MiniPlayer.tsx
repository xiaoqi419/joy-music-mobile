/**
 * 底部 Mini 播放条。
 * 横向布局：封面 + 歌名/作者 + 中间歌词 + 播放控制，底部可拖动进度条。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  Platform,
  Text,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, MINI_PLAYER_HEIGHT, fontSize } from '../../theme'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import { playerController } from '../../core/player'
import { getLyric, findCurrentLineIndex, type LyricLine } from '../../core/lyric'

interface MiniPlayerProps {
  onOpenPlayer?: () => void
}

const COVER_SIZE = 44
const CONTROL_SIZE = 36
const SEEK_TRACK_HEIGHT = 5
const SEEK_TOUCH_HEIGHT = 24

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1)

/**
 * 渲染底部条形 Mini 播放器。
 * @param onOpenPlayer - 点击打开全屏播放器的回调
 */
export default function MiniPlayer({ onOpenPlayer }: MiniPlayerProps) {
  const { colors, isDark } = useTheme()
  const { isPlaying, currentTrack, progress, position, duration } = usePlayerStatus()

  const entryAnim = useRef(new Animated.Value(currentTrack ? 1 : 0)).current
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([])
  const [lyricLoading, setLyricLoading] = useState(false)
  const [seekBarWidth, setSeekBarWidth] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)
  const [seekProgress, setSeekProgress] = useState(0)
  const lyricTrackKey = currentTrack
    ? `${currentTrack.source || 'kw'}_${currentTrack.songmid || currentTrack.id}`
    : ''

  useEffect(() => {
    Animated.spring(entryAnim, {
      toValue: currentTrack ? 1 : 0,
      useNativeDriver: true,
      tension: 180,
      friction: 18,
    }).start()
  }, [currentTrack, entryAnim])

  useEffect(() => {
    if (!currentTrack) {
      setLyricLines([])
      setLyricLoading(false)
      return
    }

    let active = true
    setLyricLoading(true)
    setLyricLines([])

    void getLyric(currentTrack)
      .then((data) => {
        if (!active) return
        setLyricLines(data.lines || [])
      })
      .catch(() => {
        if (!active) return
        setLyricLines([])
      })
      .finally(() => {
        if (!active) return
        setLyricLoading(false)
      })

    return () => {
      active = false
    }
  }, [lyricTrackKey])

  useEffect(() => {
    if (!isSeeking) {
      setSeekProgress(clamp01(progress))
    }
  }, [progress, isSeeking])

  useEffect(() => {
    setIsSeeking(false)
    setSeekProgress(0)
  }, [lyricTrackKey])

  const handleOpen = useCallback(() => {
    onOpenPlayer?.()
  }, [onOpenPlayer])

  const handlePlayPause = useCallback(async () => {
    try {
      if (isPlaying) {
        await playerController.pause()
      } else {
        await playerController.resume()
      }
    } catch (e) {
      console.error('MiniPlayer play/pause error:', e)
    }
  }, [isPlaying])

  const calcProgressFromEvent = useCallback((event: GestureResponderEvent): number => {
    if (seekBarWidth <= 0) return 0
    return clamp01(event.nativeEvent.locationX / seekBarWidth)
  }, [seekBarWidth])

  const commitSeek = useCallback((nextProgress: number) => {
    if (duration > 0) {
      void playerController.seek(Math.floor(duration * nextProgress))
    }
  }, [duration])

  const handleSeekLayout = useCallback((event: LayoutChangeEvent) => {
    setSeekBarWidth(event.nativeEvent.layout.width)
  }, [])

  const handleSeekGrant = useCallback((event: GestureResponderEvent) => {
    const nextProgress = calcProgressFromEvent(event)
    setIsSeeking(true)
    setSeekProgress(nextProgress)
  }, [calcProgressFromEvent])

  const handleSeekMove = useCallback((event: GestureResponderEvent) => {
    setSeekProgress(calcProgressFromEvent(event))
  }, [calcProgressFromEvent])

  const handleSeekRelease = useCallback((event: GestureResponderEvent) => {
    const nextProgress = calcProgressFromEvent(event)
    setSeekProgress(nextProgress)
    setIsSeeking(false)
    commitSeek(nextProgress)
  }, [calcProgressFromEvent, commitSeek])

  if (!currentTrack) return null

  const artistInfo = currentTrack.source
    ? `${currentTrack.artist} · ${currentTrack.source.toUpperCase()}`
    : currentTrack.artist
  const currentLyricIndex = findCurrentLineIndex(lyricLines, position)
  const currentLyricText = !lyricLines.length
    ? (lyricLoading ? '歌词加载中...' : '暂无歌词')
    : (currentLyricIndex < 0
      ? (lyricLines[0]?.text || '暂无歌词')
      : (lyricLines[currentLyricIndex]?.text || '暂无歌词'))
  const hasActiveLyric = lyricLines.length > 0 && currentLyricIndex >= 0
  const activeProgress = isSeeking ? seekProgress : clamp01(progress)
  const thumbSize = isSeeking ? 10 : 8
  const trackTop = (SEEK_TOUCH_HEIGHT - SEEK_TRACK_HEIGHT) / 2
  const thumbTop = trackTop + (SEEK_TRACK_HEIGHT - thumbSize) / 2
  const thumbOffset = seekBarWidth > 0
    ? Math.max(
      0,
      Math.min(
        seekBarWidth - thumbSize,
        activeProgress * seekBarWidth - thumbSize / 2
      )
    )
    : 0

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.miniPlayer,
          borderColor: colors.tabBarBorder,
          opacity: entryAnim,
          transform: [
            {
              translateY: entryAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.mainArea}
          activeOpacity={0.82}
          onPress={handleOpen}
        >
          <View
            style={[
              styles.cover,
              { backgroundColor: colors.surfaceSecondary },
            ]}
          >
            {currentTrack.coverUrl ? (
              <Image source={{ uri: currentTrack.coverUrl }} style={styles.coverImage} />
            ) : (
              <Ionicons name="musical-note" size={20} color={colors.textTertiary} />
            )}
          </View>
          <View style={styles.trackMeta}>
            <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
              {currentTrack.title}
            </Text>
            <Text numberOfLines={1} style={[styles.artist, { color: colors.textSecondary }]}>
              {artistInfo}
            </Text>
          </View>
          <View style={styles.lyricWrap}>
            <Text
              numberOfLines={1}
              style={[
                styles.lyricText,
                { color: hasActiveLyric ? colors.accent : colors.textSecondary },
              ]}
            >
              {currentLyricText}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)',
            },
          ]}
          onPress={handlePlayPause}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={18}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.seekWrap}>
        <View
          style={styles.seekTouchArea}
          onLayout={handleSeekLayout}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleSeekGrant}
          onResponderMove={handleSeekMove}
          onResponderRelease={handleSeekRelease}
          onResponderTerminate={handleSeekRelease}
        >
          <View
            style={[
              styles.seekTrack,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.14)' },
            ]}
          />
          <View
            style={[
              styles.seekFill,
              {
                backgroundColor: colors.accent,
                width: `${activeProgress * 100}%`,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.seekThumb,
              {
                width: thumbSize,
                height: thumbSize,
                borderRadius: thumbSize / 2,
                left: thumbOffset,
                top: thumbTop,
                backgroundColor: colors.accent,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.92)',
                opacity: isSeeking ? 1 : 0.9,
                transform: [{ scale: isSeeking ? 1.06 : 1 }],
              },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    height: MINI_PLAYER_HEIGHT,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 2,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 14,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  mainArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  cover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    width: COVER_SIZE,
    height: COVER_SIZE,
  },
  trackMeta: {
    width: 118,
    marginLeft: 10,
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.subhead,
    fontWeight: '700',
    lineHeight: 18,
  },
  artist: {
    marginTop: 2,
    fontSize: fontSize.caption1,
    fontWeight: '500',
    lineHeight: 14,
  },
  lyricWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  lyricText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
    textAlign: 'center',
  },
  controlButton: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekWrap: {
    marginTop: 1,
    paddingHorizontal: 2,
    paddingBottom: 1,
  },
  seekTouchArea: {
    height: SEEK_TOUCH_HEIGHT,
    justifyContent: 'center',
  },
  seekTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (SEEK_TOUCH_HEIGHT - SEEK_TRACK_HEIGHT) / 2,
    height: SEEK_TRACK_HEIGHT,
    borderRadius: 9999,
    overflow: 'visible',
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    top: (SEEK_TOUCH_HEIGHT - SEEK_TRACK_HEIGHT) / 2,
    height: SEEK_TRACK_HEIGHT,
    borderRadius: 9999,
  },
  seekThumb: {
    position: 'absolute',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
})
