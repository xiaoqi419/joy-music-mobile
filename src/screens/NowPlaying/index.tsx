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
  Alert,
} from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
// 使用原生 Slider 作为交互层，视觉轨道与圆点仍保持当前样式
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme, spacing, fontSize, borderRadius } from '../../theme';
import { usePlayerStatus } from '../../hooks/usePlayerStatus';
import { useSwipeDownClose } from '../../hooks/useSwipeDownClose';
import { playerController, type PlayMode } from '../../core/player';
import musicManager, { type Quality } from '../../core/music';
import { ALL_QUALITIES } from '../../core/config/musicSource';
import { getLyric, LyricData } from '../../core/lyric';
import { httpRequest } from '../../core/discover/http';
import LyricsView from '../../components/common/LyricsView';
import CommentSheet from './CommentSheet';
import QueueSheet from './QueueSheet';
import CircleSlider from './CircleSlider';
import type { RootState } from '../../store';
import type { Track } from '../../types/music';
import { normalizeImageUrl } from '../../utils/url';

const SCREEN_WIDTH = Dimensions.get('window').width;
/** 封面视图模式下的封面直径 */
const COVER_SIZE_LG = Math.min(320, SCREEN_WIDTH - 72);
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeKwSongmid(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/^kw_/i, '')
    .replace(/^MUSIC_/i, '');
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
  const isPlayingRef = useRef(isPlaying);

  /* ── 顶部下滑关闭手势 ── */
  const { panY, panGesture } = useSwipeDownClose(onClose, insets.top + 120);

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
  const commentSheetAnim = useRef(new Animated.Value(0)).current;
  const [queueSheetVisible, setQueueSheetVisible] = useState(false);
  const [commentSheetVisible, setCommentSheetVisible] = useState(false);
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
  const [kwCoverFallback, setKwCoverFallback] = useState<string | undefined>(undefined);
  const fallbackTrack = queue.find(Boolean) || controllerQueue.find(Boolean) || null;
  const renderTrack = activeTrack || displayTrack || fallbackTrack;
  const baseCoverUrl = useMemo(
    () => normalizeImageUrl(renderTrack?.coverUrl || renderTrack?.picUrl, 500),
    [renderTrack?.coverUrl, renderTrack?.picUrl]
  );
  const renderCoverUrl = useMemo(
    () => kwCoverFallback || baseCoverUrl,
    [kwCoverFallback, baseCoverUrl]
  );

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
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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
  }, [activeTab, commentSheetVisible, queueSheetVisible, renderTrack?.id]);

  useEffect(() => {
    if (!activeTrack) return;
    setDisplayTrack(activeTrack);
  }, [activeTrack]);

  useEffect(() => {
    setKwCoverFallback(undefined);
  }, [renderTrack?.id, renderTrack?.songmid, renderTrack?.source]);

  useEffect(() => {
    if (!renderTrack) return;
    if (baseCoverUrl) return;
    if (String(renderTrack.source || '').toLowerCase() !== 'kw') return;

    const songmid = normalizeKwSongmid(renderTrack.songmid || renderTrack.id);
    if (!songmid) return;

    let active = true;
    void (async() => {
      try {
        const resp = await httpRequest('https://artistpicserver.kuwo.cn/pic.web', {
          query: {
            corp: 'kuwo',
            type: 'rid_pic',
            pictype: 500,
            size: 500,
            rid: songmid,
          },
        });
        const resolved = normalizeImageUrl(String(resp.data ?? '').trim(), 500);
        if (active && resolved) {
          setKwCoverFallback(resolved);
        }
      } catch {
        // ignore cover fallback failures
      }
    })();

    return () => {
      active = false;
    };
  }, [baseCoverUrl, renderTrack?.id, renderTrack?.songmid, renderTrack?.source]);

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
  const handleSliderValueChange = useCallback((value: number) => {
    setSliderValue(clamp01(value));
  }, []);

  const handleSliderComplete = useCallback((value: number) => {
    const safeProgress = clamp01(value);
    setSliderValue(safeProgress);

    const safeDuration = Math.max(0, Math.floor(duration || 0));
    if (safeDuration <= 0) {
      isDraggingRef.current = false;
      return;
    }

    const nextMs = Math.floor(safeDuration * safeProgress);
    const wasPlaying = isPlayingRef.current;
    void (async() => {
      try {
        await playerController.seek(nextMs);
        // seek 后保持原播放态，避免暂停状态下拖动被意外拉起播放。
        if (!wasPlaying) {
          await playerController.pause();
        }
      } catch (error) {
        console.error('[NowPlaying] Seek failed:', error);
      } finally {
        isDraggingRef.current = false;
      }
    })();
  }, [duration]);

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
      // 用户主动切音质：先清理当前歌曲旧缓存，再按新音质重新拉取和缓存。
      await musicManager.clearTrackCache(renderTrack);
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

  const openCommentSheet = useCallback(() => {
    if (!renderTrack) return;
    if (String(renderTrack.source || '').toLowerCase() !== 'wy') {
      Alert.alert('暂不支持', '当前仅网易云平台支持歌曲评论。');
      return;
    }
    setCommentSheetVisible(true);
    commentSheetAnim.setValue(0);
    Animated.spring(commentSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 230,
      friction: 24,
    }).start();
  }, [commentSheetAnim, renderTrack]);

  const openQueueSheet = useCallback(() => {
    if (commentSheetVisible) {
      setCommentSheetVisible(false);
    }
    const hasQueue = playerController.getPlaylist().length > 0 || queue.length > 0;
    if (!hasQueue) {
      Alert.alert('播放列表为空', '当前还没有可播放的歌曲。');
      return;
    }
    setQueueSheetVisible(true);
    queueSheetAnim.setValue(0);
    Animated.spring(queueSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 230,
      friction: 24,
    }).start();
  }, [commentSheetVisible, queue.length, queueSheetAnim]);

  const handleCyclePlayMode = useCallback(() => {
    playerController.cyclePlayMode()
    syncPlayerSnapshotToStore()
  }, [syncPlayerSnapshotToStore])

  const sourceLabel = renderTrack?.source
    ? renderTrack.source.toUpperCase()
    : 'LOCAL';
  const isWyCommentSupported = String(renderTrack?.source || '').toLowerCase() === 'wy';
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

  /** 播放进度更新时同步 Slider（仅在非拖动状态） */
  useEffect(() => {
    if (!isDraggingRef.current) {
      setSliderValue(progress);
    }
  }, [progress]);

  if (!renderTrack) return null;

  return (
    <PanGestureHandler
      hitSlop={panGesture.hitSlop}
      activeOffsetY={panGesture.activeOffsetY}
      failOffsetX={panGesture.failOffsetX}
      onGestureEvent={panGesture.onGestureEvent}
      onHandlerStateChange={panGesture.onHandlerStateChange}
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: dismissOpacity,
            transform: [{ translateY: panY }, { scale: dismissScale }],
          },
        ]}
      >
      {/* 底层深邃/明亮底色 */}
      <LinearGradient
        colors={
          isDark
            ? ['#05070D', '#0A1222', '#05070D']
            : ['#F2F6FB', '#FFFFFF', '#EEF3F8']
        }
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* 模糊图 */}
      {renderCoverUrl ? (
        <Image
          source={{ uri: renderCoverUrl }}
          style={styles.backdropImage}
          blurRadius={isDark ? 55 : 30}
        />
      ) : null}
      {/* 强烈的高斯模糊层，提升玻璃冰透感，并且减少背景图过于抢眼 */}
      <BlurView
        intensity={isDark ? 90 : 80}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      {/* 叠色：防止毛玻璃因为原本图太亮太暗而失去对比度 */}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.45)']
            : ['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.85)']
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
                backgroundColor: isDark ? 'rgba(28,28,30,0.35)' : 'rgba(255,255,255,0.5)',
                borderColor: colors.separator,
              },
            ]}
          >
            {/* 歌曲信息背景使用局部毛玻璃，实现浮动晶体质感 */}
            <BlurView
              intensity={isDark ? 40 : 60}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            {/* 内层发光与内容 */}
            <View style={[StyleSheet.absoluteFill, styles.metaCardInnerBorder]} pointerEvents="none" />
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
                  { borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' },
                ]}
              />
              <View
                style={[
                  styles.haloInner,
                  { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' },
                ]}
              />
              {/* 大面积的有色散景阴影使封面变得梦幻 */}
              <View
                style={[
                  styles.coverShadow,
                  Platform.select({
                    ios: {
                      shadowColor: colors.accent,
                      shadowOffset: { width: 0, height: 16 },
                      shadowOpacity: isDark ? 0.35 : 0.45,
                      shadowRadius: 36,
                    },
                    android: { elevation: 20, shadowColor: colors.accent },
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
                  {renderCoverUrl ? (
                    <Image
                      source={{ uri: renderCoverUrl }}
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
                  backgroundColor: isDark ? 'rgba(28,28,30,0.25)' : 'rgba(255,255,255,0.3)',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)',
                },
              ]}
            >
              <BlurView
                intensity={isDark ? 30 : 50}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
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
                backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)',
                borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)',
              },
            ]}
          >
            <BlurView
              intensity={isDark ? 20 : 40}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
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
            <CircleSlider
              progress={sliderValue}
              accentColor={colors.accent}
              trackColor={isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)'}
              onSlidingStart={() => {
                isDraggingRef.current = true;
              }}
              onValueChange={handleSliderValueChange}
              onSlidingComplete={handleSliderComplete}
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
                  opacity: isWyCommentSupported ? 1 : 0.45,
                },
              ]}
              activeOpacity={0.75}
              disabled={!isWyCommentSupported}
              onPress={openCommentSheet}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textSecondary} />
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

      <CommentSheet
        visible={commentSheetVisible}
        track={renderTrack}
        animValue={commentSheetAnim}
        onClose={() => setCommentSheetVisible(false)}
      />
        <QueueSheet
          visible={queueSheetVisible}
          renderTrack={renderTrack}
          animValue={queueSheetAnim}
          isPlaying={isPlaying}
          onClose={() => setQueueSheetVisible(false)}
          onSyncStore={syncPlayerSnapshotToStore}
        />
      </Animated.View>
    </PanGestureHandler>
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
    borderRadius: 20, // 固定和内发光层相同的圆角大小
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    overflow: 'hidden',
  },
  metaCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metaCardInnerBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
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
    overflow: 'hidden',
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
});
