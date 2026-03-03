/**
 * 现代化歌词滚动组件。
 * 自动跟随播放进度滚动到当前行，支持点击行跳转。
 * 当前行高亮放大并带有平滑过渡动画，远离行渐隐，形成聚光灯效果。
 *
 * 使用 FlatList 窗口化渲染，仅实例化可见区域附近的歌词行。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  LayoutChangeEvent,
  Animated,
  Easing,
} from 'react-native'
import { useTheme, spacing, fontSize } from '../../theme'
import { LyricLine, findCurrentLineIndex } from '../../core/lyric'
import useReduceMotion from '../../hooks/useReduceMotion'

interface LyricsViewProps {
  /** 已解析的歌词行 */
  lyrics: LyricLine[]
  /** 当前播放位置（毫秒） */
  position: number
  /** 是否正在加载歌词 */
  loading?: boolean
  /** 当前歌词页是否可见（用于控制自动滚动动画） */
  active?: boolean
  /** 点击歌词行跳转回调 */
  onSeek?: (timeMs: number) => void
}

/** 单行歌词高度（无翻译） */
const LINE_HEIGHT = 44
/** 单行歌词高度（有翻译） */
const LINE_HEIGHT_WITH_TRANS = 64
/** 当前行缩放比例 */
const ACTIVE_SCALE = 1.12
/** 动画持续时间 */
const ANIM_DURATION = 350

/* ── 单行歌词组件（带独立动画） ── */

interface LyricLineItemProps {
  line: LyricLine
  index: number
  isCurrent: boolean
  distance: number
  lineHeight: number
  onPress: (time: number) => void
}

/**
 * 渲染单行歌词，内含 Animated 过渡动画。
 * @param line - 歌词行数据
 * @param isCurrent - 是否为当前播放行
 * @param distance - 与当前行的距离
 * @param lineHeight - 行高
 * @param onPress - 点击回调
 */
const LyricLineItem = React.memo(function LyricLineItem({
  line,
  isCurrent,
  distance,
  lineHeight,
  onPress,
}: LyricLineItemProps) {
  const { colors } = useTheme()
  const reduceMotion = useReduceMotion()
  const highlightAnim = useRef(new Animated.Value(isCurrent ? 1 : 0)).current
  const opacityAnim = useRef(
    new Animated.Value(isCurrent ? 1 : Math.max(0.25, 1 - distance * 0.18))
  ).current

  /** isCurrent / distance 变化时平滑过渡 */
  useEffect(() => {
    const targetOpacity = isCurrent ? 1 : Math.max(0.25, 1 - distance * 0.18)
    if (reduceMotion) {
      highlightAnim.setValue(isCurrent ? 1 : 0)
      opacityAnim.setValue(targetOpacity)
      return
    }
    Animated.parallel([
      Animated.timing(highlightAnim, {
        toValue: isCurrent ? 1 : 0,
        duration: ANIM_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: targetOpacity,
        duration: ANIM_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [distance, highlightAnim, isCurrent, opacityAnim, reduceMotion])

  const scale = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, ACTIVE_SCALE],
  })

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(line.time)}
      style={[styles.lineWrap, { height: lineHeight }]}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          opacity: opacityAnim,
        }}
      >
        <Text
          style={[
            styles.lineText,
            {
              color: isCurrent ? colors.accent : colors.text,
              fontSize: isCurrent ? fontSize.title2 : fontSize.subhead,
              fontWeight: isCurrent ? '700' : '400',
            },
          ]}
          numberOfLines={isCurrent ? undefined : 2}
        >
          {line.text}
        </Text>
        {line.translation && (
          <Text
            style={[
              styles.translationText,
              {
                color: isCurrent ? colors.accent : colors.textSecondary,
              },
            ]}
            numberOfLines={isCurrent ? undefined : 1}
          >
            {line.translation}
          </Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  )
})

/* ── 歌词滚动主组件 ── */

/**
 * 渲染歌词滚动视图。
 * @param lyrics - 歌词行数组
 * @param position - 当前播放位置（毫秒）
 * @param loading - 是否加载中
 * @param onSeek - 跳转回调
 */
export default function LyricsView({
  lyrics,
  position,
  loading,
  active = true,
  onSeek,
}: LyricsViewProps) {
  const { colors } = useTheme()
  const listRef = useRef<FlatList<LyricLine>>(null)
  const [containerHeight, setContainerHeight] = useState(300)
  const firstPositionSyncRef = useRef(true)

  const hasTranslation = useMemo(
    () => lyrics.some((l) => l.translation),
    [lyrics]
  )
  const lineHeight = hasTranslation ? LINE_HEIGHT_WITH_TRANS : LINE_HEIGHT

  const currentIndex = useMemo(
    () => findCurrentLineIndex(lyrics, position),
    [lyrics, position]
  )

  const getItemLayout = useCallback(
    (_data: ArrayLike<LyricLine> | null | undefined, index: number) => ({
      length: lineHeight,
      offset: lineHeight * index,
      index,
    }),
    [lineHeight]
  )

  /** 容器尺寸变化时记录高度，用于居中计算 */
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerHeight(e.nativeEvent.layout.height)
  }, [])

  /** 当前行变化时自动滚动居中 */
  useEffect(() => {
    if (currentIndex >= 0 && containerHeight > 0 && lyrics.length > 0) {
      const shouldAnimate = active && !firstPositionSyncRef.current
      try {
        listRef.current?.scrollToIndex({
          index: currentIndex,
          animated: shouldAnimate,
          viewPosition: 0.5,
        })
      } catch {
        // scrollToIndex may fail if layout hasn't completed
      }
      firstPositionSyncRef.current = false
    }
  }, [currentIndex, lineHeight, containerHeight, active, lyrics.length])

  /** 切歌后首次定位不做动画，避免"闪回到当前行"的观感 */
  useEffect(() => {
    firstPositionSyncRef.current = true
  }, [lyrics])

  /** 点击歌词行跳转 */
  const handleLinePress = useCallback(
    (time: number) => {
      onSeek?.(time)
    },
    [onSeek]
  )

  const renderItem = useCallback(
    ({ item, index }: { item: LyricLine; index: number }) => {
      const isCurrent = index === currentIndex
      const distance = Math.abs(index - currentIndex)
      return (
        <LyricLineItem
          key={`${item.time}-${index}`}
          line={item}
          index={index}
          isCurrent={isCurrent}
          distance={distance}
          lineHeight={lineHeight}
          onPress={handleLinePress}
        />
      )
    },
    [currentIndex, lineHeight, handleLinePress]
  )

  const keyExtractor = useCallback(
    (item: LyricLine, index: number) => `${item.time}-${index}`,
    []
  )

  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    )
  }

  if (!lyrics.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          暂无歌词
        </Text>
      </View>
    )
  }

  const verticalPad = containerHeight / 2

  return (
    <FlatList
      ref={listRef}
      data={lyrics}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      style={styles.container}
      contentContainerStyle={{
        paddingTop: verticalPad,
        paddingBottom: verticalPad,
      }}
      showsVerticalScrollIndicator={false}
      onLayout={handleLayout}
      initialNumToRender={15}
      maxToRenderPerBatch={10}
      windowSize={11}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: fontSize.body,
  },
  lineWrap: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  lineText: {
    textAlign: 'center',
  },
  translationText: {
    fontSize: fontSize.footnote,
    textAlign: 'center',
    marginTop: 2,
  },
})
