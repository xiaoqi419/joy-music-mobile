/**
 * iOS 26 液态玻璃胶囊底部导航栏。
 * 居中悬浮药丸形状，半透明模糊材质，带高光和投影。
 * 图标切换带缩放动画。
 */

import React, { useCallback, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, CAPSULE_TAB_HEIGHT, CAPSULE_BOTTOM_MARGIN, fontSize } from '../../theme'

export type TabName = 'discover' | 'leaderboard' | 'search' | 'playlist' | 'library'

interface TabBarProps {
  activeTab: TabName
  onTabChange: (tab: TabName) => void
}

/** 胶囊内每个 tab 项的宽度 */
const TAB_ITEM_WIDTH = 60
/** 胶囊水平内边距 */
const CAPSULE_H_PADDING = 8

const tabs: {
  key: TabName
  label: string
  icon: keyof typeof Ionicons.glyphMap
  iconActive: keyof typeof Ionicons.glyphMap
}[] = [
  { key: 'discover', label: '发现', icon: 'compass-outline', iconActive: 'compass' },
  { key: 'leaderboard', label: '排行', icon: 'trophy-outline', iconActive: 'trophy' },
  { key: 'search', label: '搜索', icon: 'search-outline', iconActive: 'search' },
  { key: 'playlist', label: '歌单', icon: 'albums-outline', iconActive: 'albums' },
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

  /** 每个 tab 图标的缩放动画值 */
  const scaleAnims = useRef(tabs.map((_, i) =>
    new Animated.Value(i === activeIndex ? 1.04 : 0.88)
  )).current

  /** activeTab 变化时驱动缩放动画 */
  useEffect(() => {
    const targetIndex = tabs.findIndex((t) => t.key === activeTab)

    // 图标缩放：选中放大，其余缩小
    scaleAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: i === targetIndex ? 1.04 : 0.88,
        useNativeDriver: true,
        tension: 300,
        friction: 15,
      }).start()
    })
  }, [activeTab, scaleAnims])

  /** 切换 tab 时触发轻触觉反馈 */
  const handleTabPress = useCallback((tab: TabName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onTabChange(tab)
  }, [onTabChange])

  const activeLabelColor = isDark ? '#EAF4FF' : '#09345E'
  const inactiveLabelColor = isDark ? 'rgba(255, 255, 255, 0.70)' : 'rgba(28, 28, 30, 0.68)'

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
          intensity={isDark ? 78 : 92}
          tint={isDark ? 'dark' : 'light'}
          style={styles.glassLayer}
        />
        {/* 胶囊实体层：提升复杂背景下的对比度 */}
        <View
          style={[
            styles.baseLayer,
            {
              backgroundColor: colors.tabBar,
              borderColor: colors.tabBarBorder,
            },
          ]}
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

        {/* Tab 按钮 */}
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab.key)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
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
                  size={isActive ? 22 : 20}
                  color={isActive ? activeLabelColor : inactiveLabelColor}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                    { color: isActive ? activeLabelColor : inactiveLabelColor },
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
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 20,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  /** 液态玻璃模糊层 */
  glassLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  /** 胶囊基底层（提高对比） */
  baseLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: 0.75,
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
    gap: 2,
  },
  /** 中文标签 */
  tabLabel: {
    fontSize: fontSize.caption1 + 1,
  },
  tabLabelActive: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tabLabelInactive: {
    fontWeight: '600',
  },
})
