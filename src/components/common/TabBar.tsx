/**
 * iOS 26 style bottom tab bar with frosted glass effect
 */

import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, spacing, fontSize } from '../../theme'

export type TabName = 'discover' | 'search' | 'library'

interface TabBarProps {
  activeTab: TabName
  onTabChange: (tab: TabName) => void
}

const tabs: { key: TabName; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'discover', label: '发现', icon: 'compass-outline', iconActive: 'compass' },
  { key: 'search', label: '搜索', icon: 'search-outline', iconActive: 'search' },
  { key: 'library', label: '我的', icon: 'musical-notes-outline', iconActive: 'musical-notes' },
]

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <BlurView
        intensity={80}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.border, { backgroundColor: colors.tabBarBorder }]} />
      <View style={styles.tabRow}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.6}
            >
              <Ionicons
                name={isActive ? tab.iconActive : tab.icon}
                size={24}
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
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  border: {
    height: StyleSheet.hairlineWidth,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  tabRow: {
    flexDirection: 'row',
    paddingTop: spacing.sm,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: fontSize.caption2,
    fontWeight: '500',
    marginTop: 2,
  },
})
