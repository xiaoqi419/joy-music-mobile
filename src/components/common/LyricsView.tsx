/**
 * 现代化歌词滚动组件。
 * 自动跟随播放进度滚动到当前行，支持点击行跳转。
 * 当前行高亮放大，远离行渐隐，形成聚光灯效果。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native'
import { useTheme, spacing, fontSize } from '../../theme'
import { LyricLine, findCurrentLineIndex } from '../../core/lyric'

interface LyricsViewProps {
  /** 已解析的歌词行 */
  lyrics: LyricLine[]
  /** 当前播放位置（毫秒） */
  position: number
  /** 是否正在加载歌词 */
  loading?: boolean
  /** 点击歌词行跳转回调 */
  onSeek?: (timeMs: number) => void
}

/** 单行歌词高度（无翻译） */
const LINE_HEIGHT = 44
/** 单行歌词高度（有翻译） */
const LINE_HEIGHT_WITH_TRANS = 64

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
  onSeek,
}: LyricsViewProps) {
  const { colors } = useTheme()
  const scrollRef = useRef<ScrollView>(null)
  const lastIndex = useRef(-1)
  const [containerHeight, setContainerHeight] = useState(300)

  const hasTranslation = useMemo(
    () => lyrics.some((l) => l.translation),
    [lyrics]
  )
  const lineHeight = hasTranslation ? LINE_HEIGHT_WITH_TRANS : LINE_HEIGHT

  const currentIndex = useMemo(
    () => findCurrentLineIndex(lyrics, position),
    [lyrics, position]
  )

  /** 容器尺寸变化时记录高度，用于居中计算 */
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerHeight(e.nativeEvent.layout.height)
  }, [])

  /** 当前行变化时自动滚动居中 */
  useEffect(() => {
    if (currentIndex !== lastIndex.current && currentIndex >= 0) {
      lastIndex.current = currentIndex
      const halfContainer = containerHeight / 2
      const targetY = currentIndex * lineHeight - halfContainer + lineHeight / 2
      scrollRef.current?.scrollTo({
        y: Math.max(0, targetY),
        animated: true,
      })
    }
  }, [currentIndex, lineHeight, containerHeight])

  /** 切歌时重置滚动位置 */
  useEffect(() => {
    lastIndex.current = -1
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [lyrics])

  const handleLinePress = useCallback(
    (time: number) => {
      onSeek?.(time)
    },
    [onSeek]
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
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={{
        paddingTop: verticalPad,
        paddingBottom: verticalPad,
      }}
      showsVerticalScrollIndicator={false}
      onLayout={handleLayout}
    >
      {lyrics.map((line, index) => {
        const isCurrent = index === currentIndex
        const distance = Math.abs(index - currentIndex)
        const opacity = isCurrent ? 1 : Math.max(0.25, 1 - distance * 0.18)

        return (
          <TouchableOpacity
            key={`${line.time}-${index}`}
            activeOpacity={0.7}
            onPress={() => handleLinePress(line.time)}
            style={[styles.lineWrap, { height: lineHeight }]}
          >
            <Text
              style={[
                styles.lineText,
                {
                  color: isCurrent ? colors.accent : colors.text,
                  fontSize: isCurrent ? fontSize.title3 : fontSize.body,
                  fontWeight: isCurrent ? '700' : '400',
                  opacity,
                },
              ]}
              numberOfLines={2}
            >
              {line.text}
            </Text>
            {line.translation && (
              <Text
                style={[
                  styles.translationText,
                  {
                    color: isCurrent ? colors.accent : colors.textSecondary,
                    opacity: opacity * 0.85,
                  },
                ]}
                numberOfLines={1}
              >
                {line.translation}
              </Text>
            )}
          </TouchableOpacity>
        )
      })}
    </ScrollView>
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
