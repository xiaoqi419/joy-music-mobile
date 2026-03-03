/**
 * Joy Music Mobile - Root App Container
 */

import React from 'react'
import { StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as ReduxProvider } from 'react-redux'
import * as SplashScreen from 'expo-splash-screen'
import store from './src/store'
import AppShell from './src/app/AppShell'
import { installRuntimeLogger } from './src/core/logging/runtimeLogger'

installRuntimeLogger()
void SplashScreen.preventAutoHideAsync().catch(() => {
  // ignore startup race
})

export default function App() {
  return (
    <ReduxProvider store={store}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <SafeAreaProvider>
          <AppShell />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ReduxProvider>
  )
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
})
