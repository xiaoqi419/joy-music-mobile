/**
 * Application configuration
 */

export const appConfig = {
  // App info
  name: 'Joy Music Mobile',
  version: '1.0.0',
  description: 'A modern music player for iOS',

  // Display
  theme: {
    primary: '#1a8cde',
    secondary: '#f0f0f0',
    success: '#4caf50',
    danger: '#f44336',
    warning: '#ff9800',
  },

  // Music sources
  sources: {
    enabled: true,
    cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
  },

  // Storage
  storage: {
    maxCacheSize: 500 * 1024 * 1024, // 500MB
    cacheDir: 'Music/Cache',
  },

  // Network
  network: {
    timeout: 10000, // 10 seconds
    retryCount: 3,
  },

  // Playback
  playback: {
    autoPlay: false,
    preservePlaylist: true,
    gaplessPlayback: true,
  },
}

export default appConfig
