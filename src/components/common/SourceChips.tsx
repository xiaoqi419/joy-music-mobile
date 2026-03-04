/**
 * 音源平台选择器（横向滚动芯片列表）。
 * 用于发现页与排行榜页切换不同平台数据源。
 */

import React from 'react'
import { ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme, spacing, fontSize, borderRadius } from '../../theme'
import { DiscoverSourceId } from '../../types/discover'
import { discoverSourceList } from '../../core/discover'

interface SourceChipsProps {
  value: DiscoverSourceId
  onChange: (source: DiscoverSourceId) => void
}

/**
 * 渲染横向滚动的音源平台选择芯片。
 * @param value - 当前选中的音源 ID
 * @param onChange - 切换音源回调
 */
export default function SourceChips({ value, onChange }: SourceChipsProps) {
  const { colors } = useTheme()
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsWrap}
    >
      {discoverSourceList.map(item => {
        const active = item.id === value
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.accentLight : colors.surface,
                borderColor: active ? colors.accent : colors.separator,
              },
            ]}
            onPress={() => onChange(item.id)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? colors.accent : colors.textSecondary },
              ]}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  chipsWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
})
