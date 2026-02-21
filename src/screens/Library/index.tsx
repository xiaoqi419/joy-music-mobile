/**
 * Library screen - user's music collection.
 */

import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { useTheme, spacing, fontSize, borderRadius, BOTTOM_INSET } from '../../theme'
import TrackListItem from '../../components/common/TrackListItem'
import { usePlayerStatus } from '../../hooks/usePlayerStatus'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '../../store'
import { ThemeMode, Track } from '../../types/music'
import { Quality } from '../../core/music'
import {
  ALL_QUALITIES,
  createManualSource,
  createSourceFromScriptText,
  ImportedMusicSource,
} from '../../core/config/musicSource'

interface LibraryScreenProps {
  onTrackPress?: (track: Track) => void
}

type LibrarySubPage = 'main' | 'appearance' | 'sources'
type SourceModalMode = 'manual' | 'url'

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  count?: number
  color: string
}

interface SettingCellProps {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  subtitle: string
  onPress: () => void
}

const THEME_OPTIONS: Array<{
  value: ThemeMode
  label: string
  description: string
  icon: keyof typeof Ionicons.glyphMap
}> = [
  { value: 'system', label: '跟随系统', description: '自动切换浅色与深色', icon: 'phone-portrait-outline' },
  { value: 'light', label: '浅色', description: '始终使用浅色界面', icon: 'sunny-outline' },
  { value: 'dark', label: '深色', description: '始终使用深色界面', icon: 'moon-outline' },
]

const THEME_LABELS: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
}

// 参照 CeruMusic 音质显示文案，并补充英文缩写对照。
const QUALITY_LABELS: Record<Quality, string> = {
  '128k': '标准 (128k)',
  '320k': '超高 (320k)',
  flac: '无损 (FLAC)',
  flac24bit: '超高解析 (24bit)',
  hires: '高清臻音 (Hi-Res)',
  atmos: '全景环绕 (Atmos)',
  atmos_plus: '全景增强 (Atmos+)',
  master: '超清母带 (Master)',
}

function MenuItem({ icon, label, count, color }: MenuItemProps) {
  const { colors } = useTheme()
  return (
    <View style={[styles.menuItem, { borderBottomColor: colors.separator }]}> 
      <View style={[styles.menuIcon, { backgroundColor: color }]}> 
        <Ionicons name={icon} size={18} color="#FFFFFF" />
      </View>
      <Text style={[styles.menuLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.menuRight}>
        {count !== undefined && <Text style={[styles.menuCount, { color: colors.textTertiary }]}>{count}</Text>}
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </View>
    </View>
  )
}

function SettingCell({ icon, title, subtitle, onPress }: SettingCellProps) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity style={[styles.settingCell, { borderBottomColor: colors.separator }]} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.settingCellIcon, { backgroundColor: colors.surfaceSecondary }]}> 
        <Ionicons name={icon} size={16} color={colors.textSecondary} />
      </View>
      <View style={styles.settingCellMeta}>
        <Text style={[styles.settingCellTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.settingCellSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  )
}

