/**
 * Config reducer for managing app configuration
 */

import { AppConfig } from '../../types/music'
import { ThemeMode } from '../../types/music'

const initialState: AppConfig = {
  theme: 'system',
  language: 'zh-CN',
  cachePath: '',
  maxCacheSize: 500 * 1024 * 1024, // 500MB
}

interface ConfigAction {
  type: string
  payload?: any
}

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'system' || value === 'light' || value === 'dark'

export default function configReducer(
  state = initialState,
  action: ConfigAction,
): AppConfig {
  switch (action.type) {
    case 'CONFIG_SET_THEME':
      if (!isThemeMode(action.payload)) return state
      return {
        ...state,
        theme: action.payload,
      }

    case 'CONFIG_SET_LANGUAGE':
      return {
        ...state,
        language: action.payload,
      }

    case 'CONFIG_SET_CACHE_PATH':
      return {
        ...state,
        cachePath: action.payload,
      }

    case 'CONFIG_SET_MAX_CACHE_SIZE':
      return {
        ...state,
        maxCacheSize: action.payload,
      }

    default:
      return state
  }
}
