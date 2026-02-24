/**
 * Now Playing 全屏播放页面。
 * 封面/歌词双视图切换 + 圆形旋转唱片封面 + 实时歌词滚动。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
  Platform,
  Dimensions,
  ScrollView,
  Pressable,
  Alert,
  PanResponder,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme, spacing, fontSize, borderRadius } from '../../theme';
import { usePlayerStatus } from '../../hooks/usePlayerStatus';
import { useSwipeDownClose } from '../../hooks/useSwipeDownClose';
import { playerController, type PlayMode } from '../../core/player';
import type { Quality } from '../../core/music';
import { ALL_QUALITIES } from '../../core/config/musicSource';
import { getLyric, LyricData } from '../../core/lyric';
import LyricsView from '../../components/common/LyricsView';
import type { RootState } from '../../store';
import type { Track } from '../../types/music';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
/** 封面视图模式下的封面直径 */
const COVER_SIZE_LG = Math.min(320, SCREEN_WIDTH - 72);
const QUEUE_SHEET_HEIGHT = Math.min(560, SCREEN_HEIGHT * 0.66);
const QUEUE_ITEM_HEIGHT = 56;
const QUEUE_DRAG_LONG_PRESS_MS = 220;
const QUALITY_PRIORITY: Quality[] = ['master', 'atmos_plus', 'atmos', 'hires', 'flac24bit', 'flac', '320k', '128k'];
const QUALITY_LABELS: Record<Quality, string> = {
  master: '母带',
  atmos_plus: '全景增强',
  atmos: '全景环绕',
  hires: '高解析',
  flac24bit: '24位无损',
  flac: '无损',
  '320k': '高品质',
  '128k': '标准',
};

function getPlayModeFromState(
  repeatMode: RootState['player']['repeatMode'],
  shuffleMode: RootState['player']['shuffleMode'],
): PlayMode {
  if (shuffleMode) return 'shuffle'
  if (repeatMode === 'all') return 'list_loop'
  if (repeatMode === 'one') return 'single_loop'
  return 'list_once'
}

function getPlayModeIcon(mode: PlayMode): keyof typeof Ionicons.glyphMap {
  switch (mode) {
    case 'list_loop':
      return 'repeat'
    case 'single_loop':
      return 'repeat'
    case 'shuffle':
      return 'shuffle'
    case 'list_once':
    default:
      return 'play-skip-forward-outline'
  }
}

type ViewTab = 'cover' | 'lyrics';

interface NowPlayingProps {
  onClose: () => void;
}

/**
 * 格式化毫秒为 m:ss 时间字符串。
 */