export default function LibraryScreen({ onTrackPress }: LibraryScreenProps) {
  const { colors } = useTheme()
  const dispatch = useDispatch()
  const insets = useSafeAreaInsets()
  const { isPlaying, currentTrack } = usePlayerStatus()
  const playerState = useSelector((state: RootState) => state.player)
  const themeMode = useSelector((state: RootState) => state.config.theme)
  const musicSourceState = useSelector((state: RootState) => state.musicSource)

  const importedSources = musicSourceState.importedSources
  const selectedImportedSourceId = musicSourceState.selectedImportedSourceId
  const selectedSource = useMemo(() => importedSources.find((item) => item.id === selectedImportedSourceId), [
    importedSources,
    selectedImportedSourceId,
  ])

  const [subPage, setSubPage] = useState<LibrarySubPage>('main')

  const [sourceModalVisible, setSourceModalVisible] = useState(false)
  const [sourceModalMode, setSourceModalMode] = useState<SourceModalMode>('manual')
  const [sourceModalLoading, setSourceModalLoading] = useState(false)
  const [editingSourceId, setEditingSourceId] = useState('')

  const [manualName, setManualName] = useState('')
  const [manualApiUrl, setManualApiUrl] = useState('')
  const [manualApiKey, setManualApiKey] = useState('')
  const [importUrl, setImportUrl] = useState('')

  const pageTitle = subPage === 'main'
    ? '我的'
    : subPage === 'appearance'
      ? '外观设置'
      : '自定义源管理'

  const ensureSelected = useCallback((id: string) => {
    if (selectedImportedSourceId) return
    dispatch({ type: 'MUSIC_SOURCE_SET_SELECTED_IMPORTED', payload: id })
  }, [dispatch, selectedImportedSourceId])

  const handleThemeChange = useCallback((mode: ThemeMode) => {
    dispatch({ type: 'CONFIG_SET_THEME', payload: mode })
  }, [dispatch])

  const handleAutoSwitchChange = useCallback((value: boolean) => {
    dispatch({ type: 'MUSIC_SOURCE_SET_AUTO_SWITCH', payload: value })
  }, [dispatch])

  const handleQualityChange = useCallback((quality: Quality) => {
    dispatch({ type: 'MUSIC_SOURCE_SET_QUALITY', payload: quality })
  }, [dispatch])

  const openCreateSourceModal = useCallback(() => {
    setEditingSourceId('')
    setSourceModalMode('manual')
    setSourceModalLoading(false)
    setManualName('')
    setManualApiUrl('')
    setManualApiKey('')
    setImportUrl('')
    setSourceModalVisible(true)
  }, [])

  const openEditSourceModal = useCallback((source: ImportedMusicSource) => {
    setEditingSourceId(source.id)
    setSourceModalMode('manual')
    setSourceModalLoading(false)
    setManualName(source.name)
    setManualApiUrl(source.apiUrl)
    setManualApiKey(source.apiKey || '')
    setImportUrl('')
    setSourceModalVisible(true)
  }, [])

  const handleUseSource = useCallback((source: ImportedMusicSource) => {
    if (!source.enabled) {
      dispatch({ type: 'MUSIC_SOURCE_TOGGLE_IMPORTED_ENABLED', payload: { id: source.id, enabled: true } })
    }
    dispatch({ type: 'MUSIC_SOURCE_SET_SELECTED_IMPORTED', payload: source.id })
  }, [dispatch])

  const handleToggleSource = useCallback((source: ImportedMusicSource) => {
    const nextEnabled = !source.enabled
    dispatch({ type: 'MUSIC_SOURCE_TOGGLE_IMPORTED_ENABLED', payload: { id: source.id, enabled: nextEnabled } })
    if (!nextEnabled && selectedImportedSourceId === source.id) {
      const fallback = importedSources.find((item) => item.id !== source.id && item.enabled)
      dispatch({ type: 'MUSIC_SOURCE_SET_SELECTED_IMPORTED', payload: fallback?.id || '' })
    }
  }, [dispatch, importedSources, selectedImportedSourceId])

  const handleDeleteSource = useCallback((source: ImportedMusicSource) => {
    Alert.alert('删除音源', `确认删除「${source.name}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => dispatch({ type: 'MUSIC_SOURCE_DELETE_IMPORTED', payload: source.id }),
      },
    ])
  }, [dispatch])

  const handleSubmitSourceModal = useCallback(async() => {
    if (editingSourceId) {
      const name = manualName.trim()
      const apiUrl = manualApiUrl.trim()
      const apiKey = manualApiKey.trim()
      if (!name) return Alert.alert('提示', '请填写音源名称')
      if (!/^https?:\/\//i.test(apiUrl)) return Alert.alert('提示', '请输入有效的 API 地址')

      dispatch({
        type: 'MUSIC_SOURCE_UPDATE_IMPORTED',
        payload: { id: editingSourceId, patch: { name, apiUrl, apiKey: apiKey || undefined } },
      })
      setSourceModalVisible(false)
      return
    }

    if (sourceModalMode === 'manual') {
      const name = manualName.trim()
      const apiUrl = manualApiUrl.trim()
      const apiKey = manualApiKey.trim()
      if (!name) return Alert.alert('提示', '请填写音源名称')
      if (!/^https?:\/\//i.test(apiUrl)) return Alert.alert('提示', '请输入有效的 API 地址')

      const source = createManualSource({ name, apiUrl, apiKey: apiKey || undefined })
      dispatch({ type: 'MUSIC_SOURCE_ADD_IMPORTED', payload: source })
      ensureSelected(source.id)
      setSourceModalVisible(false)
      return
    }

    const sourceUrl = importUrl.trim()
    if (!/^https?:\/\//i.test(sourceUrl)) return Alert.alert('提示', '请输入有效 URL')

    try {
      setSourceModalLoading(true)
      const resp = await fetch(sourceUrl)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const text = await resp.text()
      const source = createSourceFromScriptText(text, { sourceUrl })
      dispatch({ type: 'MUSIC_SOURCE_ADD_IMPORTED', payload: source })
      ensureSelected(source.id)
      setSourceModalVisible(false)
      Alert.alert('导入成功', `已导入：${source.name}${source.apiUrl ? '' : '（请编辑补全 API 地址）'}`)
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : 'URL 导入失败')
    } finally {
      setSourceModalLoading(false)
    }
  }, [dispatch, editingSourceId, ensureSelected, importUrl, manualApiKey, manualApiUrl, manualName, sourceModalMode])

  const handleImportLocalJsFile = useCallback(async() => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/javascript', 'text/javascript', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      })

      if (result.canceled) return
      const asset = result.assets?.[0]
      if (!asset?.uri) {
        Alert.alert('导入失败', '未读取到文件地址')
        return
      }

      const fileName = asset.name || 'source.js'
      if (!/\.m?js$/i.test(fileName)) {
        Alert.alert('文件不支持', '请选择 .js 文件进行导入')
        return
      }

      const scriptText = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      })

      const source = createSourceFromScriptText(scriptText, {
        sourceUrl: asset.uri,
        fallbackName: fileName.replace(/\.m?js$/i, ''),
      })

      dispatch({ type: 'MUSIC_SOURCE_ADD_IMPORTED', payload: source })
      ensureSelected(source.id)
      Alert.alert('导入成功', `已导入本地脚本：${source.name}${source.apiUrl ? '' : '（请编辑补全 API 地址）'}`)
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '本地文件导入失败')
    }
  }, [dispatch, ensureSelected])

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      if (subPage === 'main') return false
      // 仅在左侧边缘触发右滑返回，避免与页面纵向滚动冲突。
      const fromLeftEdge = gestureState.x0 <= 28
      const rightSwipeIntent = gestureState.dx > 12
      const mostlyHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
      return fromLeftEdge && rightSwipeIntent && mostlyHorizontal
    },
    onMoveShouldSetPanResponderCapture: (_, gestureState) => {
      if (subPage === 'main') return false
      const fromLeftEdge = gestureState.x0 <= 28
      const rightSwipeIntent = gestureState.dx > 12
      const mostlyHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
      return fromLeftEdge && rightSwipeIntent && mostlyHorizontal
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, gestureState) => {
      // 子页面支持从左侧边缘向右滑返回主页面。
      if (subPage !== 'main' && gestureState.x0 <= 28 && gestureState.dx > 45) {
        setSubPage('main')
      }
    },
  }), [subPage])

  const renderMainPage = () => (
    <>
      <View style={styles.section}>
        <View style={[styles.card, { backgroundColor: colors.surface, marginHorizontal: spacing.md }]}> 
          <SettingCell
            icon="color-palette-outline"
            title="外观设置"
            subtitle={THEME_LABELS[themeMode]}
            onPress={() => setSubPage('appearance')}
          />
          <SettingCell
            icon="server-outline"
            title="自定义源管理"
            subtitle={selectedSource ? `当前：${selectedSource.name}` : '未配置音源'}
            onPress={() => setSubPage('sources')}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, marginHorizontal: spacing.md, marginBottom: spacing.md }]}> 
        <MenuItem icon="time" label="最近播放" count={playerState.playlist.length} color="#FF9500" />
        <MenuItem icon="heart" label="我喜欢的" count={0} color="#FF2D55" />
        <MenuItem icon="download" label="本地音乐" count={0} color="#5856D6" />
      </View>

      {playerState.playlist.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>当前播放列表</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{playerState.playlist.length} 首</Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface, marginHorizontal: spacing.md }]}> 
            {playerState.playlist.map((track, index) => (
              <TrackListItem
                key={`${track.id}_${index}`}
                track={track}
                index={index}
                showIndex
                isCurrentTrack={currentTrack?.id === track.id}
                isPlaying={isPlaying && currentTrack?.id === track.id}
                onPress={onTrackPress}
              />
            ))}
          </View>
        </View>
      )}
    </>
  )

  const renderAppearancePage = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>主题模式</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{THEME_LABELS[themeMode]}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, marginHorizontal: spacing.md }]}> 
        {THEME_OPTIONS.map((option) => {
          const active = themeMode === option.value
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.row, { borderBottomColor: colors.separator }]}
              onPress={() => handleThemeChange(option.value)}
              activeOpacity={0.75}
            >
              <View style={[styles.themeIconWrap, { backgroundColor: active ? colors.accentLight : colors.surfaceSecondary }]}> 
                <Ionicons name={option.icon} size={16} color={active ? colors.accent : colors.textSecondary} />
              </View>
              <View style={styles.rowMeta}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{option.label}</Text>
                <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>{option.description}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
            </TouchableOpacity>
          )
        })}
      </View>
      <Text style={[styles.swipeHint, { color: colors.textTertiary }]}>左侧边缘右滑可返回</Text>
    </View>
  )

  const renderSourcesPage = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>播放配置</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{selectedSource ? `当前：${selectedSource.name}` : '未选择'}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, marginHorizontal: spacing.md }]}> 
          <View style={[styles.switchRow, { borderBottomColor: colors.separator }]}> 
            <View style={styles.rowMeta}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>自动切换音源</Text>
              <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>当前源失败后自动尝试其它已启用音源</Text>
            </View>
            <Switch value={musicSourceState.autoSwitch} onValueChange={handleAutoSwitchChange} />
          </View>
          <Text style={[styles.qualityTitle, { color: colors.textSecondary }]}>音乐品质（中英对照）</Text>
          <View style={styles.qualityWrap}>
            {ALL_QUALITIES.map((quality) => {
              const active = musicSourceState.preferredQuality === quality
              return (
                <TouchableOpacity
                  key={quality}
                  style={[styles.qualityChip, { backgroundColor: active ? colors.accent : colors.surfaceSecondary }]}
                  onPress={() => handleQualityChange(quality)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.qualityText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{QUALITY_LABELS[quality]}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>已导入音源</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{importedSources.length} 个</Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={openCreateSourceModal}>
            <Ionicons name="add-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>添加音源</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={handleImportLocalJsFile}>
            <Ionicons name="document-attach-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>导入本地 JS</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listWrap}>
          {importedSources.length === 0 && (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}> 
              <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>还没有导入音源</Text>
            </View>
          )}
          {importedSources.map((source) => {
            const active = source.id === selectedImportedSourceId
            const enabled = source.enabled
            return (
              <View
                key={source.id}
                style={[
                  styles.sourceCard,
                  {
                    backgroundColor: enabled ? colors.accentLight : colors.surface,
                    borderColor: enabled ? colors.accent : colors.separator,
                  },
                ]}
              > 
                <View style={styles.sourceHeadRow}>
                  <Text style={[styles.sourceName, { color: colors.text }]}>{source.name}</Text>
                  <View
                    style={[
                      styles.sourceStatusBadge,
                      {
                        backgroundColor: enabled ? colors.accent : colors.surfaceSecondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sourceStatusBadgeText,
                        { color: enabled ? '#FFFFFF' : colors.textSecondary },
                      ]}
                    >
                      {enabled ? '已启用' : '已停用'}
                    </Text>
                  </View>
                </View>
                {active && (
                  <View style={[styles.sourceCurrentBadge, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.sourceCurrentBadgeText, { color: colors.textSecondary }]}>当前使用中</Text>
                  </View>
                )}
                <Text style={[styles.sourceMeta, { color: colors.textSecondary }]}>API: {source.apiUrl || '未配置'}</Text>
                <View style={styles.sourceActions}>
                  <TouchableOpacity style={[styles.cardBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={() => handleUseSource(source)}>
                    <Text style={[styles.cardBtnText, { color: colors.textSecondary }]}>设为当前</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.cardBtn,
                      {
                        backgroundColor: enabled ? 'rgba(255,59,48,0.14)' : 'rgba(52,199,89,0.16)',
                      },
                    ]}
                    onPress={() => handleToggleSource(source)}
                  >
                    <Text style={[styles.cardBtnText, { color: enabled ? '#D70015' : '#16833D' }]}>{enabled ? '停用' : '启用'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cardBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={() => openEditSourceModal(source)}>
                    <Text style={[styles.cardBtnText, { color: colors.textSecondary }]}>编辑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cardBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={() => handleDeleteSource(source)}>
                    <Text style={[styles.cardBtnText, { color: colors.textSecondary }]}>删除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          })}
        </View>
      </View>
      <Text style={[styles.swipeHint, { color: colors.textTertiary }]}>左侧边缘右滑可返回</Text>
    </>
  )

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: BOTTOM_INSET + spacing.md }}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}> 
          {subPage === 'main' ? (
            <View style={styles.headerSidePlaceholder} />
          ) : (
            <TouchableOpacity style={styles.backButton} onPress={() => setSubPage('main')} activeOpacity={0.75}>
              <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
              <Text style={[styles.backText, { color: colors.textSecondary }]}>返回</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.largeTitle, { color: colors.text }]}>{pageTitle}</Text>
          <View style={styles.headerSidePlaceholder} />
        </View>

        {subPage === 'main' && renderMainPage()}
        {subPage === 'appearance' && renderAppearancePage()}
        {subPage === 'sources' && renderSourcesPage()}
      </ScrollView>

      <Modal transparent visible={sourceModalVisible} animationType="fade" onRequestClose={() => setSourceModalVisible(false)}>
        <View style={styles.modalMask}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editingSourceId ? '编辑音源' : '添加/URL 导入音源'}</Text>

            {!editingSourceId && (
              <View style={[styles.segmentWrap, { backgroundColor: colors.surfaceSecondary }]}> 
                <TouchableOpacity
                  style={[styles.segmentItem, sourceModalMode === 'manual' ? { backgroundColor: colors.accentLight } : null]}
                  onPress={() => setSourceModalMode('manual')}
                >
                  <Text style={[styles.segmentText, { color: sourceModalMode === 'manual' ? colors.accent : colors.textSecondary }]}>手动添加</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentItem, sourceModalMode === 'url' ? { backgroundColor: colors.accentLight } : null]}
                  onPress={() => setSourceModalMode('url')}
                >
                  <Text style={[styles.segmentText, { color: sourceModalMode === 'url' ? colors.accent : colors.textSecondary }]}>URL 导入</Text>
                </TouchableOpacity>
              </View>
            )}

            {(editingSourceId || sourceModalMode === 'manual') && (
              <>
                <TextInput value={manualName} onChangeText={setManualName} placeholder="音源名称" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text, borderColor: colors.separator }]} />
                <TextInput value={manualApiUrl} onChangeText={setManualApiUrl} placeholder="API 地址" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text, borderColor: colors.separator }]} />
                <TextInput value={manualApiKey} onChangeText={setManualApiKey} placeholder="API Key(可选)" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text, borderColor: colors.separator }]} />
              </>
            )}

            {!editingSourceId && sourceModalMode === 'url' && (
              <TextInput
                value={importUrl}
                onChangeText={setImportUrl}
                placeholder="https://xxx.com/source.js"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={() => setSourceModalVisible(false)}>
                <Text style={[styles.cardBtnText, { color: colors.textSecondary }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.accent }]} onPress={handleSubmitSourceModal} disabled={sourceModalLoading}>
                {sourceModalLoading
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={[styles.cardBtnText, { color: '#FFFFFF' }]}>{editingSourceId ? '保存' : '确认'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  largeTitle: { fontSize: fontSize.largeTitle - 2, fontWeight: '800' },
  headerSidePlaceholder: { width: 56 },
  backButton: {
    width: 56,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: { fontSize: fontSize.caption1, marginLeft: 2 },
  section: { marginBottom: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.headline, fontWeight: '700' },
  sectionSubtitle: { fontSize: fontSize.footnote, fontWeight: '500' },
  card: { borderRadius: borderRadius.md, overflow: 'hidden' },
  settingCell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  settingCellIcon: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingCellMeta: { flex: 1 },
  settingCellTitle: { fontSize: fontSize.body, fontWeight: '600' },
  settingCellSubtitle: { marginTop: 2, fontSize: fontSize.caption1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  themeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMeta: { flex: 1 },
  rowTitle: { fontSize: fontSize.body, fontWeight: '600' },
  rowDesc: { marginTop: 2, fontSize: fontSize.caption1 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  qualityTitle: { paddingHorizontal: spacing.md, paddingTop: spacing.md, fontSize: fontSize.caption1 },
  qualityWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  qualityChip: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityText: { fontSize: fontSize.caption2, fontWeight: '600' },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  actionText: { fontSize: fontSize.caption1, fontWeight: '600' },
  listWrap: { gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm },
  emptyCard: { borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center' },
  sourceCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sourceName: { fontSize: fontSize.body, fontWeight: '700' },
  sourceStatusBadge: {
    minHeight: 22,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceStatusBadgeText: { fontSize: fontSize.caption2, fontWeight: '700' },
  sourceCurrentBadge: {
    alignSelf: 'flex-start',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    minHeight: 20,
    justifyContent: 'center',
  },
  sourceCurrentBadgeText: { fontSize: fontSize.caption2, fontWeight: '600' },
  sourceMeta: { fontSize: fontSize.caption1 },
  sourceActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  cardBtn: {
    flex: 1,
    height: 30,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBtnText: { fontSize: fontSize.caption1, fontWeight: '600' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuIcon: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, marginLeft: spacing.md, fontSize: fontSize.body, fontWeight: '500' },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  menuCount: { fontSize: fontSize.subhead },
  swipeHint: {
    textAlign: 'center',
    marginTop: spacing.xs,
    fontSize: fontSize.caption2,
  },
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  modalCard: { width: '100%', borderRadius: borderRadius.md, padding: spacing.md },
  modalTitle: { fontSize: fontSize.headline, fontWeight: '700', marginBottom: spacing.sm },
  segmentWrap: {
    height: 34,
    borderRadius: 8,
    padding: 2,
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  segmentItem: {
    flex: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: fontSize.caption1,
    fontWeight: '600',
  },
  input: {
    height: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: {
    flex: 1,
    height: 38,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
