import { DiscoverSourceId } from '../../../types/discover'
import { kgDiscoverSource } from './kg'
import { kwDiscoverSource } from './kw'
import { mgDiscoverSource } from './mg'
import { txDiscoverSource } from './tx'
import { wyDiscoverSource } from './wy'
import { DiscoverSourceAdapter } from './types'

export const discoverSources: Record<DiscoverSourceId, DiscoverSourceAdapter> = {
  kw: kwDiscoverSource,
  wy: wyDiscoverSource,
  tx: txDiscoverSource,
  kg: kgDiscoverSource,
  mg: mgDiscoverSource,
}

export const discoverSourceList: Array<{ id: DiscoverSourceId; name: string }> = [
  { id: 'kw', name: 'KW' },
  { id: 'wy', name: 'WY' },
  { id: 'tx', name: 'TX' },
  { id: 'kg', name: 'KG' },
  { id: 'mg', name: 'MG' },
]
