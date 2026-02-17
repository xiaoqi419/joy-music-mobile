/**
 * 顶部区域下滑关闭手势 Hook。
 * 仅在顶部指定区域起手时生效，避免与页面内部纵向滚动冲突。
 */

import { useRef } from 'react'
import { Animated, Dimensions, PanResponder } from 'react-native'

const SCREEN_HEIGHT = Dimensions.get('window').height
const DISMISS_THRESHOLD = 120

/**
 * 提供顶部下滑关闭能力。
 * @param onClose - 关闭回调
 * @param startAreaHeight - 允许起手的顶部区域高度
 */
export function useSwipeDownClose(onClose: () => void, startAreaHeight = 140) {
  const panY = useRef(new Animated.Value(0)).current
  const onCloseRef = useRef(onClose)
  const touchStartYRef = useRef(0)
  onCloseRef.current = onClose

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        touchStartYRef.current = evt.nativeEvent.pageY
        return touchStartYRef.current < startAreaHeight
      },
      onMoveShouldSetPanResponder: (_, gs) =>
        touchStartYRef.current < startAreaHeight &&
        gs.dy > 8 &&
        Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) panY.setValue(gs.dy)
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > DISMISS_THRESHOLD || gs.vy > 0.85) {
          Animated.timing(panY, {
            toValue: SCREEN_HEIGHT,
            duration: 220,
            useNativeDriver: true,
          }).start(() => onCloseRef.current())
        } else {
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 210,
            friction: 22,
          }).start()
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panY, {
          toValue: 0,
          useNativeDriver: true,
        }).start()
      },
    })
  ).current

  return { panY, panHandlers: panResponder.panHandlers }
}

