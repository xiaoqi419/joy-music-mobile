/**
 * Redux store configuration
 */

import { createStore, combineReducers } from 'redux'
import playerReducer from './reducers/player'
import playlistReducer from './reducers/playlist'
import configReducer from './reducers/config'

const rootReducer = combineReducers({
  player: playerReducer,
  playlist: playlistReducer,
  config: configReducer,
})

export type RootState = ReturnType<typeof rootReducer>

export const store = createStore(rootReducer)

export default store
