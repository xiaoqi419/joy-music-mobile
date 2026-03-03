/**
 * Section header with title and optional "see more" action
 */

import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, spacing, fontSize } from '../../theme'

interface SectionHeaderProps {
  title: string
  showMore?: boolean
  onMorePress?: () => void
}

export default function SectionHeader({ title, showMore = false, onMorePress }: SectionHeaderProps) {
  const { colors } = useTheme()

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {showMore && (
        <TouchableOpacity
          style={styles.moreButton}
          onPress={onMorePress}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`${title} 更多`}
        >
          <Text style={[styles.moreText, { color: colors.textSecondary }]}>更多</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.title3,
    fontWeight: '700',
  },
  moreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  moreText: {
    fontSize: fontSize.subhead,
  },
})
