/**
 * Single track list item component
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useTheme,
  spacing,
  fontSize,
  borderRadius,
  TRACK_ITEM_HEIGHT,
} from '../../theme';
import { Track } from '../../types/music';

interface TrackListItemProps {
  track: Track;
  index?: number;
  isPlaying?: boolean;
  isCurrentTrack?: boolean;
  showIndex?: boolean;
  onPress?: (track: Track) => void;
  onMorePress?: (track: Track) => void;
}

export default function TrackListItem({
  track,
  index,
  isPlaying = false,
  isCurrentTrack = false,
  showIndex = true,
  onPress,
  onMorePress,
}: TrackListItemProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.container, { height: TRACK_ITEM_HEIGHT }]}
      onPress={() => onPress?.(track)}
      activeOpacity={0.6}
    >
      {/* Left: Index or playing indicator */}
      {showIndex && (
        <View style={styles.indexContainer}>
          {isCurrentTrack ? (
            <Ionicons
              name={isPlaying ? 'volume-high' : 'pause'}
              size={16}
              color={colors.accent}
            />
          ) : (
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              ellipsizeMode="clip"
              style={[styles.index, { color: colors.textTertiary }]}
            >
              {(index ?? 0) + 1}
            </Text>
          )}
        </View>
      )}

      {/* Cover art (shown when index is hidden) */}
      {!showIndex && (
        <View
          style={[styles.cover, { backgroundColor: colors.surfaceElevated }]}
        >
          {track.coverUrl ? (
            <Image source={{ uri: track.coverUrl }} style={styles.coverImage} />
          ) : (
            <Ionicons
              name="musical-note"
              size={16}
              color={colors.textTertiary}
            />
          )}
        </View>
      )}

      {/* Track info */}
      <View style={[styles.info, showIndex && styles.infoWithIndex]}>
        <Text
          style={[
            styles.title,
            { color: isCurrentTrack ? colors.accent : colors.text },
          ]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text
          style={[styles.artist, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {track.artist}
          {track.album ? ` - ${track.album}` : ''}
        </Text>
      </View>

      {/* More button */}
      <TouchableOpacity
        style={styles.moreButton}
        activeOpacity={0.6}
        onPress={(event: GestureResponderEvent) => {
          event.stopPropagation?.();
          onMorePress?.(track);
        }}
      >
        <Ionicons
          name="ellipsis-horizontal"
          size={18}
          color={colors.textTertiary}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  indexContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 0,
  },
  index: {
    fontSize: fontSize.subhead,
    fontWeight: '500',
    textAlign: 'center',
  },
  cover: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: spacing.sm,
  },
  coverImage: {
    width: 46,
    height: 46,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  infoWithIndex: {
    marginLeft: spacing.sm,
  },
  title: {
    fontSize: fontSize.callout,
    fontWeight: '500',
  },
  artist: {
    fontSize: fontSize.caption1,
    marginTop: 2,
  },
  moreButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
