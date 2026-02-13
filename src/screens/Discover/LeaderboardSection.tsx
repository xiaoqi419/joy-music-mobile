/**
 * Leaderboard section - horizontal scrolling cards with gradient backgrounds
 */

import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { spacing, fontSize, borderRadius } from '../../theme'
import { LeaderboardBoardItem } from '../../types/discover'

const CARD_WIDTH = 280
const CARD_HEIGHT = 160

interface LeaderboardSectionProps {
  boards: LeaderboardBoardItem[]
  loading?: boolean
  error?: string | null
  onLeaderboardPress?: (board: LeaderboardBoardItem) => void
}

export default function LeaderboardSection({
  boards,
  loading = false,
  error = null,
  onLeaderboardPress,
}: LeaderboardSectionProps) {
  if (loading) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Loading charts...</Text>
      </View>
    )
  }
  if (error) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>{error}</Text>
      </View>
    )
  }
  if (boards.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>No charts available.</Text>
      </View>
    )
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      decelerationRate="fast"
      snapToInterval={CARD_WIDTH + spacing.md}
    >
      {boards.map((board, idx) => (
        <TouchableOpacity
          key={board.id}
          activeOpacity={0.8}
          onPress={() => onLeaderboardPress?.(board)}
        >
          <LinearGradient
            colors={getGradientByIndex(idx)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{board.name}</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
            </View>

            <Text style={styles.cardDescription}>
              {board.source.toUpperCase()} · Tap to open the full list
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

function getGradientByIndex(index: number): [string, string] {
  const gradients: Array<[string, string]> = [
    ['#FF6B6B', '#EE5A24'],
    ['#4ECDC4', '#44BD9E'],
    ['#A29BFE', '#6C5CE7'],
    ['#FFD166', '#F29E4C'],
    ['#74C0FC', '#4DABF7'],
  ]
  return gradients[index % gradients.length]
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: fontSize.title3,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardDescription: {
    fontSize: fontSize.caption2,
    color: 'rgba(255,255,255,0.6)',
  },
  emptyWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.subhead,
    color: '#8E8E93',
  },
})
