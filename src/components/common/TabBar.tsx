/**
 * Liquid glass bottom tab bar with Reanimated active indicator.
 */

import React, { useCallback, useEffect, useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme, CAPSULE_TAB_HEIGHT, CAPSULE_BOTTOM_MARGIN, fontSize, motion, triggerTabHaptic } from '../../theme'
import useReduceMotion from '../../hooks/useReduceMotion'

export type TabName = 'discover' | 'search' | 'playlist' | 'library'

interface TabBarProps {
  activeTab: TabName
  onTabChange: (tab: TabName) => void
}

const TAB_ITEM_WIDTH = 72
const CAPSULE_H_PADDING = 8

const tabs: {
  key: TabName
  label: string
  icon: keyof typeof Ionicons.glyphMap
  iconActive: keyof typeof Ionicons.glyphMap
}[] = [
  { key: 'discover', label: '发现', icon: 'compass-outline', iconActive: 'compass' },
  { key: 'search', label: '搜索', icon: 'search-outline', iconActive: 'search' },
  { key: 'playlist', label: '歌单', icon: 'albums-outline', iconActive: 'albums' },
  { key: 'library', label: '我的', icon: 'musical-notes-outline', iconActive: 'musical-notes' },
]

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReduceMotion()

  const activeIndex = useMemo(() => {
    const idx = tabs.findIndex((item) => item.key === activeTab)
    return idx < 0 ? 0 : idx
  }, [activeTab])

  const indicatorX = useSharedValue(activeIndex * TAB_ITEM_WIDTH)

  useEffect(() => {
    const target = activeIndex * TAB_ITEM_WIDTH
    if (reduceMotion) {
      indicatorX.value = target
      return
    }
    indicatorX.value = withTiming(target, {
      duration: motion.duration.base,
    })
  }, [activeIndex, indicatorX, reduceMotion])

  const handleTabPress = useCallback((tab: TabName) => {
    void triggerTabHaptic()
    onTabChange(tab)
  }, [onTabChange])

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: indicatorX.value }],
    }
  })

  const activeLabelColor = isDark ? colors.text : '#09345E'
  const inactiveLabelColor = isDark ? 'rgba(248, 250, 252, 0.72)' : 'rgba(12, 20, 40, 0.68)'

  return (
    <View
      style={[
        styles.positioner,
        { bottom: Math.max(insets.bottom, 16) + CAPSULE_BOTTOM_MARGIN },
      ]}
    >
      <View style={styles.capsule}>
        <BlurView
          intensity={isDark ? 88 : 94}
          tint={isDark ? 'dark' : 'light'}
          style={styles.glassLayer}
        />
        <View
          style={[
            styles.baseLayer,
            {
              backgroundColor: colors.tabBar,
              borderColor: colors.tabBarBorder,
            },
          ]}
        />
        <View style={[styles.glossLayer, { backgroundColor: colors.tabBarGloss }]} />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeIndicator,
            {
              backgroundColor: colors.tabBarActiveIndicator,
              borderColor: colors.glassBorder,
            },
            indicatorStyle,
          ]}
        />

        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab.key)}
              activeOpacity={0.86}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
            >
              <View style={styles.tabContent}>
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
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  capsule: {
    height: CAPSULE_TAB_HEIGHT,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CAPSULE_H_PADDING,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#020617',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 22,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  glassLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  baseLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  glossLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CAPSULE_TAB_HEIGHT * 0.5,
    borderRadius: 9999,
    opacity: 0.7,
  },
  activeIndicator: {
    position: 'absolute',
    left: CAPSULE_H_PADDING,
    top: 5,
    width: TAB_ITEM_WIDTH,
    height: CAPSULE_TAB_HEIGHT - 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    width: TAB_ITEM_WIDTH,
    minHeight: 44,
    height: CAPSULE_TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
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
