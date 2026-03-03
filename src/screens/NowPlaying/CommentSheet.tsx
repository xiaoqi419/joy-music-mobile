/**
 * CommentSheet -- self-contained comment overlay extracted from NowPlaying.
 * Manages all comment-related state, data-fetching, caching and rendering internally.
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
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, spacing, fontSize, borderRadius } from '../../theme';
import { getTrackComments, type TrackComment } from '../../core/comment';
import { normalizeImageUrl } from '../../utils/url';
import type { Track } from '../../types/music';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_HEIGHT = Dimensions.get('window').height;
const COMMENT_SHEET_HEIGHT = Math.min(560, SCREEN_HEIGHT * 0.66);
const COMMENT_PAGE_LIMIT = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CommentCacheEntry {
  comments: TrackComment[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
}

function formatLikeCount(count: number): string {
  if (count >= 100000000) {
    return `${(count / 100000000).toFixed(1).replace(/\.0$/, '')}亿`;
  }
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1).replace(/\.0$/, '')}万`;
  }
  return String(count);
}

function mergeTrackComments(base: TrackComment[], incoming: TrackComment[]): TrackComment[] {
  const merged = new Map<string, TrackComment>();
  for (const item of base) {
    merged.set(item.id, item);
  }
  for (const item of incoming) {
    if (!merged.has(item.id)) {
      merged.set(item.id, item);
    }
  }
  return Array.from(merged.values());
}

function getCommentTrackIdentity(track: Track): string {
  const source = String(track.source || '').toLowerCase();
  const rawSongId = String(track.songmid || '').trim();
  const fallbackSongId = String(track.id || '').replace(/^wy_/, '');
  return `${source}_${rawSongId || fallbackSongId}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CommentSheetProps {
  visible: boolean;
  track: Track | null;
  animValue: Animated.Value;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CommentSheet({ visible, track, animValue, onClose }: CommentSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // ---- comment state ----
  const [comments, setComments] = useState<TrackComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsRefreshing, setCommentsRefreshing] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentsLoadMoreError, setCommentsLoadMoreError] = useState('');
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsNextOffset, setCommentsNextOffset] = useState(0);
  const [activeCommentTrackKey, setActiveCommentTrackKey] = useState('');
  const [commentsRefreshError, setCommentsRefreshError] = useState('');
  const [commentsError, setCommentsError] = useState('');
  const commentCacheRef = useRef<Record<string, CommentCacheEntry>>({});
  const commentRequestTokenRef = useRef(0);
  const commentLoadingMoreRef = useRef(false);

  // ---- interpolations ----
  const commentSheetTranslateY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [COMMENT_SHEET_HEIGHT + 24, 0],
  });
  const commentSheetMaskOpacity = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  // ---- close handler ----
  const closeCommentSheet = useCallback(() => {
    Animated.timing(animValue, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  }, [animValue, onClose]);

  // ---- data loading ----
  const loadCommentsForTrack = useCallback(
    async (t: Track, forceRefresh = false) => {
      const requestToken = commentRequestTokenRef.current + 1;
      commentRequestTokenRef.current = requestToken;
      commentLoadingMoreRef.current = false;
      setCommentsLoadingMore(false);
      setCommentsLoadMoreError('');
      setCommentsRefreshError('');

      const source = String(t.source || '').toLowerCase();
      if (source !== 'wy') {
        setCommentsLoading(false);
        setCommentsRefreshing(false);
        setComments([]);
        setCommentsTotal(0);
        setCommentsHasMore(false);
        setCommentsNextOffset(0);
        setActiveCommentTrackKey('');
        setCommentsError('当前平台暂不支持歌曲评论');
        return;
      }

      const cacheKey = getCommentTrackIdentity(t);
      setActiveCommentTrackKey(cacheKey);

      if (!forceRefresh) {
        const cachedEntry = commentCacheRef.current[cacheKey];
        if (cachedEntry) {
          if (requestToken !== commentRequestTokenRef.current) return;
          setCommentsLoading(false);
          setCommentsRefreshing(false);
          setComments(cachedEntry.comments);
          setCommentsTotal(cachedEntry.total || cachedEntry.comments.length);
          setCommentsHasMore(cachedEntry.hasMore);
          setCommentsNextOffset(cachedEntry.nextOffset);
          setCommentsRefreshError('');
          setCommentsError('');
          return;
        }
      }

      if (forceRefresh) {
        setCommentsRefreshing(true);
      } else {
        setCommentsLoading(true);
        setComments([]);
        setCommentsTotal(0);
        setCommentsHasMore(false);
        setCommentsNextOffset(0);
      }
      setCommentsError('');

      try {
        const result = await getTrackComments(t, {
          limit: COMMENT_PAGE_LIMIT,
          offset: 0,
        });
        if (requestToken !== commentRequestTokenRef.current) return;
        const normalizedTotal = Math.max(result.total, result.comments.length);
        setComments(result.comments);
        setCommentsTotal(normalizedTotal);
        setCommentsHasMore(result.hasMore);
        setCommentsNextOffset(result.nextOffset);
        setCommentsRefreshError('');
        commentCacheRef.current[cacheKey] = {
          comments: result.comments,
          total: normalizedTotal,
          hasMore: result.hasMore,
          nextOffset: result.nextOffset,
        };
      } catch (error) {
        if (requestToken !== commentRequestTokenRef.current) return;
        const message =
          error instanceof Error ? error.message : '加载评论失败，请稍后重试';
        if (forceRefresh && comments.length > 0) {
          setCommentsRefreshError(message);
        } else {
          setComments([]);
          setCommentsTotal(0);
          setCommentsHasMore(false);
          setCommentsNextOffset(0);
          setCommentsRefreshError('');
          setCommentsError(message);
        }
      } finally {
        if (requestToken !== commentRequestTokenRef.current) return;
        setCommentsLoading(false);
        setCommentsRefreshing(false);
      }
    },
    [comments.length],
  );

  const loadMoreComments = useCallback(async () => {
    if (!track) return;
    if (commentsLoading || commentsRefreshing || commentsLoadingMore) return;
    if (!commentsHasMore) return;
    const source = String(track.source || '').toLowerCase();
    if (source !== 'wy') return;

    const cacheKey = getCommentTrackIdentity(track);
    if (!cacheKey || cacheKey !== activeCommentTrackKey) return;
    if (commentLoadingMoreRef.current) return;

    commentLoadingMoreRef.current = true;
    setCommentsLoadingMore(true);
    setCommentsLoadMoreError('');
    const requestToken = commentRequestTokenRef.current;
    try {
      const result = await getTrackComments(track, {
        limit: COMMENT_PAGE_LIMIT,
        offset: commentsNextOffset,
      });
      if (requestToken !== commentRequestTokenRef.current) return;
      const mergedComments = mergeTrackComments(comments, result.comments);
      const normalizedTotal = Math.max(result.total, mergedComments.length);
      setComments(mergedComments);
      setCommentsTotal(normalizedTotal);
      setCommentsHasMore(result.hasMore);
      setCommentsNextOffset(result.nextOffset);
      setCommentsRefreshError('');
      setCommentsError('');
      commentCacheRef.current[cacheKey] = {
        comments: mergedComments,
        total: normalizedTotal,
        hasMore: result.hasMore,
        nextOffset: result.nextOffset,
      };
    } catch (error) {
      if (requestToken !== commentRequestTokenRef.current) return;
      const message =
        error instanceof Error ? error.message : '加载更多评论失败，请稍后重试';
      setCommentsLoadMoreError(message);
    } finally {
      if (requestToken === commentRequestTokenRef.current) {
        setCommentsLoadingMore(false);
      }
      commentLoadingMoreRef.current = false;
    }
  }, [
    activeCommentTrackKey,
    comments,
    commentsHasMore,
    commentsLoading,
    commentsLoadingMore,
    commentsNextOffset,
    commentsRefreshing,
    track,
  ]);

  // ---- auto-load comments when visible + track changes ----
  useEffect(() => {
    if (!visible || !track) return;
    void loadCommentsForTrack(track);
  }, [visible, loadCommentsForTrack, track?.id, track?.songmid, track?.source]);

  // ---- handlers ----
  const handleCommentRefresh = useCallback(() => {
    if (!track) return;
    if (commentsLoading || commentsRefreshing) return;
    void loadCommentsForTrack(track, true);
  }, [commentsLoading, commentsRefreshing, loadCommentsForTrack, track]);

  const handleCommentEndReached = useCallback(() => {
    if (commentsLoading || commentsRefreshing || commentsLoadingMore) return;
    if (commentsLoadMoreError) return;
    if (!commentsHasMore || comments.length === 0) return;
    void loadMoreComments();
  }, [
    comments.length,
    commentsHasMore,
    commentsLoading,
    commentsLoadingMore,
    commentsLoadMoreError,
    commentsRefreshing,
    loadMoreComments,
  ]);

  // ---- derived ----
  const commentSubTitle = useMemo(() => {
    if (commentsTotal <= 0) return '暂无评论';
    if (commentsHasMore) return `已展示 ${comments.length}/${commentsTotal} 条`;
    return `共 ${commentsTotal} 条`;
  }, [comments.length, commentsHasMore, commentsTotal]);

  // ---- list renderers ----
  const renderCommentFooter = useCallback(() => {
    if (commentsLoadingMore) {
      return (
        <View style={styles.commentListFooter}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.commentFooterText, { color: colors.textSecondary }]}>
            加载更多评论...
          </Text>
        </View>
      );
    }
    if (commentsLoadMoreError) {
      return (
        <View style={styles.commentListFooter}>
          <Text
            style={[styles.commentFooterText, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {commentsLoadMoreError}
          </Text>
          <TouchableOpacity
            style={[
              styles.commentFooterRetryButton,
              {
                borderColor: colors.separator,
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.04)',
              },
            ]}
            activeOpacity={0.75}
            onPress={() => {
              void loadMoreComments();
            }}
          >
            <Text style={[styles.commentFooterRetryText, { color: colors.textSecondary }]}>
              重试加载
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (!commentsHasMore && comments.length > 0) {
      return (
        <View style={styles.commentListFooter}>
          <Text style={[styles.commentFooterText, { color: colors.textTertiary }]}>
            已显示全部评论
          </Text>
        </View>
      );
    }
    return <View style={styles.commentFooterSpacer} />;
  }, [
    colors.accent,
    colors.separator,
    colors.textSecondary,
    colors.textTertiary,
    comments.length,
    commentsHasMore,
    commentsLoadMoreError,
    commentsLoadingMore,
    isDark,
    loadMoreComments,
  ]);

  const renderCommentItem = useCallback(
    ({ item: comment }: ListRenderItemInfo<TrackComment>) => {
      const avatarUrl = normalizeImageUrl(comment.avatarUrl, 240);
      return (
        <View
          style={[
            styles.commentItem,
            {
              borderColor: colors.separator,
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
            },
          ]}
        >
          <View style={styles.commentItemHeader}>
            <View style={styles.commentUserRow}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.commentAvatar} />
              ) : (
                <View
                  style={[
                    styles.commentAvatarFallback,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255,255,255,0.1)'
                        : 'rgba(0,0,0,0.06)',
                    },
                  ]}
                >
                  <Ionicons name="person" size={13} color={colors.textSecondary} />
                </View>
              )}
              <View style={styles.commentUserInfo}>
                <Text
                  style={[styles.commentUserName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {comment.userName}
                </Text>
                <Text
                  style={[styles.commentMetaText, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {comment.timeText || '刚刚'}
                  {comment.location ? ` · ${comment.location}` : ''}
                </Text>
              </View>
            </View>
            {comment.likedCount > 0 && (
              <View style={styles.commentLikeWrap}>
                <Ionicons name="heart-outline" size={12} color={colors.textTertiary} />
                <Text style={[styles.commentLikeText, { color: colors.textTertiary }]}>
                  {formatLikeCount(comment.likedCount)}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.commentContent, { color: colors.text }]}>
            {comment.content}
          </Text>
        </View>
      );
    },
    [colors.separator, colors.text, colors.textSecondary, colors.textTertiary, isDark],
  );

  // ---- render ----
  if (!visible) return null;

  return (
    <View style={styles.commentSheetOverlay} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={closeCommentSheet}>
        <Animated.View
          style={[
            styles.commentSheetMask,
            {
              opacity: commentSheetMaskOpacity,
            },
          ]}
        />
      </Pressable>
      <Animated.View
        style={[
          styles.commentSheet,
          {
            paddingBottom: insets.bottom + spacing.md,
            backgroundColor: isDark ? '#111317' : '#F8FAFD',
            borderColor: colors.separator,
            transform: [{ translateY: commentSheetTranslateY }],
          },
        ]}
      >
        <View style={styles.commentSheetHeader}>
          <View style={styles.commentSheetHeaderMain}>
            <Text style={[styles.commentSheetTitle, { color: colors.text }]}>
              歌曲评论
            </Text>
            <Text style={[styles.commentSheetSubTitle, { color: colors.textSecondary }]}>
              {commentSubTitle}
            </Text>
            {comments.length > 0 && (
              <Text style={[styles.commentSheetHint, { color: colors.textTertiary }]}>
                下拉刷新，滑到底部自动加载更多
              </Text>
            )}
          </View>
          <View style={styles.commentSheetHeaderActions}>
            <TouchableOpacity
              style={[
                styles.commentRefreshButton,
                {
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.04)',
                  borderColor: colors.separator,
                },
              ]}
              activeOpacity={0.75}
              disabled={commentsLoading || commentsRefreshing}
              onPress={handleCommentRefresh}
            >
              {commentsRefreshing ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Ionicons name="refresh" size={16} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.commentRefreshButton,
                {
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.04)',
                  borderColor: colors.separator,
                },
              ]}
              activeOpacity={0.75}
              onPress={closeCommentSheet}
            >
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        {commentsRefreshError ? (
          <View
            style={[
              styles.commentInlineError,
              {
                borderColor: colors.separator,
                backgroundColor: isDark
                  ? 'rgba(255,159,67,0.12)'
                  : 'rgba(255,149,0,0.12)',
              },
            ]}
          >
            <Ionicons name="warning-outline" size={14} color={colors.textSecondary} />
            <Text
              style={[styles.commentInlineErrorText, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {commentsRefreshError}
            </Text>
            <TouchableOpacity
              style={styles.commentInlineErrorAction}
              activeOpacity={0.75}
              onPress={handleCommentRefresh}
            >
              <Text style={[styles.commentInlineErrorActionText, { color: colors.accent }]}>
                重试
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {commentsLoading && comments.length === 0 ? (
          <View style={styles.commentStateWrap}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.commentStateText, { color: colors.textSecondary }]}>
              正在加载评论...
            </Text>
          </View>
        ) : commentsError && comments.length === 0 ? (
          <View style={styles.commentStateWrap}>
            <Ionicons name="warning-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.commentStateText, { color: colors.textSecondary }]}>
              {commentsError}
            </Text>
            <TouchableOpacity
              style={[
                styles.commentRetryButton,
                {
                  borderColor: colors.separator,
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.04)',
                },
              ]}
              activeOpacity={0.75}
              onPress={handleCommentRefresh}
            >
              <Text style={[styles.commentRetryText, { color: colors.textSecondary }]}>
                重试
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(comment) => comment.id}
            renderItem={renderCommentItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.commentSheetList,
              comments.length === 0 ? styles.commentSheetListEmpty : null,
            ]}
            refreshing={commentsRefreshing}
            onRefresh={handleCommentRefresh}
            onEndReached={handleCommentEndReached}
            onEndReachedThreshold={0.24}
            ListFooterComponent={renderCommentFooter}
            ListEmptyComponent={
              <View style={styles.commentStateWrap}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color={colors.textSecondary}
                />
                <Text style={[styles.commentStateText, { color: colors.textSecondary }]}>
                  当前歌曲暂无可展示评论
                </Text>
              </View>
            }
          />
        )}
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  commentSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 190,
  },
  commentSheetMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  commentSheet: {
    maxHeight: COMMENT_SHEET_HEIGHT,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  commentSheetHeader: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  commentSheetHeaderMain: {
    flex: 1,
  },
  commentSheetTitle: {
    fontSize: fontSize.title3,
    fontWeight: '700',
  },
  commentSheetSubTitle: {
    fontSize: fontSize.footnote,
    marginTop: 3,
  },
  commentSheetHint: {
    fontSize: fontSize.caption2,
    marginTop: 2,
  },
  commentSheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  commentRefreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentInlineError: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  commentInlineErrorText: {
    flex: 1,
    fontSize: fontSize.caption1,
  },
  commentInlineErrorAction: {
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentInlineErrorActionText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  commentSheetList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  commentSheetListEmpty: {
    flexGrow: 1,
  },
  commentStateWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg + 2,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  commentStateText: {
    fontSize: fontSize.callout,
    textAlign: 'center',
  },
  commentRetryButton: {
    marginTop: spacing.xs,
    minWidth: 72,
    minHeight: 30,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  commentRetryText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  commentItem: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.lg,
    gap: spacing.xs,
  },
  commentItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  commentUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: spacing.xs,
  },
  commentAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentUserInfo: {
    flex: 1,
  },
  commentUserName: {
    fontSize: fontSize.footnote,
    fontWeight: '600',
  },
  commentMetaText: {
    fontSize: fontSize.caption2,
    marginTop: 1,
  },
  commentLikeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentLikeText: {
    fontSize: fontSize.caption2,
  },
  commentContent: {
    fontSize: fontSize.callout,
    lineHeight: Math.round(fontSize.callout * 1.45),
  },
  commentListFooter: {
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  commentFooterText: {
    fontSize: fontSize.caption1,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  commentFooterRetryButton: {
    minWidth: 86,
    minHeight: 30,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  commentFooterRetryText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  commentFooterSpacer: {
    height: spacing.sm,
  },
});

export default React.memo(CommentSheet);
