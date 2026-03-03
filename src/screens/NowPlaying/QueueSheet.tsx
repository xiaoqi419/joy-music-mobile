/**
 * QueueSheet - 播放队列底部弹出面板。
 * 从 NowPlaying/index.tsx 提取的独立组件，包含队列渲染、操作回调及内部状态。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  Pressable,
  Alert,
  FlatList,
  ListRenderItemInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme, spacing, fontSize, borderRadius, motion } from '../../theme';
import useReduceMotion from '../../hooks/useReduceMotion';
import { playerController } from '../../core/player';
import type { RootState } from '../../store';
import type { Track } from '../../types/music';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const QUEUE_SHEET_HEIGHT = Math.min(560, SCREEN_HEIGHT * 0.66);
const QUEUE_ITEM_HEIGHT = 56;

interface QueueSheetProps {
  visible: boolean;
  renderTrack: Track | null;
  animValue: Animated.Value;
  isPlaying: boolean;
  onClose: () => void;
  onSyncStore: () => void;
}

function QueueSheet({
  visible,
  renderTrack,
  animValue,
  isPlaying,
  onClose,
  onSyncStore,
}: QueueSheetProps) {
  const { colors, isDark } = useTheme();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const queue = useSelector((state: RootState) => state.player.playlist);
  const playlists = useSelector((state: RootState) => state.playlist.playlists);

  /* ── 队列内部状态 ── */
  const [queueDraft, setQueueDraft] = useState<Track[]>(queue);

  /* ── 身份工具 ── */
  const getTrackIdentityToken = useCallback(
    (track: Track | null | undefined): string => {
      if (!track) return '';
      const raw = track.id || track.songmid || track.hash || track.copyrightId;
      const normalized = String(raw || '').trim();
      if (normalized) return normalized;
      const title = String(track.title || '').trim();
      const artist = String(track.artist || '').trim();
      const duration = Number.isFinite(track.duration) ? String(track.duration) : '';
      return `${title}::${artist}::${duration}`.trim();
    },
    [],
  );

  const isValidTrack = useCallback(
    (track: Track | null | undefined): track is Track => {
      if (!track) return false;
      return getTrackIdentityToken(track).length > 0;
    },
    [getTrackIdentityToken],
  );

  const getTrackIdentity = useCallback(
    (track: Track) => {
      const source = String(track.source || 'unknown').toLowerCase();
      const token = getTrackIdentityToken(track);
      return `${source}::${token}`;
    },
    [getTrackIdentityToken],
  );

  const resolveQueueSnapshot = useCallback((): Track[] => {
    const runtimeQueue = playerController.getPlaylist().filter(isValidTrack);
    if (runtimeQueue.length) return runtimeQueue;
    const reduxQueue = queue.filter(isValidTrack);
    if (reduxQueue.length) return reduxQueue;
    return isValidTrack(renderTrack) ? [renderTrack] : [];
  }, [isValidTrack, queue, renderTrack]);

  /* ── 同步队列快照 ── */
  useEffect(() => {
    setQueueDraft(resolveQueueSnapshot());
  }, [queue, resolveQueueSnapshot, renderTrack?.id, renderTrack?.songmid, renderTrack?.source]);

  /* ── 派生列表数据 ── */
  const queueListData = useMemo(
    () => queueDraft.filter(isValidTrack),
    [isValidTrack, queueDraft],
  );
  const queueRenderData = useMemo(() => {
    if (queueListData.length > 0) return queueListData;
    return isValidTrack(renderTrack) ? [renderTrack] : [];
  }, [isValidTrack, queueListData, renderTrack]);

  const queueDisplayCount = useMemo(
    () => queueRenderData.length,
    [queueRenderData],
  );

  /* ── 关闭动画 ── */
  const closeQueueSheet = useCallback(() => {
    if (reduceMotion) {
      animValue.setValue(0);
      onClose();
      return;
    }
    Animated.timing(animValue, {
      toValue: 0,
      duration: motion.duration.quick,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  }, [animValue, onClose, reduceMotion]);

  /* ── 队列操作回调 ── */
  const handleAppendTrackToPlaylist = useCallback(
    (track: Track, playlistId: string) => {
      const targetPlaylist = playlists.find((item) => item.id === playlistId);
      if (!targetPlaylist) {
        Alert.alert('添加失败', '目标歌单不存在或已删除。');
        return;
      }

      const exists = targetPlaylist.tracks.some(
        (item) => getTrackIdentity(item) === getTrackIdentity(track),
      );
      if (exists) {
        Alert.alert('已存在', `「${track.title}」已经在「${targetPlaylist.name}」中。`);
        return;
      }

      dispatch({
        type: 'PLAYLIST_UPDATE',
        payload: {
          ...targetPlaylist,
          tracks: [...targetPlaylist.tracks, { ...track }],
          updatedAt: Date.now(),
        },
      });
      Alert.alert('添加成功', `已添加到「${targetPlaylist.name}」。`);
    },
    [dispatch, getTrackIdentity, playlists],
  );

  const handleAddQueueTrackToPlaylist = useCallback(
    (track: Track) => {
      if (!playlists.length) {
        Alert.alert('暂无自定义歌单', '请先在歌单页创建或导入歌单。');
        return;
      }
      Alert.alert(
        '添加到歌单',
        `选择要添加「${track.title}」的歌单`,
        [
          ...playlists.map((playlist) => ({
            text: playlist.name,
            onPress: () => {
              handleAppendTrackToPlaylist(track, playlist.id);
            },
          })),
          { text: '取消', style: 'cancel' as const },
        ],
      );
    },
    [handleAppendTrackToPlaylist, playlists],
  );

  const handleRemoveQueueTrack = useCallback(
    async (track: Track) => {
      try {
        const removed = await playerController.removeTrackFromQueue(track);
        if (!removed) {
          Alert.alert('提示', '当前播放列表中未找到该歌曲。');
          return;
        }
        const latestQueue = playerController.getPlaylist();
        setQueueDraft(latestQueue);
        if (!latestQueue.length) {
          onClose();
        }
        onSyncStore();
      } catch (error) {
        console.error('Remove queue track error:', error);
        Alert.alert('移除失败', '从播放列表移除歌曲失败，请稍后重试。');
      }
    },
    [onClose, onSyncStore],
  );

  const handleQueueTrackMorePress = useCallback(
    (track: Track) => {
      Alert.alert(
        '队列操作',
        `${track.title} · ${track.artist}`,
        [
          {
            text: '添加到歌单',
            onPress: () => {
              handleAddQueueTrackToPlaylist(track);
            },
          },
          {
            text: '移除播放列表',
            style: 'destructive',
            onPress: () => {
              void handleRemoveQueueTrack(track);
            },
          },
          { text: '取消', style: 'cancel' },
        ],
      );
    },
    [handleAddQueueTrackToPlaylist, handleRemoveQueueTrack],
  );

  const handleClearQueue = useCallback(() => {
    if (!queueRenderData.length) {
      Alert.alert('播放列表为空', '当前没有可清空的歌曲。');
      return;
    }
    Alert.alert(
      '清空播放列表',
      '清空后将停止播放，并移除当前队列中的全部歌曲。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await playerController.clearQueue();
                setQueueDraft([]);
                onSyncStore();
                closeQueueSheet();
              } catch (error) {
                console.error('Clear queue error:', error);
                Alert.alert('清空失败', '请稍后重试。');
              }
            })();
          },
        },
      ],
    );
  }, [closeQueueSheet, onSyncStore, queueRenderData.length]);

  const handleQueueTrackPress = useCallback(
    async (index: number) => {
      if (index < 0 || index >= queueRenderData.length) return;
      try {
        await playerController.playFromPlaylist(queueRenderData, index, {
          autoPlay: true,
        });
        onSyncStore();
        closeQueueSheet();
      } catch (error) {
        console.error('Play queue item error:', error);
        Alert.alert('播放失败', '切换到该歌曲失败，请稍后重试。');
      }
    },
    [closeQueueSheet, onSyncStore, queueRenderData],
  );

  /* ── 列表项渲染 ── */
  const renderQueueItem = useCallback(
    ({ item: track, index }: ListRenderItemInfo<Track>) => {
      if (!track) return null;
      const safeIndex = index >= 0 ? index : 0;
      const isCurrent = renderTrack
        ? getTrackIdentity(track) === getTrackIdentity(renderTrack)
        : false;

      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            void handleQueueTrackPress(safeIndex);
          }}
          style={[
            styles.queueItem,
            {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.separator,
              backgroundColor: isCurrent
                ? isDark
                  ? 'rgba(10,132,255,0.16)'
                  : 'rgba(0,122,255,0.1)'
                : isDark
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(0,0,0,0.03)',
            },
          ]}
        >
          <View style={styles.queueItemIndex}>
            <Text
              style={[
                styles.queueIndexText,
                { color: isCurrent ? colors.accent : colors.textTertiary },
              ]}
            >
              {safeIndex + 1}
            </Text>
          </View>
          <View style={styles.queueItemInfo}>
            <Text
              numberOfLines={1}
              style={[
                styles.queueItemTitle,
                { color: isCurrent ? colors.accent : colors.text },
              ]}
            >
              {track.title || '未知歌曲'}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.queueItemArtist, { color: colors.textSecondary }]}
            >
              {track.artist || '未知歌手'}
            </Text>
          </View>
          <View style={styles.queueItemActions}>
            {isCurrent && (
              <Ionicons
                name={isPlaying ? 'volume-high' : 'pause'}
                size={18}
                color={colors.accent}
              />
            )}
            <Pressable
              style={styles.queueMoreButton}
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation?.();
                handleQueueTrackMorePress(track);
              }}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
        </TouchableOpacity>
      );
    },
    [
      colors.accent,
      colors.separator,
      colors.text,
      colors.textSecondary,
      colors.textTertiary,
      getTrackIdentity,
      handleQueueTrackMorePress,
      handleQueueTrackPress,
      isDark,
      isPlaying,
      renderTrack,
    ],
  );

  /* ── 动画插值 ── */
  const queueSheetMaskOpacity = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const queueSheetTranslateY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [QUEUE_SHEET_HEIGHT + 24, 0],
  });

  /* ── 不可见时返回 null ── */
  if (!visible) return null;

  return (
    <View style={styles.queueSheetOverlay} pointerEvents="box-none">
      <Pressable
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        onPress={closeQueueSheet}
      >
        <Animated.View
          style={[
            styles.queueSheetMask,
            {
              opacity: queueSheetMaskOpacity,
            },
          ]}
        />
      </Pressable>
      <Animated.View
        style={[
          styles.queueSheet,
          {
            paddingBottom: insets.bottom + spacing.md,
            backgroundColor: isDark ? '#111317' : '#F8FAFD',
            borderColor: colors.separator,
            transform: [{ translateY: queueSheetTranslateY }],
            zIndex: 2,
          },
        ]}
      >
        <View style={styles.queueSheetHeader}>
          <Text style={[styles.queueSheetTitle, { color: colors.text }]}>
            当前播放列表
          </Text>
          <View style={styles.queueSheetHeaderRight}>
            <Text
              style={[
                styles.queueSheetCount,
                { color: colors.textSecondary },
              ]}
            >
              共 {queueDisplayCount} 首
            </Text>
            <TouchableOpacity
              style={[
                styles.queueHeaderAction,
                {
                  borderColor: colors.separator,
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.04)',
                  opacity: queueDisplayCount > 0 ? 1 : 0.45,
                },
              ]}
              activeOpacity={0.78}
              disabled={queueDisplayCount <= 0}
              onPress={handleClearQueue}
            >
              <Ionicons
                name="trash-outline"
                size={15}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.queueListGestureLayer}>
          {queueRenderData.length === 0 ? (
            <View style={styles.queueEmptyState}>
              <Text
                style={[
                  styles.queueEmptyText,
                  { color: colors.textSecondary },
                ]}
              >
                暂无可展示的歌曲
              </Text>
            </View>
          ) : (
            <FlatList
              style={styles.queueSheetScroll}
              contentContainerStyle={styles.queueSheetList}
              data={queueRenderData}
              keyExtractor={(track, index) =>
                `${getTrackIdentity(track)}_${index}`
              }
              showsVerticalScrollIndicator={false}
              renderItem={renderQueueItem}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

export default React.memo(QueueSheet);

const styles = StyleSheet.create({
  queueSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 200,
  },
  queueSheetMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  queueSheet: {
    height: QUEUE_SHEET_HEIGHT,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  queueSheetHeader: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  queueSheetHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  queueSheetTitle: {
    fontSize: fontSize.title3,
    fontWeight: '700',
  },
  queueSheetCount: {
    fontSize: fontSize.footnote,
  },
  queueHeaderAction: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueSheetScroll: {
    flex: 1,
  },
  queueSheetList: {
    paddingBottom: spacing.sm,
    flexGrow: 1,
  },
  queueListGestureLayer: {
    flex: 1,
    minHeight: QUEUE_ITEM_HEIGHT + spacing.md,
  },
  queueEmptyState: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  queueEmptyText: {
    fontSize: fontSize.callout,
  },
  queueItem: {
    height: QUEUE_ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  queueItemIndex: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  queueIndexText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  queueItemInfo: {
    flex: 1,
  },
  queueItemTitle: {
    fontSize: fontSize.callout,
    fontWeight: '600',
  },
  queueItemArtist: {
    fontSize: fontSize.caption1,
    marginTop: 2,
  },
  queueItemActions: {
    minWidth: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  queueMoreButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