function formatMs(ms: number): string {
  const totalSec = Math.floor((ms || 0) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function clampIndex(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moveQueueItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return list;
  const next = [...list];
  const [movingItem] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, movingItem);
  return next;
}

/**
 * 渲染全屏播放页面。
 * @param onClose - 关闭回调（返回上一页）
 */
export default function NowPlaying({ onClose }: NowPlayingProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const { currentTrack, isPlaying, position, duration } = usePlayerStatus();
  const queue = useSelector((state: RootState) => state.player.playlist);
  const queueCurrentIndex = useSelector((state: RootState) => state.player.currentIndex);
  const reduxCurrentTrack = useSelector((state: RootState) => state.player.currentTrack);
  const playlists = useSelector((state: RootState) => state.playlist.playlists);
  const repeatMode = useSelector((state: RootState) => state.player.repeatMode);
  const shuffleMode = useSelector((state: RootState) => state.player.shuffleMode);
  const preferredQuality = useSelector((state: RootState) => state.musicSource.preferredQuality);
  const importedSources = useSelector((state: RootState) => state.musicSource.importedSources);
  const selectedImportedSourceId = useSelector((state: RootState) => state.musicSource.selectedImportedSourceId);

  /* ── 视图切换 ── */
  const [activeTab, setActiveTab] = useState<ViewTab>('cover');

  /* ── 进度条拖动状态（用 ref 同步追踪，避免 setState 异步延迟导致闪回） ── */
  const isDraggingRef = useRef(false);
  const [sliderValue, setSliderValue] = useState(0);

  /* ── 顶部下滑关闭手势 ── */
  const { panY, panHandlers } = useSwipeDownClose(onClose, insets.top + 120);

  /* ── 歌词状态 ── */
  const [lyricData, setLyricData] = useState<LyricData>({
    lines: [],
    rawLrc: '',
    rawTlrc: '',
  });
  const [lyricLoading, setLyricLoading] = useState(false);

  /* ── 旋转动画 ── */
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const rotateLoop = useRef<Animated.CompositeAnimation | null>(null);

  /* ── 封面/歌词切换动画（0=cover, 1=lyrics） ── */
  const viewSwitchAnim = useRef(new Animated.Value(0)).current;
  const coverBtnAnim = useRef(new Animated.Value(1)).current;
  const lyricsBtnAnim = useRef(new Animated.Value(0)).current;
  const queueSheetAnim = useRef(new Animated.Value(0)).current;
  const [queueSheetVisible, setQueueSheetVisible] = useState(false);
  const [queueDraft, setQueueDraft] = useState(queue);
  const [queueDragFromIndex, setQueueDragFromIndex] = useState<number | null>(null);
  const [queueDragToIndex, setQueueDragToIndex] = useState<number | null>(null);
  const queueDragFromRef = useRef<number | null>(null);
  const queueDragCurrentRef = useRef<number | null>(null);
  const queuePressSuppressRef = useRef(false);
  const queuePressSuppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isResolvingTrack, setIsResolvingTrack] = useState(() => playerController.isResolvingTrack());
  const [resolvingHint, setResolvingHint] = useState(() => playerController.getResolvingHint());
  const [resolvedQuality, setResolvedQuality] = useState<Quality | null>(() => playerController.getCurrentResolvedQuality());
  const [qualityMenuVisible, setQualityMenuVisible] = useState(false);
  const currentPlayMode = useMemo(
    () => getPlayModeFromState(repeatMode, shuffleMode),
    [repeatMode, shuffleMode],
  )
  const controllerCurrentTrack = playerController.getCurrentTrack();
  const controllerQueue = playerController.getPlaylist();
  const controllerCurrentIndex = playerController.getCurrentIndex();
  const activeTrack = useMemo(() => {
    if (currentTrack) return currentTrack;
    if (reduxCurrentTrack) return reduxCurrentTrack;
    if (controllerCurrentTrack) return controllerCurrentTrack;
    if (queueCurrentIndex >= 0 && queueCurrentIndex < queue.length) {
      return queue[queueCurrentIndex];
    }
    if (controllerCurrentIndex >= 0 && controllerCurrentIndex < controllerQueue.length) {
      return controllerQueue[controllerCurrentIndex];
    }
    if (queue.length > 0) {
      return queue[0];
    }
    if (controllerQueue.length > 0) {
      return controllerQueue[0];
    }
    return null;
  }, [
    controllerCurrentIndex,
    controllerCurrentTrack,
    controllerQueue,
    currentTrack,
    queue,
    queueCurrentIndex,
    reduxCurrentTrack,
  ]);
  const [displayTrack, setDisplayTrack] = useState<Track | null>(null);
  const fallbackTrack = queueDraft.find(Boolean) || queue.find(Boolean) || controllerQueue.find(Boolean) || null;
  const renderTrack = activeTrack || displayTrack || fallbackTrack;

  const selectedSourceConfig = useMemo(
    () => importedSources.find((item) => item.id === selectedImportedSourceId),
    [importedSources, selectedImportedSourceId],
  );
  const currentTrackPlatform = (renderTrack?.source || 'kw').toLowerCase();
  const availableQualities = useMemo(() => {
    const platformQualities = selectedSourceConfig?.platforms?.[currentTrackPlatform]?.qualitys;
    const raw = platformQualities?.length ? platformQualities : ALL_QUALITIES;
    const ordered = QUALITY_PRIORITY.filter((item) => raw.includes(item));
    return ordered.length ? ordered : raw;
  }, [selectedSourceConfig, currentTrackPlatform]);
  const qualityDisplay = QUALITY_LABELS[resolvedQuality || preferredQuality];

  useEffect(() => {
    const unsubscribeResolving = playerController.onResolvingChange(setIsResolvingTrack);
    const unsubscribeHint = playerController.onResolvingHintChange(setResolvingHint);
    const unsubscribeQuality = playerController.onResolvedQualityChange(setResolvedQuality);
    return () => {
      unsubscribeResolving();
      unsubscribeHint();
      unsubscribeQuality();
    };
  }, []);

  useEffect(() => {
    setQualityMenuVisible(false);
  }, [activeTab, queueSheetVisible, renderTrack?.id]);

  useEffect(() => {
    if (!activeTrack) return;
    setDisplayTrack(activeTrack);
  }, [activeTrack]);

  useEffect(() => {
    if (queueDragFromRef.current !== null) return;
    setQueueDraft(queue);
  }, [queue]);

  useEffect(() => {
    return () => {
      if (queuePressSuppressTimerRef.current) {
        clearTimeout(queuePressSuppressTimerRef.current);
        queuePressSuppressTimerRef.current = null;
      }
    };
  }, []);

  /** 播放时启动匀速旋转，暂停时停在当前角度 */
  useEffect(() => {
    if (isPlaying) {
      const loop = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 20000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      rotateLoop.current = loop;
      loop.start();
      return () => loop.stop();
    }
    if (rotateLoop.current) {
      rotateLoop.current.stop();
      rotateLoop.current = null;
    }
  }, [isPlaying, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  /** 标签页切换动画 */
  useEffect(() => {
    Animated.timing(viewSwitchAnim, {
      toValue: activeTab === 'lyrics' ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // 按钮状态动画
    if (activeTab === 'cover') {
      Animated.parallel([
        Animated.timing(coverBtnAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(lyricsBtnAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(coverBtnAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(lyricsBtnAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [activeTab, viewSwitchAnim, coverBtnAnim, lyricsBtnAnim]);

  /* ── 歌曲切换时获取歌词 ── */
  useEffect(() => {
    if (!renderTrack) {
      setLyricData({ lines: [], rawLrc: '', rawTlrc: '' });
      return;
    }

    let active = true;
    setLyricLoading(true);

    getLyric(renderTrack)
      .then(data => {
        if (active) setLyricData(data);
      })
      .catch(() => {
        if (active) setLyricData({ lines: [], rawLrc: '', rawTlrc: '' });
      })
      .finally(() => {
        if (active) setLyricLoading(false);
      });

    return () => {
      active = false;
    };
  }, [renderTrack?.id, renderTrack?.source, renderTrack?.songmid]);

  /* ── 进度 ── */
  const progress = useMemo(() => {
    if (!duration) return 0;
    return Math.max(0, Math.min(1, position / duration));
  }, [position, duration]);

  /** Slider 显示值：拖动时由 onValueChange 更新，非拖动时由 useEffect 同步 */

  /** 点击歌词行跳转 */
  const handleLyricSeek = useCallback((timeMs: number) => {
    void playerController.seek(timeMs);
  }, []);

  const syncPlayerSnapshotToStore = useCallback(() => {
    const snapshot = playerController.getPlayerState()
    dispatch({
      type: 'PLAYER_SYNC_STATE',
      payload: {
        ...snapshot,
        playlist: playerController.getPlaylist(),
        currentIndex: playerController.getCurrentIndex(),
        currentTrack: playerController.getCurrentTrack(),
      },
    })
  }, [dispatch])

  const getTrackIdentity = useCallback((track: Track) => {
    return `${track.source || 'unknown'}::${track.id}`;
  }, []);

  useEffect(() => {
    if (!renderTrack) return;
    const runtimeQueue = playerController.getPlaylist();
    if (runtimeQueue.length > 0) return;
    playerController.setPlaylist([renderTrack]);
    syncPlayerSnapshotToStore();
  }, [renderTrack, syncPlayerSnapshotToStore]);

  const handleSelectQuality = useCallback(async(nextQuality: Quality) => {
    setQualityMenuVisible(false);
    dispatch({ type: 'MUSIC_SOURCE_SET_QUALITY', payload: nextQuality });

    if (!renderTrack) return;

    const resumePosition = position;
    const shouldAutoPlay = isPlaying;
    try {
      await playerController.playTrack(renderTrack, {
        autoPlay: shouldAutoPlay,
        quality: nextQuality,
      });
      if (resumePosition > 0) {
        await playerController.seek(resumePosition);
      }
      syncPlayerSnapshotToStore();
    } catch (error) {
      console.error('Change quality error:', error);
      Alert.alert('切换音质失败', error instanceof Error ? error.message : '请稍后重试');
    }
  }, [dispatch, isPlaying, position, renderTrack, syncPlayerSnapshotToStore]);

  const handleAppendTrackToPlaylist = useCallback((track: Track, playlistId: string) => {
    const targetPlaylist = playlists.find((item) => item.id === playlistId);
    if (!targetPlaylist) {
      Alert.alert('添加失败', '目标歌单不存在或已删除。');
      return;
    }

    const exists = targetPlaylist.tracks.some((item) => getTrackIdentity(item) === getTrackIdentity(track));
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
  }, [dispatch, getTrackIdentity, playlists]);

  const handleAddQueueTrackToPlaylist = useCallback((track: Track) => {
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
  }, [handleAppendTrackToPlaylist, playlists]);

  const handleRemoveQueueTrack = useCallback(async(track: Track) => {
    try {
      const removed = await playerController.removeTrackFromQueue(track);
      if (!removed) {
        Alert.alert('提示', '当前播放列表中未找到该歌曲。');
        return;
      }
      const latestQueue = playerController.getPlaylist();
      setQueueDraft(latestQueue);
      if (!latestQueue.length) {
        setQueueSheetVisible(false);
      }
      syncPlayerSnapshotToStore();
    } catch (error) {
      console.error('Remove queue track error:', error);
      Alert.alert('移除失败', '从播放列表移除歌曲失败，请稍后重试。');
    }
  }, [syncPlayerSnapshotToStore]);

  const handleQueueTrackMorePress = useCallback((track: Track) => {
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
  }, [handleAddQueueTrackToPlaylist, handleRemoveQueueTrack]);

  const finishQueueDrag = useCallback(() => {
    const fromIndex = queueDragFromRef.current;
    const toIndex = queueDragCurrentRef.current;

    queueDragFromRef.current = null;
    queueDragCurrentRef.current = null;
    setQueueDragFromIndex(null);
    setQueueDragToIndex(null);

    if (fromIndex === null || toIndex === null || fromIndex === toIndex) {
      return;
    }
    const moved = playerController.moveTrackInQueue(fromIndex, toIndex);
    if (!moved) {
      setQueueDraft(playerController.getPlaylist());
      return;
    }
    setQueueDraft(playerController.getPlaylist());
    syncPlayerSnapshotToStore();
  }, [syncPlayerSnapshotToStore]);

  const queueDragResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return queueDragFromRef.current !== null && Math.abs(gestureState.dy) > 2;
    },
    onMoveShouldSetPanResponderCapture: (_, gestureState) => {
      return queueDragFromRef.current !== null && Math.abs(gestureState.dy) > 2;
    },
    onPanResponderMove: (_, gestureState) => {
      const dragStartIndex = queueDragFromRef.current;
      if (dragStartIndex === null || queueDraft.length <= 1) return;
      const estimateIndex = clampIndex(
        Math.round(dragStartIndex + gestureState.dy / QUEUE_ITEM_HEIGHT),
        0,
        queueDraft.length - 1,
      );
      const currentIndex = queueDragCurrentRef.current ?? dragStartIndex;
      if (estimateIndex === currentIndex) return;

      setQueueDraft((prev) => moveQueueItem(prev, currentIndex, estimateIndex));
      queueDragCurrentRef.current = estimateIndex;
      setQueueDragToIndex(estimateIndex);
    },
    onPanResponderRelease: () => {
      finishQueueDrag();
    },
    onPanResponderTerminate: () => {
      finishQueueDrag();
    },
  }), [finishQueueDrag, queueDraft.length]);

  const handleQueueItemLongPress = useCallback((index: number) => {
    if (index < 0 || index >= queueDraft.length) return;
    if (queueDragFromRef.current !== null) return;
    queuePressSuppressRef.current = true;
    if (queuePressSuppressTimerRef.current) {
      clearTimeout(queuePressSuppressTimerRef.current);
    }
    queuePressSuppressTimerRef.current = setTimeout(() => {
      queuePressSuppressRef.current = false;
      queuePressSuppressTimerRef.current = null;
    }, 320);
    queueDragFromRef.current = index;
    queueDragCurrentRef.current = index;
    setQueueDragFromIndex(index);
    setQueueDragToIndex(index);
  }, [queueDraft.length]);

  const openQueueSheet = useCallback(() => {
    if (!queue.length) {
      Alert.alert('播放列表为空', '当前还没有可播放的歌曲。');
      return;
    }
    setQueueDraft(queue);
    queuePressSuppressRef.current = false;
    if (queuePressSuppressTimerRef.current) {
      clearTimeout(queuePressSuppressTimerRef.current);
      queuePressSuppressTimerRef.current = null;
    }
    queueDragFromRef.current = null;
    queueDragCurrentRef.current = null;
    setQueueDragFromIndex(null);
    setQueueDragToIndex(null);
    setQueueSheetVisible(true);
    queueSheetAnim.setValue(0);
    Animated.spring(queueSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 230,
      friction: 24,
    }).start();
  }, [queue, queueSheetAnim]);

  const closeQueueSheet = useCallback(() => {
    queuePressSuppressRef.current = false;
    if (queuePressSuppressTimerRef.current) {
      clearTimeout(queuePressSuppressTimerRef.current);
      queuePressSuppressTimerRef.current = null;
    }
    queueDragFromRef.current = null;
    queueDragCurrentRef.current = null;
    setQueueDragFromIndex(null);
    setQueueDragToIndex(null);
    Animated.timing(queueSheetAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setQueueSheetVisible(false);
    });
  }, [queueSheetAnim]);

  const handleQueueTrackPress = useCallback(async(index: number) => {
    if (queuePressSuppressRef.current) {
      queuePressSuppressRef.current = false;
      if (queuePressSuppressTimerRef.current) {
        clearTimeout(queuePressSuppressTimerRef.current);
        queuePressSuppressTimerRef.current = null;
      }
      return;
    }
    if (queueDragFromRef.current !== null) return;
    if (index < 0 || index >= queueDraft.length) return;
    try {
      await playerController.playFromPlaylist(queueDraft, index, {
        autoPlay: true,
      });
      syncPlayerSnapshotToStore()
      closeQueueSheet();
    } catch (error) {
      console.error('Play queue item error:', error);
      Alert.alert('播放失败', '切换到该歌曲失败，请稍后重试。');
    }
  }, [closeQueueSheet, queueDraft, syncPlayerSnapshotToStore]);

  const handleCyclePlayMode = useCallback(() => {
    playerController.cyclePlayMode()
    syncPlayerSnapshotToStore()
  }, [syncPlayerSnapshotToStore])

  const sourceLabel = renderTrack?.source
    ? renderTrack.source.toUpperCase()
    : 'LOCAL';

  const subMeta = useMemo(() => {
    const parts = [renderTrack?.album, sourceLabel].filter(Boolean);
    return parts.join(' · ');
  }, [renderTrack?.album, sourceLabel]);

  const dismissScale = panY.interpolate({
    inputRange: [0, 320],
    outputRange: [1, 0.975],
    extrapolate: 'clamp',
  });

  const dismissOpacity = panY.interpolate({
    inputRange: [0, 280],
    outputRange: [1, 0.94],
    extrapolate: 'clamp',
  });

  const coverOpacity = viewSwitchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const lyricsOpacity = viewSwitchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const coverScale = viewSwitchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.96],
  });
  const lyricsScale = viewSwitchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1],
  });
  const queueSheetTranslateY = queueSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [QUEUE_SHEET_HEIGHT + 24, 0],
  });
  const queueSheetMaskOpacity = queueSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  /** 播放进度更新时同步 Slider（仅在非拖动状态） */
  useEffect(() => {
    if (!isDraggingRef.current) {
      setSliderValue(progress);
    }
  }, [progress]);

  if (!renderTrack) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: dismissOpacity,
          transform: [{ translateY: panY }, { scale: dismissScale }],
        },
      ]}
      {...panHandlers}
    >
      <LinearGradient
        colors={
          isDark
            ? ['#05070D', '#0D182C', '#05070D']
            : ['#EAF3FF', '#F8FBFF', '#EEF3F8']
        }
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {renderTrack.coverUrl && (
        <Image
          source={{ uri: renderTrack.coverUrl }}
          style={styles.backdropImage}
          blurRadius={48}
        />
      )}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.82)']
            : ['rgba(255,255,255,0.35)', 'rgba(242,242,247,0.86)']
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {isResolvingTrack && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <View
            style={[
              styles.bufferingCard,
              {
                backgroundColor: isDark ? 'rgba(24,24,28,0.82)' : 'rgba(255,255,255,0.88)',
                borderColor: colors.separator,
              },
            ]}
          >
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.bufferingTitle, { color: colors.text }]}>缓冲中...</Text>
            <Text style={[styles.bufferingDesc, { color: colors.textSecondary }]} numberOfLines={2}>
              {resolvingHint}
            </Text>
          </View>
        </View>
      )}

      {/* ── 顶部栏 ── */}
      <View style={[styles.headerBlock, { paddingTop: insets.top + spacing.xs }]}>
        <View
          style={[
            styles.dragHandle,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.2)' },
          ]}
        />
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>
            正在播放
          </Text>
        </View>
      </View>

      {/* ── 主体 ── */}
      <View style={styles.body}>
        {activeTab === 'cover' && (
          <View
            style={[
              styles.metaCard,
              {
                backgroundColor: isDark ? 'rgba(28,28,30,0.48)' : 'rgba(255,255,255,0.72)',
                borderColor: colors.separator,
              },
            ]}
          >
            <View style={styles.metaCardRow}>
              <View style={styles.metaMain}>
                <Text style={[styles.trackTitle, { color: colors.text }]} numberOfLines={2}>
                  {renderTrack.title || '未知歌曲'}
                </Text>
                <Text style={[styles.trackArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                  {renderTrack.artist || '未知歌手'}
                </Text>
                <Text style={[styles.trackMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                  {subMeta}
                </Text>
              </View>

              <View style={styles.qualitySelectorWrap}>
                <TouchableOpacity
                  style={[
                    styles.qualitySelectorBtn,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                      borderColor: colors.separator,
                    },
                  ]}
                  activeOpacity={0.78}
                  onPress={() => setQualityMenuVisible((value) => !value)}
                >
                  <Text style={[styles.qualitySelectorText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {qualityDisplay}
                  </Text>
                  <Ionicons
                    name={qualityMenuVisible ? 'chevron-up' : 'chevron-down'}
                    size={12}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {qualityMenuVisible && (
                  <View
                    style={[
                      styles.qualityMenu,
                      {
                        backgroundColor: isDark ? '#181A20' : '#FFFFFF',
                        borderColor: colors.separator,
                      },
                    ]}
                  >
                    {availableQualities.map((quality) => {
                      const isActive = quality === (resolvedQuality || preferredQuality);
                      return (
                        <TouchableOpacity
                          key={quality}
                          style={[
                            styles.qualityMenuItem,
                            isActive
                              ? { backgroundColor: isDark ? 'rgba(10,132,255,0.15)' : 'rgba(0,122,255,0.1)' }
                              : null,
                          ]}
                          activeOpacity={0.75}
                          onPress={() => void handleSelectQuality(quality)}
                        >
                          <Text
                            style={[
                              styles.qualityMenuText,
                              {
                                color: isActive ? colors.accent : colors.text,
                              },
                            ]}
                          >
                            {QUALITY_LABELS[quality]}
                          </Text>
                          <View style={styles.qualityMenuMarkRow}>
                            {isActive && (
                              <Ionicons name="checkmark" size={14} color={colors.accent} />
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* ── 内容区（封面 / 歌词） ── */}
        <View style={styles.contentArea}>
          <Animated.View
            pointerEvents={activeTab === 'cover' ? 'auto' : 'none'}
            style={[
              styles.stageLayer,
              styles.coverStage,
              {
                opacity: coverOpacity,
                transform: [{ scale: coverScale }],
              },
            ]}
          >
            {/* 封面视图：大圆形旋转封面 */}
            <View style={styles.coverView}>
              <View
                style={[
                  styles.haloOuter,
                  { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' },
                ]}
              />
              <View
                style={[
                  styles.haloInner,
                  { borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)' },
                ]}
              />
              <View
                style={[
                  styles.coverShadow,
                  Platform.select({
                    ios: {
                      shadowColor: colors.accent,
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.3,
                      shadowRadius: 24,
                    },
                    android: { elevation: 20 },
                  }),
                ]}
              >
                <Animated.View
                  style={[
                    styles.coverWrap,
                    {
                      backgroundColor: colors.surfaceElevated,
                      transform: [{ rotate: spin }],
                    },
                  ]}
                >
                  {renderTrack.coverUrl ? (
                    <Image
                      source={{ uri: renderTrack.coverUrl }}
                      style={styles.cover}
                    />
                  ) : (
                    <Ionicons
                      name="musical-notes"
                      size={80}
                      color={colors.textTertiary}
                    />
                  )}
                </Animated.View>
              </View>
            </View>
          </Animated.View>

          <Animated.View
            pointerEvents={activeTab === 'lyrics' ? 'auto' : 'none'}
            style={[
              styles.stageLayer,
              {
                opacity: lyricsOpacity,
                transform: [{ scale: lyricsScale }],
              },
            ]}
          >
            <View
              style={[
                styles.lyricsPanel,
                {
                  backgroundColor: isDark ? 'rgba(28,28,30,0.46)' : 'rgba(255,255,255,0.72)',
                  borderColor: colors.separator,
                },
              ]}
            >
              <LyricsView
                lyrics={lyricData.lines}
                position={position}
                loading={lyricLoading}
                onSeek={handleLyricSeek}
                active={activeTab === 'lyrics'}
              />
            </View>
          </Animated.View>
        </View>

        {/* ── 悬浮胶囊切换 ── */}
        <View style={styles.capsuleRow}>
          <View
            style={[
              styles.capsule,
              {
                backgroundColor: isDark ? 'rgba(28,28,30,0.62)' : 'rgba(255,255,255,0.8)',
                borderColor: colors.separator,
              },
            ]}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    scale: coverBtnAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1.05],
                    }),
                  },
                ],
              }}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveTab('cover')}
                style={[
                  styles.capsuleBtn,
                  activeTab === 'cover' && [
                    styles.capsuleBtnActive,
                    { backgroundColor: colors.accent },
                  ],
                ]}
              >
                <Ionicons
                  name="disc-outline"
                  size={16}
                  color={activeTab === 'cover' ? '#fff' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.capsuleText,
                    {
                      color:
                        activeTab === 'cover' ? '#fff' : colors.textSecondary,
                    },
                  ]}
                >
                  封面
                </Text>
              </TouchableOpacity>
            </Animated.View>
            <Animated.View
              style={{
                transform: [
                  {
                    scale: lyricsBtnAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1.05],
                    }),
                  },
                ],
              }}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveTab('lyrics')}
                style={[
                  styles.capsuleBtn,
                  activeTab === 'lyrics' && [
                    styles.capsuleBtnActive,
                    { backgroundColor: colors.accent },
                  ],
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={activeTab === 'lyrics' ? '#fff' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.capsuleText,
                    {
                      color:
                        activeTab === 'lyrics' ? '#fff' : colors.textSecondary,
                    },
                  ]}
                >
                  歌词
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        <View
          style={[
            styles.transportArea,
            {
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          {/* ── 进度条 ── */}
          <View style={styles.seekWrap}>
            <Slider
              value={sliderValue}
              minimumValue={0}
              maximumValue={1}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.separator}
              thumbTintColor={colors.accent}
              onSlidingStart={() => {
                isDraggingRef.current = true;
              }}
              onValueChange={value => {
                setSliderValue(value);
              }}
              onSlidingComplete={value => {
                const nextMs = Math.floor((duration || 0) * value);
                void playerController.seek(nextMs);
                setTimeout(() => {
                  isDraggingRef.current = false;
                }, 250);
              }}
            />
            <View style={styles.timeRow}>
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                {formatMs(position)}
              </Text>
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                {formatMs(duration)}
              </Text>
            </View>
          </View>

          {/* ── 播放控制 ── */}
          <View style={styles.controls}>
            <View style={styles.transportControls}>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={() => void playerController.playPrevious()}
              >
                <Ionicons name="play-skip-back" size={28} color={colors.text} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  void (isPlaying
                    ? playerController.pause()
                    : playerController.resume())
                }
                activeOpacity={0.86}
              >
                <LinearGradient
                  colors={
                    isDark
                      ? ['#32A0FF', '#0A84FF']
                      : ['#0A84FF', '#0065E0']
                  }
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.playButton}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={34}
                    color="#fff"
                  />
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.controlButton}
                onPress={() => void playerController.playNext()}
              >
                <Ionicons name="play-skip-forward" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 底部操作：播放模式 + 菜单 ── */}
          <View style={styles.bottomActionRow}>
            <TouchableOpacity
              style={[
                styles.bottomIconButton,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  borderColor: colors.separator,
                },
              ]}
              activeOpacity={0.75}
              onPress={handleCyclePlayMode}
            >
              <Ionicons
                name={getPlayModeIcon(currentPlayMode)}
                size={18}
                color={colors.textSecondary}
              />
              {currentPlayMode === 'single_loop' && (
                <View style={[styles.playModeBadge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.playModeBadgeText}>1</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.bottomIconButton,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  borderColor: colors.separator,
                },
              ]}
              activeOpacity={0.75}
              onPress={openQueueSheet}
            >
              <Ionicons name="list" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {queueSheetVisible && (
        <View style={styles.queueSheetOverlay} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={closeQueueSheet}>
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
              },
            ]}
          >
            <View style={styles.queueSheetHeader}>
              <Text style={[styles.queueSheetTitle, { color: colors.text }]}>
                当前播放列表
              </Text>
              <Text style={[styles.queueSheetCount, { color: colors.textSecondary }]}>
                共 {queueDraft.length} 首
              </Text>
            </View>

            <View
              style={styles.queueListGestureLayer}
              {...queueDragResponder.panHandlers}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.queueSheetList}
                scrollEnabled={queueDragFromIndex === null}
              >
                {queueDraft.map((track, index) => {
                  const isCurrent = renderTrack ? getTrackIdentity(track) === getTrackIdentity(renderTrack) : false;
                  const isDraggingTarget = queueDragFromIndex !== null && index === queueDragToIndex;
                  return (
                    <Pressable
                      key={`${track.source || 'src'}_${track.id}_${index}`}
                      onPress={() => void handleQueueTrackPress(index)}
                      onPressOut={() => {
                        if (queueDragFromRef.current !== null) {
                          finishQueueDrag();
                        }
                      }}
                      onLongPress={() => handleQueueItemLongPress(index)}
                      delayLongPress={QUEUE_DRAG_LONG_PRESS_MS}
                      style={({ pressed }) => [
                        styles.queueItem,
                        {
                          borderBottomColor: colors.separator,
                          opacity: pressed ? 0.9 : 1,
                          backgroundColor: isDraggingTarget
                            ? (isDark ? 'rgba(10,132,255,0.2)' : 'rgba(0,122,255,0.16)')
                            : (
                              isCurrent
                                ? (isDark ? 'rgba(10,132,255,0.16)' : 'rgba(0,122,255,0.1)')
                                : 'transparent'
                            ),
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
                          {index + 1}
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
                        <Text numberOfLines={1} style={[styles.queueItemArtist, { color: colors.textSecondary }]}>
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
                        <Ionicons name="reorder-three-outline" size={16} color={colors.textTertiary} />
                        <Pressable
                          style={styles.queueMoreButton}
                          hitSlop={8}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            handleQueueTrackMorePress(track);
                          }}
                        >
                          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
                        </Pressable>
                      </View>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </View>
          </Animated.View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
  },
  backdropImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.32,
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 260,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  bufferingCard: {
    minWidth: 174,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    gap: spacing.xs,
  },
  bufferingTitle: {
    fontSize: fontSize.callout,
    fontWeight: '700',
  },
  bufferingDesc: {
    fontSize: fontSize.caption1,
  },
  headerBlock: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
  },
  header: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.subhead,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  metaCard: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  metaCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metaMain: {
    flex: 1,
    minHeight: 54,
  },
  qualitySelectorWrap: {
    position: 'relative',
    alignSelf: 'center',
  },
  qualitySelectorBtn: {
    minWidth: 72,
    minHeight: 28,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  qualitySelectorText: {
    fontSize: fontSize.caption1,
    fontWeight: '700',
  },
  qualityMenu: {
    position: 'absolute',
    top: 34,
    right: 0,
    minWidth: 110,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 20,
  },
  qualityMenuItem: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qualityMenuText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  qualityMenuMarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 24,
    justifyContent: 'flex-end',
  },
  /* ── 内容区（封面 / 歌词共享） ── */
  contentArea: {
    flex: 1,
    minHeight: 260,
    position: 'relative',
  },
  stageLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  coverStage: {
    justifyContent: 'center',
  },
  /* ── 封面视图 ── */
  coverView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloOuter: {
    position: 'absolute',
    width: COVER_SIZE_LG + 70,
    height: COVER_SIZE_LG + 70,
    borderRadius: 999,
    borderWidth: 1,
  },
  haloInner: {
    position: 'absolute',
    width: COVER_SIZE_LG + 28,
    height: COVER_SIZE_LG + 28,
    borderRadius: 999,
    borderWidth: 1,
  },
  coverShadow: {
    borderRadius: COVER_SIZE_LG / 2,
  },
  coverWrap: {
    width: COVER_SIZE_LG,
    height: COVER_SIZE_LG,
    borderRadius: COVER_SIZE_LG / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: {
    width: COVER_SIZE_LG,
    height: COVER_SIZE_LG,
  },
  /* ── 歌曲信息（仅封面页） ── */
  trackTitle: {
    fontSize: fontSize.title2,
    fontWeight: '700',
  },
  trackArtist: {
    fontSize: fontSize.callout,
    marginTop: 2,
  },
  trackMeta: {
    fontSize: fontSize.caption1,
    marginTop: 4,
  },
  lyricsPanel: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  /* ── 胶囊切换 ── */
  capsuleRow: {
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  capsule: {
    flexDirection: 'row',
    borderRadius: borderRadius.full,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  capsuleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  capsuleBtnActive: {
    // backgroundColor set inline
  },
  capsuleText: {
    fontSize: fontSize.footnote,
    fontWeight: '600',
  },
  /* ── 进度条 ── */
  seekWrap: {
    gap: spacing.xs,
  },
  transportArea: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: fontSize.caption1,
  },
  /* ── 播放控制 ── */
  controls: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xs,
  },
  transportControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  bottomActionRow: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  bottomIconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.full,
  },
  playModeBadge: {
    position: 'absolute',
    right: 3,
    top: 3,
    minWidth: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  playModeBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '600',
  },
  controlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    maxHeight: QUEUE_SHEET_HEIGHT,
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
  queueSheetTitle: {
    fontSize: fontSize.title3,
    fontWeight: '700',
  },
  queueSheetCount: {
    fontSize: fontSize.footnote,
  },
  queueSheetList: {
    paddingBottom: spacing.sm,
  },
  queueListGestureLayer: {
    flex: 1,
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
