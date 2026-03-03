/**
 * OLED-first color tokens for Joy Music Mobile
 */

export interface ThemeColors {
  background: string
  surface: string
  surfaceElevated: string
  surfaceSecondary: string

  text: string
  textSecondary: string
  textTertiary: string

  accent: string
  accentBlue: string
  accentGreen: string
  accentWarning: string
  accentLight: string

  separator: string
  overlay: string
  tabBar: string
  tabBarBorder: string
  miniPlayer: string

  danger: string
  success: string
  warning: string

  cardGradientStart: string
  cardGradientEnd: string

  searchBackground: string
  searchPlaceholder: string

  tabBarGloss: string
  tabBarGlossEnd: string
  tabBarInnerBorder: string
  tabBarActiveIndicator: string

  glassSurface: string
  glassBorder: string
  focusRing: string
}

export const darkColors: ThemeColors = {
  background: '#06070B',
  surface: '#0F1220',
  surfaceElevated: '#151A2E',
  surfaceSecondary: '#0B0E18',

  text: '#F8FAFC',
  textSecondary: '#A8B3CF',
  textTertiary: '#6D7A98',

  accent: '#4DA3FF',
  accentBlue: '#4DA3FF',
  accentGreen: '#2BD576',
  accentWarning: '#F5B94C',
  accentLight: 'rgba(77, 163, 255, 0.18)',

  separator: 'rgba(255, 255, 255, 0.10)',
  overlay: 'rgba(6, 7, 11, 0.66)',
  tabBar: 'rgba(16, 20, 34, 0.72)',
  tabBarBorder: 'rgba(255, 255, 255, 0.14)',
  miniPlayer: 'rgba(17, 22, 38, 0.78)',

  danger: '#FF5A74',
  success: '#2BD576',
  warning: '#F5B94C',

  cardGradientStart: '#111628',
  cardGradientEnd: '#1A2240',

  searchBackground: 'rgba(255, 255, 255, 0.09)',
  searchPlaceholder: 'rgba(248, 250, 252, 0.58)',

  tabBarGloss: 'rgba(255, 255, 255, 0.22)',
  tabBarGlossEnd: 'rgba(255, 255, 255, 0.02)',
  tabBarInnerBorder: 'rgba(255, 255, 255, 0.24)',
  tabBarActiveIndicator: 'rgba(77, 163, 255, 0.24)',

  glassSurface: 'rgba(18, 24, 41, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.14)',
  focusRing: 'rgba(77, 163, 255, 0.44)',
}

export const lightColors: ThemeColors = {
  background: '#F3F7FF',
  surface: '#FFFFFF',
  surfaceElevated: '#F9FBFF',
  surfaceSecondary: '#E8EEF9',

  text: '#0C1428',
  textSecondary: '#334468',
  textTertiary: '#687A9F',

  accent: '#1C7CFF',
  accentBlue: '#1C7CFF',
  accentGreen: '#20B56A',
  accentWarning: '#DA9B2C',
  accentLight: 'rgba(28, 124, 255, 0.12)',

  separator: 'rgba(12, 20, 40, 0.10)',
  overlay: 'rgba(12, 20, 40, 0.32)',
  tabBar: 'rgba(255, 255, 255, 0.88)',
  tabBarBorder: 'rgba(12, 20, 40, 0.14)',
  miniPlayer: 'rgba(255, 255, 255, 0.92)',

  danger: '#E34D63',
  success: '#20B56A',
  warning: '#DA9B2C',

  cardGradientStart: '#FFFFFF',
  cardGradientEnd: '#EAF1FF',

  searchBackground: '#EFF4FF',
  searchPlaceholder: '#6D7A95',

  tabBarGloss: 'rgba(255, 255, 255, 0.8)',
  tabBarGlossEnd: 'rgba(255, 255, 255, 0.08)',
  tabBarInnerBorder: 'rgba(255, 255, 255, 0.75)',
  tabBarActiveIndicator: 'rgba(28, 124, 255, 0.16)',

  glassSurface: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(12, 20, 40, 0.14)',
  focusRing: 'rgba(28, 124, 255, 0.34)',
}
