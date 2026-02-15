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
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, spacing, fontSize, borderRadius } from '../../theme';
import { usePlayerStatus } from '../../hooks/usePlayerStatus';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { playerController } from '../../core/player';
import { getLyric, LyricData } from '../../core/lyric';
import LyricsView from '../../components/common/LyricsView';

/** 封面视图模式下的封面直径 */
const COVER_SIZE_LG = 280;

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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentTrack, isPlaying, position, duration } = usePlayerStatus();

  /* ── 视图切换 ── */
  const [activeTab, setActiveTab] = useState<ViewTab>('cover');

  /* ── 进度条拖动状态 ── */
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [draggingProgress, setDraggingProgress] = useState(0);

  /* ── 左边缘右滑关闭手势 ── */
  const { panX, panHandlers } = useSwipeBack(onClose);

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

  /* ── 标签页切换动画 ── */
  const tabSwitchAnim = useRef(new Animated.Value(1)).current;
  const coverBtnAnim = useRef(new Animated.Value(0)).current;
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
    tabSwitchAnim.setValue(0);
    Animated.timing(tabSwitchAnim, {
      toValue: 1,
      duration: 300,
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
  }, [activeTab, tabSwitchAnim, coverBtnAnim, lyricsBtnAnim]);

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

  /** 显示进度：拖动时用本地状态，否则用实时进度 */
  const displayProgress = isDraggingSlider ? draggingProgress : progress;

  /** 点击歌词行跳转 */
  const handleLyricSeek = useCallback((timeMs: number) => {
    void playerController.seek(timeMs);
  }, []);

  /** 当position更新但用户未拖动时，重置显示进度 */
  useEffect(() => {
    if (!isDraggingSlider) {
      setDraggingProgress(progress);
    }
  }, [progress, isDraggingSlider]);

  if (!currentTrack) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          backgroundColor: colors.background,
          transform: [{ translateX: panX }],
        },
      ]}
      {...panHandlers}
    >
      {/* ── 顶部栏 ── */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
          <Ionicons name="chevron-down" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>
          Now Playing
        </Text>
        <View style={styles.headerButton} />
      </View>

      {/* ── 主体 ── */}
      <View style={styles.body}>
        {/* ── 内容区（封面 / 歌词） ── */}
        <Animated.View
          style={[
            styles.contentArea,
            {
              opacity: tabSwitchAnim,
              transform: [
                {
                  scale: tabSwitchAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {activeTab === 'cover' ? (
            /* 封面视图：大圆形旋转封面 + 歌曲信息 */
            <View style={styles.coverView}>
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
                    android: { elevation: 16 },
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

              {/* 歌曲信息（仅在封面页显示） */}
              <View style={styles.trackInfo}>
                <Text
                  style={[styles.trackTitle, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {currentTrack.title}
                </Text>
                <Text
                  style={[styles.trackArtist, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {currentTrack.artist}
                </Text>
              </View>
            </View>
          ) : (
            /* 歌词视图 */
            <LyricsView
              lyrics={lyricData.lines}
              position={position}
              loading={lyricLoading}
              onSeek={handleLyricSeek}
            />
          )}
        </Animated.View>

        {/* ── 悬浮胶囊切换 ── */}
        <View style={styles.capsuleRow}>
          <View
            style={[
              styles.capsule,
              { backgroundColor: colors.surfaceElevated },
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

        {/* ── 进度条 ── */}
        <View style={styles.seekWrap}>
          <Slider
            value={displayProgress}
            minimumValue={0}
            maximumValue={1}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.separator}
            thumbTintColor={colors.accent}
            onValueChange={value => {
              setIsDraggingSlider(true);
              setDraggingProgress(value);
            }}
            onSlidingComplete={value => {
              setIsDraggingSlider(false);
              const nextMs = Math.floor((duration || 0) * value);
              void playerController.seek(nextMs);
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
        <View
          style={[
            styles.controls,
            { paddingBottom: insets.bottom + spacing.sm },
          ]}
        >
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => void playerController.playPrevious()}
          >
            <Ionicons name="play-skip-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.playButton, { backgroundColor: colors.accent }]}
            onPress={() =>
              void (isPlaying
                ? playerController.pause()
                : playerController.resume())
            }
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={34}
              color="#fff"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => void playerController.playNext()}
          >
            <Ionicons name="play-skip-forward" size={28} color={colors.text} />
          </TouchableOpacity>
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
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.subhead,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  /* ── 内容区（封面 / 歌词共享） ── */
  contentArea: {
    flex: 1,
  },
  /* ── 封面视图 ── */
  coverView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
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
  trackInfo: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  trackTitle: {
    fontSize: fontSize.title2,
    fontWeight: '700',
  },
  trackArtist: {
    fontSize: fontSize.callout,
  },
  /* ── 胶囊切换 ── */
  capsuleRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  capsule: {
    flexDirection: 'row',
    borderRadius: borderRadius.full,
    padding: 3,
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
    paddingTop: spacing.sm,
  },
  controlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
