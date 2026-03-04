/**
 * Theme system entry point
 */

import { useColorScheme } from 'react-native'
import { useSelector } from 'react-redux'
import { darkColors, lightColors } from './colors'
import type { ThemeColors } from './colors'
import type { RootState } from '../store'
import type { ThemeMode } from '../types/music'

export { spacing, fontSize, borderRadius, TABBAR_HEIGHT, MINI_PLAYER_HEIGHT, TRACK_ITEM_HEIGHT, BOTTOM_INSET, CAPSULE_TAB_HEIGHT, CAPSULE_BOTTOM_MARGIN } from './spacing'
export type { ThemeColors } from './colors'

export function useTheme(): { colors: ThemeColors; isDark: boolean; themeMode: ThemeMode } {
  const systemScheme = useColorScheme()
  const themeMode = useSelector((state: RootState) => state.config.theme)
  const isDark = themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark'
  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    themeMode,
  }
}
