/**
 * Theme system entry point
 */

import { useColorScheme } from 'react-native'
import { useSelector } from 'react-redux'
import { darkColors, lightColors } from './colors'
import type { ThemeColors } from './colors'
import type { RootState } from '../store'
import type { ThemeMode } from '../types/music'

export {
  spacing,
  fontSize,
  borderRadius,
  TABBAR_HEIGHT,
  MINI_PLAYER_HEIGHT,
  TRACK_ITEM_HEIGHT,
  BOTTOM_INSET,
  CAPSULE_TAB_HEIGHT,
  CAPSULE_BOTTOM_MARGIN,
} from './spacing'

export { motion, type MotionTokens } from './motion'
export {
  triggerTabHaptic,
  triggerPlaybackHaptic,
  triggerDestructiveHaptic,
  triggerSelectionHaptic,
} from './haptics'
export type { ThemeColors } from './colors'

export function useTheme(): { colors: ThemeColors; isDark: boolean; themeMode: ThemeMode } {
  const systemScheme = useColorScheme()
  const themeMode = useSelector((state: RootState) => state.config.theme)
  const preferDark = themeMode === 'system' ? systemScheme !== 'light' : themeMode === 'dark'

  return {
    colors: preferDark ? darkColors : lightColors,
    isDark: preferDark,
    themeMode,
  }
}
