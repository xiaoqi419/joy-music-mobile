/**
 * iOS 26 液态玻璃胶囊底部导航栏。
 * 居中悬浮药丸形状，半透明模糊材质，带高光和投影。
 * 选中指示器带弹性滑动动画，图标切换带缩放动画。
 */

import React, { useCallback, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, CAPSULE_TAB_HEIGHT, CAPSULE_BOTTOM_MARGIN, fontSize } from '../../theme'

export type TabName = 'discover' | 'search' | 'library'

interface TabBarProps {
  activeTab: TabName
  onTabChange: (tab: TabName) => void
}

/** 胶囊内每个 tab 项的宽度 */
const TAB_ITEM_WIDTH = 64
/** 胶囊水平内边距 */
const CAPSULE_H_PADDING = 6
/** 选中态背景的尺寸 */
const ACTIVE_INDICATOR_WIDTH = 52
const ACTIVE_INDICATOR_HEIGHT = 44

/** 根据 tab 索引计算指示器的水平偏移量 */
const getIndicatorOffset = (index: number): number =>
  CAPSULE_H_PADDING + index * TAB_ITEM_WIDTH + (TAB_ITEM_WIDTH - ACTIVE_INDICATOR_WIDTH) / 2

const tabs: {
  key: TabName
  label: string
  icon: keyof typeof Ionicons.glyphMap
  iconActive: keyof typeof Ionicons.glyphMap
}[] = [
  { key: 'discover', label: '发现', icon: 'compass-outline', iconActive: 'compass' },
  { key: 'search', label: '搜索', icon: 'search-outline', iconActive: 'search' },
  { key: 'library', label: '我的', icon: 'musical-notes-outline', iconActive: 'musical-notes' },
]

/**
 * 渲染 iOS 26 风格的液态玻璃胶囊底部导航栏。
 * @param activeTab - 当前选中的 tab
 * @param onTabChange - tab 切换回调
 */
export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()

  const activeIndex = tabs.findIndex((t) => t.key === activeTab)

  /** 指示器水平滑动动画值 */
  const slideAnim = useRef(new Animated.Value(getIndicatorOffset(activeIndex))).current
  /** 每个 tab 图标的缩放动画值 */
  const scaleAnims = useRef(tabs.map((_, i) =>
    new Animated.Value(i === activeIndex ? 1 : 0.85)
  )).current

  /** activeTab 变化时驱动滑动和缩放动画 */
  useEffect(() => {
    const targetIndex = tabs.findIndex((t) => t.key === activeTab)

    // 指示器弹性滑动
    Animated.spring(slideAnim, {
      toValue: getIndicatorOffset(targetIndex),
      useNativeDriver: true,
      tension: 200,
      friction: 20,
    }).start()

    // 图标缩放：选中放大，其余缩小
    scaleAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: i === targetIndex ? 1 : 0.85,
        useNativeDriver: true,
        tension: 300,
        friction: 15,
      }).start()
    })
  }, [activeTab, slideAnim, scaleAnims])

  /** 切换 tab 时触发轻触觉反馈 */
  const handleTabPress = useCallback((tab: TabName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onTabChange(tab)
  }, [onTabChange])

  return (
    <View
      style={[
        styles.positioner,
        { bottom: Math.max(insets.bottom, 16) + CAPSULE_BOTTOM_MARGIN },
      ]}
    >
      <View style={styles.capsule}>
        {/* 液态玻璃模糊底层 */}
        <BlurView
          intensity={isDark ? 60 : 80}
          tint={isDark ? 'dark' : 'light'}
          style={styles.glassLayer}
        />

        {/* 顶部高光渐变 - 模拟玻璃折射光泽 */}
        <LinearGradient
          colors={[colors.tabBarGloss, colors.tabBarGlossEnd]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.glossLayer}
        />

        {/* 半透明内发光边框 */}
        <View
          style={[
            styles.innerBorder,
            { borderColor: colors.tabBarInnerBorder },
          ]}
        />

        {/* 滑动选中指示器 */}
        <Animated.View
          style={[
            styles.activeIndicator,
            {
              backgroundColor: colors.tabBarActiveIndicator,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        />

        {/* Tab 按钮 */}
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab.key)}
              activeOpacity={0.7}
            >
              <Animated.View
                style={[
                  styles.tabContent,
                  { transform: [{ scale: scaleAnims[index] }] },
                ]}
              >
                <Ionicons
                  name={isActive ? tab.iconActive : tab.icon}
                  size={20}
                  color={isActive ? colors.accent : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isActive ? colors.accent : colors.textTertiary },
                  ]}
                >
                  {tab.label}
                </Text>
              </Animated.View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  /** 外层定位容器，水平居中胶囊 */
  positioner: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  /** 胶囊主体 */
  capsule: {
    height: CAPSULE_TAB_HEIGHT,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CAPSULE_H_PADDING,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  /** 液态玻璃模糊层 */
  glassLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  /** 顶部高光渐变层 */
  glossLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CAPSULE_TAB_HEIGHT / 2,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  /** 半透明内发光边框 */
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    borderWidth: 0.5,
  },
  /** 滑动选中指示器（绝对定位，由 translateX 驱动） */
  activeIndicator: {
    position: 'absolute',
    top: (CAPSULE_TAB_HEIGHT - ACTIVE_INDICATOR_HEIGHT) / 2,
    left: 0,
    width: ACTIVE_INDICATOR_WIDTH,
    height: ACTIVE_INDICATOR_HEIGHT,
    borderRadius: ACTIVE_INDICATOR_HEIGHT / 2,
  },
  /** 单个 Tab 按钮 */
  tabItem: {
    width: TAB_ITEM_WIDTH,
    height: CAPSULE_TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Tab 内容容器（用于缩放动画） */
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  /** 中文标签 */
  tabLabel: {
    fontSize: fontSize.caption2,
    fontWeight: '500',
  },
})
