/**
 * 顶部区域下滑关闭手势 Hook。
 * 使用 PanGestureHandler（原生手势识别）替代 PanResponder。
 * 仅在顶部指定区域起手时生效，避免与页面内部纵向滚动冲突。
 */

import { useCallback, useRef } from 'react'
import { Animated, Dimensions } from 'react-native'
import { State } from 'react-native-gesture-handler'

const SCREEN_HEIGHT = Dimensions.get('window').height
const DISMISS_THRESHOLD = 120
const DISMISS_VELOCITY = 900

interface SwipeDownGestureBindings {
  panY: Animated.Value
  panGesture: {
    hitSlop: {
      top: number
      left: number
      right: number
      height: number
    }
    activeOffsetY: number
    failOffsetX: [number, number]
    onGestureEvent: (event: any) => void
    onHandlerStateChange: (event: any) => void
  }
}

/**
 * 提供顶部下滑关闭能力。
 * @param onClose - 关闭回调
 * @param startAreaHeight - 允许起手的顶部区域高度
 */
export function useSwipeDownClose(onClose: () => void, startAreaHeight = 140): SwipeDownGestureBindings {
  const panY = useRef(new Animated.Value(0)).current
  const onCloseRef = useRef(onClose)
  const isDismissingRef = useRef(false)
  onCloseRef.current = onClose

  const resetSwipe = useCallback(() => {
    Animated.spring(panY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 210,
      friction: 22,
    }).start()
  }, [panY])

  const onGestureEvent = useCallback((event: any) => {
    const nextY = Math.max(0, Number(event?.nativeEvent?.translationY ?? 0))
    panY.setValue(nextY)
  }, [panY])

  const onHandlerStateChange = useCallback((event: any) => {
    if (isDismissingRef.current) return

    const state = Number(event?.nativeEvent?.state)
    if (state === State.BEGAN) {
      panY.stopAnimation()
      panY.setValue(0)
      return
    }

    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) {
      return
    }

    const deltaY = Math.max(0, Number(event?.nativeEvent?.translationY ?? 0))
    const velocityY = Number(event?.nativeEvent?.velocityY ?? 0)
    const shouldDismiss = deltaY > DISMISS_THRESHOLD || velocityY > DISMISS_VELOCITY

    if (shouldDismiss) {
      isDismissingRef.current = true
      Animated.timing(panY, {
        toValue: SCREEN_HEIGHT,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        onCloseRef.current()
        isDismissingRef.current = false
      })
      return
    }

    isDismissingRef.current = false
    resetSwipe()
  }, [panY, resetSwipe])

  return {
    panY,
    panGesture: {
      hitSlop: {
        top: 0,
        left: 0,
        right: 0,
        height: Math.max(44, Math.floor(startAreaHeight)),
      },
      activeOffsetY: 10,
      failOffsetX: [-18, 18],
      onGestureEvent,
      onHandlerStateChange,
    },
  }
}

