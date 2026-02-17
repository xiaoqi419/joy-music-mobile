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
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
  Platform,
  Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, spacing, fontSize, borderRadius } from '../../theme';
import { usePlayerStatus } from '../../hooks/usePlayerStatus';
import { useSwipeDownClose } from '../../hooks/useSwipeDownClose';
import { playerController } from '../../core/player';
import { getLyric, LyricData } from '../../core/lyric';
import LyricsView from '../../components/common/LyricsView';

const SCREEN_WIDTH = Dimensions.get('window').width;
/** 封面视图模式下的封面直径 */
const COVER_SIZE_LG = Math.min(320, SCREEN_WIDTH - 72);

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

/**
 * 渲染全屏播放页面。
 * @param onClose - 关闭回调（返回上一页）
 */
export default function NowPlaying({ onClose }: NowPlayingProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentTrack, isPlaying, position, duration } = usePlayerStatus();

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
    if (!currentTrack) {
      setLyricData({ lines: [], rawLrc: '', rawTlrc: '' });
      return;
    }

    let active = true;
    setLyricLoading(true);

    getLyric(currentTrack)
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
  }, [currentTrack?.id, currentTrack?.source, currentTrack?.songmid]);

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

  const sourceLabel = currentTrack?.source
    ? currentTrack.source.toUpperCase()
    : 'LOCAL';

  const subMeta = useMemo(() => {
    const parts = [currentTrack?.album, sourceLabel].filter(Boolean);
    return parts.join(' · ');
  }, [currentTrack?.album, sourceLabel]);

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

  if (!currentTrack) return null;

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
      {currentTrack.coverUrl && (
        <Image
          source={{ uri: currentTrack.coverUrl }}
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
        <View
          style={[
            styles.metaCard,
            {
              backgroundColor: isDark ? 'rgba(28,28,30,0.48)' : 'rgba(255,255,255,0.72)',
              borderColor: colors.separator,
            },
          ]}
        >
          <Text style={[styles.trackTitle, { color: colors.text }]} numberOfLines={2}>
            {currentTrack.title}
          </Text>
          <Text style={[styles.trackArtist, { color: colors.textSecondary }]} numberOfLines={1}>
            {currentTrack.artist}
          </Text>
          <Text style={[styles.trackMeta, { color: colors.textTertiary }]} numberOfLines={1}>
            {subMeta}
          </Text>
        </View>

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
                  {currentTrack.coverUrl ? (
                    <Image
                      source={{ uri: currentTrack.coverUrl }}
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
      </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: spacing.xs,
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
