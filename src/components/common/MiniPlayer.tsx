/**
 * 悬浮球播放器。
 * 封面铺满球体 + 环形进度条 + 播放时旋转（唱片效果），点击打开 NowPlaying。
 * 位于胶囊 TabBar 右侧，与其同层悬浮。
 */

import React, { useCallback, useEffect, useRef } from 'react'
import { View, TouchableOpacity, StyleSheet, Image, Animated, Platform, Easing } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../theme'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import { playerController } from '../../core/player'

/** 悬浮球直径 */
const BALL_SIZE = 56
/** 环形进度条宽度 */
const RING_WIDTH = 3
/** 内圆（封面区域）直径 */
const INNER_SIZE = BALL_SIZE - RING_WIDTH * 2

interface MiniPlayerProps {
  onOpenPlayer?: () => void
}

/**
 * 渲染环形进度指示器。
 * 使用双半圆旋转裁剪技巧在纯 RN 中实现圆环进度，无需 SVG 依赖。
 * 右半容器处理 0%-50%，左半容器处理 50%-100%。
 * @param progress - 0 到 1 的进度值
 * @param color - 进度条颜色
 * @param trackColor - 进度轨道背景色
 */
function CircularProgress({
  progress,
  color,
  trackColor,
}: {
  progress: number
  color: string
  trackColor: string
}) {
  const p = Math.min(Math.max(progress, 0), 1)
  // 0%-50%：右半圆从 -180° 旋转到 0°
  const rightDeg = p <= 0.5 ? -180 + p * 360 : 0
  // 50%-100%：左半圆从 -180° 旋转到 0°
  const leftDeg = p <= 0.5 ? -180 : -180 + (p - 0.5) * 360

  return (
    <View style={ringStyles.container}>
      {/* 轨道背景环 */}
      <View style={[ringStyles.track, { borderColor: trackColor }]} />

      {/* 右半裁剪容器（展示右侧 180°） */}
      <View style={ringStyles.rightClip}>
        <View
          style={[
            ringStyles.halfCircle,
            {
              left: -HALF_SIZE,
              borderColor: color,
              borderLeftColor: 'transparent',
              borderBottomColor: 'transparent',
              transform: [{ rotate: `${rightDeg}deg` }],
            },
          ]}
        />
      </View>

      {/* 左半裁剪容器（展示左侧 180°） */}
      <View style={ringStyles.leftClip}>
        <View
          style={[
            ringStyles.halfCircle,
            {
              left: 0,
              borderColor: color,
              borderRightColor: 'transparent',
              borderTopColor: 'transparent',
              transform: [{ rotate: `${leftDeg}deg` }],
            },
          ]}
        />
      </View>
    </View>
  )
}

const HALF_SIZE = BALL_SIZE / 2

const ringStyles = StyleSheet.create({
  /** 容器与悬浮球等大 */
  container: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    position: 'absolute',
  },
  /** 进度轨道背景环 */
  track: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: HALF_SIZE,
    borderWidth: RING_WIDTH,
  },
  /** 右半裁剪区域：只展示球体右半部分 */
  rightClip: {
    position: 'absolute',
    left: HALF_SIZE,
    width: HALF_SIZE,
    height: BALL_SIZE,
    overflow: 'hidden',
  },
  /** 左半裁剪区域：只展示球体左半部分 */
  leftClip: {
    position: 'absolute',
    left: 0,
    width: HALF_SIZE,
    height: BALL_SIZE,
    overflow: 'hidden',
  },
  /** 完整圆环，通过旋转+裁剪只显示半边 */
  halfCircle: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: HALF_SIZE,
    borderWidth: RING_WIDTH,
    position: 'absolute',
    top: 0,
  },
})

/**
 * 渲染悬浮球播放器组件。
 * 封面铺满球体，播放时持续旋转（唱片效果），暂停时停止。
 * @param onOpenPlayer - 点击打开全屏播放器的回调
 */
export default function MiniPlayer({ onOpenPlayer }: MiniPlayerProps) {
  const { colors } = useTheme()
  const { isPlaying, currentTrack, progress } = usePlayerStatus()

  /** 出现/消失的缩放动画 */
  const scaleAnim = useRef(new Animated.Value(currentTrack ? 1 : 0)).current
  /** 播放时持续旋转动画 */
  const rotateAnim = useRef(new Animated.Value(0)).current
  const rotateLoop = useRef<Animated.CompositeAnimation | null>(null)

  /** 当前曲目变化时的入场/退场动画 */
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: currentTrack ? 1 : 0,
      useNativeDriver: true,
      tension: 200,
      friction: 15,
    }).start()
  }, [currentTrack, scaleAnim])

  /** 播放时启动匀速旋转，暂停时停在当前角度 */
  useEffect(() => {
    if (isPlaying) {
      const loop = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 8000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
      rotateLoop.current = loop
      loop.start()
      return () => loop.stop()
    }
    // 暂停时停止旋转但保持当前角度
    if (rotateLoop.current) {
      rotateLoop.current.stop()
      rotateLoop.current = null
    }
  }, [isPlaying, rotateAnim])

  const handlePress = useCallback(() => {
    onOpenPlayer?.()
  }, [onOpenPlayer])

  /** 长按切换播放/暂停 */
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

  if (!currentTrack) return null

  /** 旋转插值：0→1 映射到 0deg→360deg */
  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleAnim }],
          opacity: scaleAnim,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePress}
        onLongPress={handlePlayPause}
        delayLongPress={300}
      >
        <View style={styles.ball}>
          {/* 环形进度条 */}
          <CircularProgress
            progress={progress}
            color={colors.accent}
            trackColor={colors.separator}
          />

          {/* 旋转的封面内圆 */}
          <Animated.View
            style={[
              styles.inner,
              { backgroundColor: colors.surfaceElevated, transform: [{ rotate: spin }] },
            ]}
          >
            {currentTrack.coverUrl ? (
              <Image
                source={{ uri: currentTrack.coverUrl }}
                style={styles.coverImage}
              />
            ) : (
              <Ionicons name="musical-note" size={22} color={colors.textTertiary} />
            )}
          </Animated.View>

          {/* 播放/暂停状态叠加（不跟随旋转） */}
          {!isPlaying && (
            <View style={styles.statusOverlay}>
              <Ionicons name="play" size={18} color="#FFFFFF" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  /** 悬浮球外层容器 */
  container: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  /** 球体主体 */
  ball: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /** 内圆封面区域（跟随旋转） */
  inner: {
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /** 封面图片 */
  coverImage: {
    width: INNER_SIZE,
    height: INNER_SIZE,
  },
  /** 暂停时播放图标叠加（不跟随旋转） */
  statusOverlay: {
    position: 'absolute',
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
