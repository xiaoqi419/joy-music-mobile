import { DiscoverSourceId } from '../../../types/discover'
import { kgDiscoverSource } from './kg'
import { kwDiscoverSource } from './kw'
import { txDiscoverSource } from './tx'
import { wyDiscoverSource } from './wy'
import { DiscoverSourceAdapter } from './types'

console.log('[DiscoverSources] module loaded, sources:', {
  kw: !!kwDiscoverSource,
  wy: !!wyDiscoverSource,
  tx: !!txDiscoverSource,
  kg: !!kgDiscoverSource,
})

export const discoverSources = {
  kw: kwDiscoverSource,
  wy: wyDiscoverSource,
  tx: txDiscoverSource,
  kg: kgDiscoverSource,
} as const satisfies Partial<Record<DiscoverSourceId, DiscoverSourceAdapter>>

export const discoverSourceList: Array<{ id: DiscoverSourceId; name: string }> = [
  { id: 'kw', name: 'KW' },
  { id: 'wy', name: 'WY' },
  { id: 'tx', name: 'TX' },
  { id: 'kg', name: 'KG' },
]
