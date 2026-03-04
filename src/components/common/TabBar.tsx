/**
 * iOS 26 液态玻璃胶囊底部导航栏。
 * 居中悬浮药丸形状，半透明模糊材质，带高光和投影。
 * 图标切换带缩放动画。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated, Dimensions } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, CAPSULE_TAB_HEIGHT, fontSize } from '../../theme'

export type TabName = 'discover' | 'leaderboard' | 'search' | 'playlist' | 'library'

interface TabBarProps {
  activeTab: TabName
  onTabChange: (tab: TabName) => void
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')

/** TabBar 总高度（内容区，不含 Safe Area 底部留白） */
const TAB_BAR_CONTENT_HEIGHT = 60

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

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()

  // 动态计算尺寸：
  // 底部满铺时，每个 Tab 的可用宽度应该是 屏幕宽度 除以 Tab 数量。
  // 但是指示滑块(Pill)本身我们可能想让它比整个格子稍微小一点点，留点呼吸感。
  const TAB_ITEM_WIDTH = SCREEN_WIDTH / tabs.length
  const PILL_WIDTH = Math.min(68, TAB_ITEM_WIDTH * 0.85) // 滑块不过宽
  const PILL_HEIGHT = TAB_BAR_CONTENT_HEIGHT - 12
  
  // 用于计算 Pill 在容器中的起始偏移量（居中对齐当前格）
  const getPillTranslateX = (index: number) => {
    return (index * TAB_ITEM_WIDTH) + (TAB_ITEM_WIDTH - PILL_WIDTH) / 2
  }

  const activeIndex = tabs.findIndex((t) => t.key === activeTab)

  /** 滑动药丸的水平位移 */
  const slideAnim = useRef(new Animated.Value(getPillTranslateX(activeIndex))).current

  /** 每个 tab 内容的缩放动画值 */
  const scaleAnims = useRef(tabs.map((_, i) =>
    new Animated.Value(i === activeIndex ? 1.05 : 0.9)
  )).current

  /** 透明度变化 */
  const opacityAnims = useRef(tabs.map((_, i) =>
    new Animated.Value(i === activeIndex ? 1 : 0.6)
  )).current

  useEffect(() => {
    const targetIndex = tabs.findIndex((t) => t.key === activeTab)
    const targetX = getPillTranslateX(targetIndex)

    Animated.spring(slideAnim, {
      toValue: targetX,
      useNativeDriver: true,
      tension: 250,
      friction: 20,
      restDisplacementThreshold: 0.05,
      restSpeedThreshold: 0.1,
    }).start()

    scaleAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: i === targetIndex ? 1.05 : 0.9,
        useNativeDriver: true,
        tension: 300,
        friction: 18,
      }).start()
    })

    opacityAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: i === targetIndex ? 1 : 0.5,
        duration: 200,
        useNativeDriver: true,
      }).start()
    })
  }, [activeTab, slideAnim, scaleAnims, opacityAnims])

  const handleTabPress = useCallback((tab: TabName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onTabChange(tab)
  }, [onTabChange])

  const activeIconColor = isDark ? '#FFFFFF' : '#000000'
  const inactiveIconColor = isDark ? '#EBEBF5' : '#3C3C43'
  
  const tabBarTotalHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom

  return (
    <View
      style={[
        styles.container,
        { height: tabBarTotalHeight },
      ]}
      pointerEvents="box-none"
    >
      {/* 液态玻璃底层 */}
      <BlurView
        intensity={isDark ? 55 : 85}
        tint={isDark ? 'dark' : 'light'}
        style={styles.absoluteFill}
      />
      
      {/* 补充色彩的基底层 */}
      <View
        style={[
          styles.absoluteFill,
          {
            backgroundColor: colors.tabBar,
          },
        ]}
      />
      
      {/* 深色模式不叠顶部高光，避免形成“顶部一条不同模糊度”的视觉分层 */}
      {!isDark && (
        <LinearGradient
          colors={[colors.tabBarGloss, colors.tabBarGlossEnd]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1.5 }}
          style={styles.glossTop}
          pointerEvents="none"
        />
      )}
      
      {/* 顶部发光微边框 */}
      <View
        style={[
          styles.topBorder,
          { backgroundColor: colors.tabBarInnerBorder },
        ]}
        pointerEvents="none"
      />

      {/* —— 内容区域 (去除 safe area insets 影响的部分) —— */}
      <View style={[styles.contentContainer, { height: TAB_BAR_CONTENT_HEIGHT }]}>
        {/* —— 滑动指示块 (Liquid Pill) —— */}
        <View style={styles.pillTrack}>
          <Animated.View
            style={[
              styles.activePillContainer,
              {
                transform: [{ translateX: slideAnim }],
                width: PILL_WIDTH,
                height: PILL_HEIGHT,
                backgroundColor: colors.tabBarActivePill,
                borderColor: colors.tabBarActivePillBorder,
              }
            ]}
          >
            <BlurView
                intensity={isDark ? 0 : 30} 
                tint={isDark ? 'dark' : 'light'} 
                style={styles.absoluteFill} 
            />
            <LinearGradient
              colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.1)']}
              style={styles.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />
          </Animated.View>
        </View>

        {/* —— Tab 交互区 —— */}
        <View style={styles.tabItemsContainer}>
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.key
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabItem, { width: TAB_ITEM_WIDTH }]}
                onPress={() => handleTabPress(tab.key)}
                hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
                activeOpacity={1}
              >
                <Animated.View
                  style={[
                    styles.tabContent,
                    {
                      transform: [{ scale: scaleAnims[index] }],
                      opacity: opacityAnims[index],
                    },
                  ]}
                >
                  <Ionicons
                    name={isActive ? tab.iconActive : tab.icon}
                    size={24}
                    color={isActive ? activeIconColor : inactiveIconColor}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color: isActive ? activeIconColor : inactiveIconColor,
                        fontWeight: isActive ? '700' : '500' // 中文的话，500 和 700 搭配比较好
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {tab.label}
                  </Text>
                </Animated.View>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    // 底部满铺由于占用了较大面积，可去掉大阴影，或者给一个非常轻微向上的阴影即可
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
  glossTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 30, // 满铺时高光层不用太深，只需顶部边缘反射
  },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  contentContainer: {
    width: '100%',
    flexDirection: 'row',
  },
  pillTrack: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    // 去除 padding，通过 getPillTranslateX 直接计算了全局偏移
  },
  activePillContainer: {
    borderRadius: 20, // 药丸更加圆润，不用完全 9999 因为它是圆角矩形质感更好
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
  },
  tabItemsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  tabItem: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: fontSize.caption1,
    letterSpacing: 0.2,
  },
})
