/**
 * iOS 26 style spacing, typography, and border radius constants
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

export const fontSize = {
  largeTitle: 34,
  title1: 28,
  title2: 22,
  title3: 20,
  headline: 17,
  body: 17,
  callout: 16,
  subhead: 15,
  footnote: 13,
  caption1: 12,
  caption2: 11,
} as const

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const

export const TABBAR_HEIGHT = 64
export const MINI_PLAYER_HEIGHT = 64
export const TRACK_ITEM_HEIGHT = 56
export const CAPSULE_TAB_HEIGHT = 56
export const CAPSULE_BOTTOM_MARGIN = 4
export const BOTTOM_INSET = TABBAR_HEIGHT + MINI_PLAYER_HEIGHT + 16
