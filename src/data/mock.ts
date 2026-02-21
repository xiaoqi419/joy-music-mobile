/**
 * Mock data for discovery page
 * Used because Joy API doesn't provide search/leaderboard/songlist endpoints
 */

import { Track } from '../types/music'

// ==================== Leaderboard Data ====================

export interface LeaderboardInfo {
  id: string
  name: string
  description: string
  coverUrl: string
  gradientColors: [string, string]
  tracks: Track[]
}

const hotTracks: Track[] = [
  {
    id: 'hot_1', title: '晴天', artist: '周杰伦', album: '叶惠美',
    duration: 269000, url: '', source: 'kw', songmid: '76323', hash: '',
  },
  {
    id: 'hot_2', title: '稻香', artist: '周杰伦', album: '魔杰座',
    duration: 223000, url: '', source: 'kw', songmid: '100789', hash: '',
  },
  {
    id: 'hot_3', title: '起风了', artist: '买辣椒也用券', album: '起风了',
    duration: 325000, url: '', source: 'kw', songmid: '159607', hash: '',
  },
  {
    id: 'hot_4', title: '平凡之路', artist: '朴树', album: '猎户星座',
    duration: 282000, url: '', source: 'kw', songmid: '86421', hash: '',
  },
  {
    id: 'hot_5', title: '夜曲', artist: '周杰伦', album: '十一月的萧邦',
    duration: 226000, url: '', source: 'kw', songmid: '67890', hash: '',
  },
  {
    id: 'hot_6', title: '光年之外', artist: '邓紫棋', album: '光年之外',
    duration: 235000, url: '', source: 'kw', songmid: '134256', hash: '',
  },
]

const newTracks: Track[] = [
  {
    id: 'new_1', title: '孤勇者', artist: '陈奕迅', album: '孤勇者',
    duration: 262000, url: '', source: 'kw', songmid: '201456', hash: '',
  },
  {
    id: 'new_2', title: '错位时空', artist: '艾辰', album: '错位时空',
    duration: 248000, url: '', source: 'kw', songmid: '198723', hash: '',
  },
  {
    id: 'new_3', title: '踏山河', artist: '是七叔呢', album: '踏山河',
    duration: 215000, url: '', source: 'kw', songmid: '205678', hash: '',
  },
  {
    id: 'new_4', title: '白月光与朱砂痣', artist: '大籽', album: '白月光与朱砂痣',
    duration: 229000, url: '', source: 'kw', songmid: '197654', hash: '',
  },
  {
    id: 'new_5', title: '可可托海的牧羊人', artist: '王琪', album: '可可托海的牧羊人',
    duration: 286000, url: '', source: 'kw', songmid: '189432', hash: '',
  },
]

const risingTracks: Track[] = [
  {
    id: 'rise_1', title: '半生雪', artist: '是七叔呢', album: '半生雪',
    duration: 228000, url: '', source: 'kw', songmid: '212345', hash: '',
  },
  {
    id: 'rise_2', title: '云与海', artist: '阿YueYue', album: '云与海',
    duration: 241000, url: '', source: 'kw', songmid: '215678', hash: '',
  },
  {
    id: 'rise_3', title: '星辰大海', artist: '黄霄雲', album: '星辰大海',
    duration: 267000, url: '', source: 'kw', songmid: '218901', hash: '',
  },
  {
    id: 'rise_4', title: '等什么君', artist: '等什么君', album: '辞九门回忆',
    duration: 198000, url: '', source: 'kw', songmid: '221234', hash: '',
  },
  {
    id: 'rise_5', title: '删了吧', artist: '烟(许佳豪)', album: '删了吧',
    duration: 256000, url: '', source: 'kw', songmid: '224567', hash: '',
  },
]

const classicTracks: Track[] = [
  {
    id: 'classic_1', title: '海阔天空', artist: 'Beyond', album: '乐与怒',
    duration: 326000, url: '', source: 'kw', songmid: '12345', hash: '',
  },
  {
    id: 'classic_2', title: '红豆', artist: '王菲', album: '唱游',
    duration: 297000, url: '', source: 'kw', songmid: '23456', hash: '',
  },
  {
    id: 'classic_3', title: '倒带', artist: '蔡依林', album: '城堡',
    duration: 265000, url: '', source: 'kw', songmid: '34567', hash: '',
  },
  {
    id: 'classic_4', title: '告白气球', artist: '周杰伦', album: '周杰伦的床边故事',
    duration: 215000, url: '', source: 'kw', songmid: '45678', hash: '',
  },
  {
    id: 'classic_5', title: '说好的幸福呢', artist: '周杰伦', album: '魔杰座',
    duration: 258000, url: '', source: 'kw', songmid: '56789', hash: '',
  },
]

