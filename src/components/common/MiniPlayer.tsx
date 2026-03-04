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
} from 'react-native'
import Slider from '@react-native-community/slider'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
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
const SEEK_TOUCH_HEIGHT = 18

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1)

/**
 * 渲染底部条形 Mini 播放器。
 * 融合沉浸式液态玻璃质感的设计。
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

  const commitSeek = useCallback((nextProgress: number) => {
    if (duration > 0) {
      void playerController.seek(Math.floor(duration * nextProgress))
    }
  }, [duration])

  const handleSeekLayout = useCallback((event: LayoutChangeEvent) => {
    setSeekBarWidth(event.nativeEvent.layout.width)
  }, [])

  const handleSeekStart = useCallback((value: number) => {
    const nextProgress = clamp01(value)
    setIsSeeking(true)
    setSeekProgress(nextProgress)
  }, [])

  const handleSeekChange = useCallback((value: number) => {
    setSeekProgress(clamp01(value))
  }, [])

  const handleSeekComplete = useCallback((value: number) => {
    const nextProgress = clamp01(value)
    setSeekProgress(nextProgress)
    setIsSeeking(false)
    commitSeek(nextProgress)
  }, [commitSeek])

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
        styles.positioner,
        {
          opacity: entryAnim,
          transform: [
            {
              translateY: entryAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.shadowLayer}>
        <View style={styles.container}>
          {/* —— 沉浸式玻璃底层 —— */}
          <BlurView
            intensity={isDark ? 55 : 85}
            tint={isDark ? 'dark' : 'light'}
            style={styles.absoluteFill}
          />

          {/* —— 半透明底色，减少过杂的透底 —— */}
          <View
            style={[
              styles.absoluteFill,
              { backgroundColor: isDark ? 'rgba(28,28,30,0.65)' : 'rgba(255,255,255,0.7)' },
            ]}
          />

          {/* —— 高光层，顶部加强反射 —— */}
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0)']
                : ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.1)']
            }
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.absoluteFill}
            pointerEvents="none"
          />

          {/* —— 内发光边框 —— */}
          <View
            style={[
              styles.innerBorder,
              { borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.6)' },
            ]}
            pointerEvents="none"
          />

          {/* —— 主内容区域 —— */}
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.mainArea}
              activeOpacity={0.8}
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
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
              onPress={handlePlayPause}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={18}
                color={colors.text}
              />
            </TouchableOpacity>
          </View>

          {/* —— 进度条 —— */}
          <View style={styles.seekWrap}>
            <View
              style={styles.seekTouchArea}
              onLayout={handleSeekLayout}
            >
              <View
                style={[
                  styles.seekTrack,
                  { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' },
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
                    backgroundColor: '#FFFFFF',
                    borderColor: 'rgba(0,0,0,0.1)', // 把原来的颜色拿掉，换成白色本体带微边框即可
                    opacity: isSeeking ? 1 : 0.9,
                    transform: [{ scale: isSeeking ? 1.06 : 1 }],
                  },
                ]}
              />
              <Slider
                style={styles.seekNativeSlider}
                minimumValue={0}
                maximumValue={1}
                step={0}
                value={activeProgress}
                onSlidingStart={handleSeekStart}
                onValueChange={handleSeekChange}
                onSlidingComplete={handleSeekComplete}
                minimumTrackTintColor="transparent"
                maximumTrackTintColor="transparent"
                thumbTintColor="transparent"
              />
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  positioner: {
    width: '100%',
  },
  shadowLayer: {
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  container: {
    height: MINI_PLAYER_HEIGHT,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1, // 粗一点点更能体现高光发亮
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    zIndex: 1, // 确保在玻璃层上方
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
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
    fontSize: fontSize.caption1 - 1, // 让歌词显得更精致一点
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
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: -6,
    zIndex: 2, // 保证能盖住圆角背景
  },
  seekTouchArea: {
    height: SEEK_TOUCH_HEIGHT,
    justifyContent: 'center',
  },
  seekNativeSlider: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: SEEK_TOUCH_HEIGHT,
    opacity: 0.02,
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
    borderWidth: StyleSheet.hairlineWidth,
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
