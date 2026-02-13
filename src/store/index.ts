/**
 * Redux store configuration
 */

import { createStore, combineReducers } from 'redux'
import playerReducer from './reducers/player'
import playlistReducer from './reducers/playlist'
import configReducer from './reducers/config'
import musicSourceReducer from './reducers/musicSource'

const rootReducer = combineReducers({
  player: playerReducer,
  playlist: playlistReducer,
  config: configReducer,
  musicSource: musicSourceReducer,
})

export type RootState = ReturnType<typeof rootReducer>

export const store = createStore(rootReducer)

export default store
