import AsyncStorage from '@react-native-async-storage/async-storage'
import { ThemeMode } from '../../types/music'

const THEME_MODE_KEY = '@joy_config_theme_mode'

let themeModeCache: ThemeMode | null = null
let saveThemeTimer: ReturnType<typeof setTimeout> | null = null

function safeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system'
}

export async function loadThemeMode(): Promise<ThemeMode> {
  if (themeModeCache) return themeModeCache
  try {
    const raw = await AsyncStorage.getItem(THEME_MODE_KEY)
    themeModeCache = safeThemeMode(raw)
    return themeModeCache
  } catch {
    themeModeCache = 'system'
    return themeModeCache
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  themeModeCache = safeThemeMode(mode)
  if (saveThemeTimer) clearTimeout(saveThemeTimer)
  // 轻量防抖，避免短时间多次点击写入抖动。
  saveThemeTimer = setTimeout(() => {
    void AsyncStorage.setItem(THEME_MODE_KEY, themeModeCache as ThemeMode)
  }, 180)
}
