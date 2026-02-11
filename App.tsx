/**
 * Joy Music Mobile - Main App Component
 * iOS music player application powered by React Native + Expo
 */

import React, { useEffect } from 'react'
import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Provider as ReduxProvider } from 'react-redux'
import * as SplashScreen from 'expo-splash-screen'
import store from './src/store'
import HomeScreen from './src/screens/Home'

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync()

function App() {
  const isDarkMode = useColorScheme() === 'dark'

  useEffect(() => {
    // Hide splash screen after initial setup
    SplashScreen.hideAsync()
  }, [])

  return (
    <ReduxProvider store={store}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <AppContent isDarkMode={isDarkMode} />
      </SafeAreaProvider>
    </ReduxProvider>
  )
}

function AppContent({ isDarkMode }: { isDarkMode: boolean }) {
  const safeAreaInsets = useSafeAreaInsets()

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
          paddingTop: safeAreaInsets.top,
          paddingBottom: safeAreaInsets.bottom,
        },
      ]}
    >
      <HomeScreen />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})

export default App

