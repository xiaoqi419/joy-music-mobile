/**
 * Theme system entry point
 */

import { useColorScheme } from 'react-native'
import { darkColors, lightColors } from './colors'
import type { ThemeColors } from './colors'

export { spacing, fontSize, borderRadius, TABBAR_HEIGHT, MINI_PLAYER_HEIGHT, TRACK_ITEM_HEIGHT, BOTTOM_INSET, CAPSULE_TAB_HEIGHT, CAPSULE_BOTTOM_MARGIN } from './spacing'
export type { ThemeColors } from './colors'

export function useTheme(): { colors: ThemeColors; isDark: boolean } {
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'
  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
  }
}
