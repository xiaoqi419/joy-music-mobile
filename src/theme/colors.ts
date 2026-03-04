/**
 * iOS 26 style color system
 * Dark mode uses true OLED black, light mode uses SF-style grays
 */

export interface ThemeColors {
  // Backgrounds
  background: string
  surface: string
  surfaceElevated: string
  surfaceSecondary: string

  // Text
  text: string
  textSecondary: string
  textTertiary: string

  // Accent
  accent: string
  accentLight: string

  // UI Elements
  separator: string
  overlay: string
  tabBar: string
  tabBarBorder: string
  miniPlayer: string

  // Semantic
  danger: string
  success: string
  warning: string

  // Cards
  cardGradientStart: string
  cardGradientEnd: string

  // Search
  searchBackground: string
  searchPlaceholder: string

  // Liquid Glass TabBar
  tabBarGloss: string
  tabBarGlossEnd: string
  tabBarInnerBorder: string
  tabBarActiveIndicator: string
}

export const darkColors: ThemeColors = {
  background: '#000000',
  surface: '#1C1C1E',
  surfaceElevated: '#2C2C2E',
  surfaceSecondary: '#121212',

  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  textTertiary: '#48484A',

  accent: '#0A84FF',
  accentLight: 'rgba(10, 132, 255, 0.15)',

  separator: 'rgba(84, 84, 88, 0.36)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tabBar: 'rgba(30, 30, 30, 0.85)',
  tabBarBorder: 'rgba(255, 255, 255, 0.08)',
  miniPlayer: 'rgba(44, 44, 46, 0.92)',

  danger: '#FF453A',
  success: '#30D158',
  warning: '#FF9F0A',

  cardGradientStart: '#1C1C1E',
  cardGradientEnd: '#2C2C2E',

  searchBackground: '#1C1C1E',
  searchPlaceholder: '#8E8E93',

  tabBarGloss: 'rgba(255, 255, 255, 0.12)',
  tabBarGlossEnd: 'rgba(255, 255, 255, 0.0)',
  tabBarInnerBorder: 'rgba(255, 255, 255, 0.18)',
  tabBarActiveIndicator: 'rgba(255, 255, 255, 0.15)',
}

export const lightColors: ThemeColors = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSecondary: '#E5E5EA',

  text: '#000000',
  textSecondary: '#3C3C43',
  textTertiary: '#8E8E93',

  accent: '#007AFF',
  accentLight: 'rgba(0, 122, 255, 0.1)',

  separator: 'rgba(60, 60, 67, 0.12)',
  overlay: 'rgba(0, 0, 0, 0.4)',
  tabBar: 'rgba(249, 249, 249, 0.94)',
  tabBarBorder: 'rgba(0, 0, 0, 0.08)',
  miniPlayer: 'rgba(255, 255, 255, 0.94)',

  danger: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',

  cardGradientStart: '#FFFFFF',
  cardGradientEnd: '#F2F2F7',

  searchBackground: '#E5E5EA',
  searchPlaceholder: '#8E8E93',

  tabBarGloss: 'rgba(255, 255, 255, 0.7)',
  tabBarGlossEnd: 'rgba(255, 255, 255, 0.0)',
  tabBarInnerBorder: 'rgba(255, 255, 255, 0.6)',
  tabBarActiveIndicator: 'rgba(0, 0, 0, 0.08)',
}
