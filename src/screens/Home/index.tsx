/**
 * Home Screen - Main music player interface
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native'
import { useSelector } from 'react-redux'
import { RootState } from '../../store'

export default function HomeScreen() {
  const isDarkMode = useColorScheme() === 'dark'
  const playerState = useSelector((state: RootState) => state.player)
  const [activeTab, setActiveTab] = useState<'library' | 'search' | 'playlist'>('library')

  const backgroundColor = isDarkMode ? '#1a1a1a' : '#ffffff'
  const textColor = isDarkMode ? '#ffffff' : '#000000'
  const borderColor = isDarkMode ? '#333333' : '#e0e0e0'

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Text style={[styles.title, { color: textColor }]}>Joy Music</Text>
      </View>

      {/* Tab Navigation */}
      <View style={[styles.tabBar, { borderBottomColor: borderColor }]}>
        {(['library', 'search', 'playlist'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && styles.activeTab,
              { borderBottomColor: activeTab === tab ? '#1a8cde' : 'transparent' },
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? '#1a8cde' : textColor },
              ]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content Area */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'library' && (
          <View>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Your Library
            </Text>
            {playerState.playlist.length === 0 ? (
              <Text style={[styles.emptyText, { color: '#666666' }]}>
                No tracks in library
              </Text>
            ) : (
              playerState.playlist.map((track, index) => (
                <View
                  key={track.id}
                  style={[styles.trackItem, { borderBottomColor: borderColor }]}
                >
                  <View>
                    <Text style={[styles.trackTitle, { color: textColor }]}>
                      {track.title}
                    </Text>
                    <Text style={[styles.trackArtist, { color: '#999999' }]}>
                      {track.artist}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'search' && (
          <View>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Search Music
            </Text>
            <Text style={[styles.emptyText, { color: '#666666' }]}>
              Search functionality coming soon
            </Text>
          </View>
        )}

        {activeTab === 'playlist' && (
          <View>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Playlists
            </Text>
            <Text style={[styles.emptyText, { color: '#666666' }]}>
              No playlists yet
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Now Playing Bar */}
      {playerState.currentTrack && (
        <View style={[styles.nowPlayingBar, { borderTopColor: borderColor }]}>
          <View style={styles.nowPlayingContent}>
            <View style={styles.nowPlayingInfo}>
              <Text style={[styles.nowPlayingTitle, { color: textColor }]}>
                {playerState.currentTrack.title}
              </Text>
              <Text style={[styles.nowPlayingArtist, { color: '#999999' }]}>
                {playerState.currentTrack.artist}
              </Text>
            </View>
            <TouchableOpacity>
              <Text style={styles.playButton}>
                {playerState.isPlaying ? '⏸' : '▶'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 3,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 32,
  },
  trackItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  trackArtist: {
    fontSize: 13,
  },
  nowPlayingBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  nowPlayingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nowPlayingInfo: {
    flex: 1,
  },
  nowPlayingTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  nowPlayingArtist: {
    fontSize: 12,
  },
  playButton: {
    fontSize: 24,
  },
})