export const mockLeaderboards: LeaderboardInfo[] = [
  {
    id: 'hot',
    name: '热歌榜',
    description: '最热门的歌曲',
    coverUrl: 'https://via.placeholder.com/300/FF6B6B/FFFFFF?text=HOT',
    gradientColors: ['#FF6B6B', '#EE5A24'],
    tracks: hotTracks,
  },
  {
    id: 'new',
    name: '新歌榜',
    description: '最新发布的歌曲',
    coverUrl: 'https://via.placeholder.com/300/4ECDC4/FFFFFF?text=NEW',
    gradientColors: ['#4ECDC4', '#44BD9E'],
    tracks: newTracks,
  },
  {
    id: 'rising',
    name: '飙升榜',
    description: '上升最快的歌曲',
    coverUrl: 'https://via.placeholder.com/300/A29BFE/FFFFFF?text=UP',
    gradientColors: ['#A29BFE', '#6C5CE7'],
    tracks: risingTracks,
  },
  {
    id: 'classic',
    name: '经典榜',
    description: '经典永流传',
    coverUrl: 'https://via.placeholder.com/300/FFEAA7/000000?text=TOP',
    gradientColors: ['#FFEAA7', '#FDCB6E'],
    tracks: classicTracks,
  },
]

// ==================== Playlist Data ====================

export interface PlaylistInfo {
  id: string
  name: string
  coverUrl: string
  playCount: number
  description: string
  tracks: Track[]
}

export const mockPlaylists: PlaylistInfo[] = [
  {
    id: 'pl_1',
    name: '华语流行精选',
    coverUrl: 'https://via.placeholder.com/300/6C5CE7/FFFFFF?text=POP',
    playCount: 128000,
    description: '最好听的华语流行歌曲合集',
    tracks: [...hotTracks.slice(0, 3), ...classicTracks.slice(0, 3)],
  },
  {
    id: 'pl_2',
    name: '安静的下午茶',
    coverUrl: 'https://via.placeholder.com/300/00B894/FFFFFF?text=TEA',
    playCount: 86000,
    description: '适合安静午后聆听的舒缓音乐',
    tracks: [...classicTracks.slice(1, 4), ...newTracks.slice(0, 2)],
  },
  {
    id: 'pl_3',
    name: '运动燃脂必备',
    coverUrl: 'https://via.placeholder.com/300/E17055/FFFFFF?text=RUN',
    playCount: 205000,
    description: '让你动起来的节奏感歌曲',
    tracks: [...risingTracks.slice(0, 3), ...hotTracks.slice(3, 6)],
  },
  {
    id: 'pl_4',
    name: '深夜独享',
    coverUrl: 'https://via.placeholder.com/300/2D3436/FFFFFF?text=NIGHT',
    playCount: 67000,
    description: '夜深人静时的心灵陪伴',
    tracks: [...newTracks.slice(2, 5), ...classicTracks.slice(2, 5)],
  },
  {
    id: 'pl_5',
    name: '经典老歌回忆',
    coverUrl: 'https://via.placeholder.com/300/FDCB6E/000000?text=OLD',
    playCount: 342000,
    description: '那些年我们一起听过的歌',
    tracks: classicTracks,
  },
  {
    id: 'pl_6',
    name: '工作学习BGM',
    coverUrl: 'https://via.placeholder.com/300/74B9FF/FFFFFF?text=WORK',
    playCount: 156000,
    description: '提升专注力的背景音乐',
    tracks: [...newTracks.slice(0, 3), ...risingTracks.slice(0, 3)],
  },
]

// ==================== Hot Search Keywords ====================

export const mockHotSearchKeywords = [
  '周杰伦', '陈奕迅', '邓紫棋', '林俊杰', '薛之谦',
  '王菲', 'Beyond', '朴树', '毛不易', '华晨宇',
  '晴天', '孤勇者', '起风了', '稻香', '海阔天空',
]

// ==================== All Tracks (for search) ====================

export const allMockTracks: Track[] = [
  ...hotTracks,
  ...newTracks,
  ...risingTracks,
  ...classicTracks,
]

// Deduplicate by id
const seen = new Set<string>()
export const uniqueMockTracks: Track[] = allMockTracks.filter(t => {
  if (seen.has(t.id)) return false
  seen.add(t.id)
  return true
})
