/**
 * 左边缘右滑关闭手势 Hook。
 * 使用 PanGestureHandler（原生手势识别）替代 PanResponder。
 * 仅在左侧边缘起手时生效，右滑超过阈值触发关闭。
 */

import { useCallback, useRef } from 'react'
import { Animated, Dimensions } from 'react-native'
import { State } from 'react-native-gesture-handler'

/** 左边缘手势触发区宽度 */
const EDGE_WIDTH = 35
/** 滑动多远触发关闭 */
const DISMISS_THRESHOLD = 100
/** 滑动速度阈值（px/s） */
const DISMISS_VELOCITY = 650
const SCREEN_WIDTH = Dimensions.get('window').width

interface SwipeBackGestureBindings {
  panX: Animated.Value
  panGesture: {
    hitSlop: {
      left: number
      width: number
    }
    activeOffsetX: number
    failOffsetY: [number, number]
    onGestureEvent: (event: any) => void
    onHandlerStateChange: (event: any) => void
  }
}

/**
 * 提供左边缘右滑关闭能力。
 * @param onClose - 滑动关闭时的回调
 * @returns panX 动画值 + PanGestureHandler 配置
 */
export function useSwipeBack(onClose: () => void): SwipeBackGestureBindings {
  const panX = useRef(new Animated.Value(0)).current
  const onCloseRef = useRef(onClose)
  const isDismissingRef = useRef(false)
  onCloseRef.current = onClose

  const resetSwipe = useCallback(() => {
    Animated.spring(panX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 200,
      friction: 20,
    }).start()
  }, [panX])

  const onGestureEvent = useCallback((event: any) => {
    const nextX = Math.max(0, Number(event?.nativeEvent?.translationX ?? 0))
    panX.setValue(nextX)
  }, [panX])

  const onHandlerStateChange = useCallback((event: any) => {
    if (isDismissingRef.current) return

    const state = Number(event?.nativeEvent?.state)
    if (state === State.BEGAN) {
      panX.stopAnimation()
      panX.setValue(0)
      return
    }

    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) {
      return
    }

    const deltaX = Math.max(0, Number(event?.nativeEvent?.translationX ?? 0))
    const velocityX = Number(event?.nativeEvent?.velocityX ?? 0)
    const shouldDismiss = deltaX > DISMISS_THRESHOLD || velocityX > DISMISS_VELOCITY

    if (shouldDismiss) {
      isDismissingRef.current = true
      Animated.timing(panX, {
        toValue: SCREEN_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        onCloseRef.current()
        isDismissingRef.current = false
      })
      return
    }

    isDismissingRef.current = false
    resetSwipe()
  }, [panX, resetSwipe])

  return {
    panX,
    panGesture: {
      hitSlop: {
        left: 0,
        width: EDGE_WIDTH,
      },
      activeOffsetX: 12,
      failOffsetY: [-18, 18],
      onGestureEvent,
      onHandlerStateChange,
    },
  }
}
