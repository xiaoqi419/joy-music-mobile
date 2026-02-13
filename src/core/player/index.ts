/**
 * Music player core module
 * Handles playback control using expo-audio
 * iOS compatible music player with source management
 */

export { playerController } from './controller'
export { expoAVPlayer } from './expoav'
export type { PlaybackStatus, PlayerConfig } from './expoav'
