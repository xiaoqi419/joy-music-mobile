/**
 * 左边缘右滑关闭手势 Hook。
 * 在左侧 35px 边缘区域检测水平右滑，滑动超过阈值后动画滑出并触发关闭回调。
 * 返回 panX 动画值和 panHandlers，绑定到 Animated.View 即可使用。
 */

import { useRef } from 'react'
import { Animated, Dimensions, PanResponder } from 'react-native'

/** 左边缘手势触发区宽度 */
const EDGE_WIDTH = 35
/** 滑动多远触发关闭 */
const DISMISS_THRESHOLD = 100
const SCREEN_WIDTH = Dimensions.get('window').width

/**
 * 提供左边缘右滑关闭能力。
 * @param onClose - 滑动关闭时的回调
 * @returns panX 动画值 + PanResponder handlers
 */
export function useSwipeBack(onClose: () => void) {
  const panX = useRef(new Animated.Value(0)).current
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) =>
        evt.nativeEvent.pageX < EDGE_WIDTH,
      onMoveShouldSetPanResponder: (evt, gs) =>
        evt.nativeEvent.pageX < EDGE_WIDTH &&
        gs.dx > 10 &&
        Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => {
        if (gs.dx > 0) panX.setValue(gs.dx)
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > DISMISS_THRESHOLD || gs.vx > 0.4) {
          Animated.timing(panX, {
            toValue: SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onCloseRef.current())
        } else {
          Animated.spring(panX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 200,
            friction: 20,
          }).start()
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panX, {
          toValue: 0,
          useNativeDriver: true,
        }).start()
      },
    })
  ).current

  return { panX, panHandlers: panResponder.panHandlers }
}
