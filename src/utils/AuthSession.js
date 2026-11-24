import { hydrateQueriesFromOfflineCache } from '../queries/OfflineHydration'
import { queryClient } from '../queries/QueryClient'
import { offlineDB } from './OfflineDB'
import { clearAllTokens, saveTokens } from './TokenStorage'

// Give cached essentials a chance to restore before mounting, but a wedged
// database must not hold the app shell indefinitely. Late reads may still seed
// missing data; hydration guards against overwrites and session changes.
export const restoreSession = async () => {
  let timeout
  try {
    await Promise.race([
      hydrateQueriesFromOfflineCache(queryClient),
      new Promise(resolve => {
        timeout = setTimeout(resolve, 1500)
      }),
    ])
  } catch (err) {
    console.error('Failed to restore offline session', err)
  } finally {
    clearTimeout(timeout)
  }
}

export class SessionStorageError extends Error {
  constructor(cause) {
    super("Couldn't clear local data. Please try signing in again.", { cause })
    this.name = 'SessionStorageError'
  }
}

// How long sign-in/sign-out waits for the offline cache to clear. Mobile
// Safari can stop answering IndexedDB requests (commonly after the tab was
// backgrounded) until the site's data is cleared; without a bound, login
// would spin forever after the server already accepted the credentials.
export const OFFLINE_CLEAR_TIMEOUT_MS = 3000

const TIMED_OUT = Symbol('timed out')

const clearOfflineCache = async () => {
  let timeout
  const clearing = offlineDB.clearAll()
  const result = await Promise.race([
    clearing,
    new Promise(resolve => {
      timeout = setTimeout(() => resolve(TIMED_OUT), OFFLINE_CLEAR_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timeout))

  if (result === TIMED_OUT) {
    console.warn('Offline cache did not clear in time; continuing without it')
    // Drop the wedged connection so the next use opens a fresh one, and keep
    // trying to clear in the background so the previous session's cached
    // data does not survive once the database answers again.
    offlineDB.reset()
    clearing.catch(() => {})
    offlineDB.clearAll().catch(err => {
      console.error('Deferred offline cache clear failed', err)
    })
  }
}

export const clearSession = async () => {
  // Invalidate the session first so pending hydration cannot seed old data.
  await clearAllTokens()
  await queryClient.cancelQueries()
  queryClient.clear()
  await clearOfflineCache()
}

// Explicit login (password, OAuth, or MFA) establishes a new session.
// Token refresh intentionally uses saveTokens directly, retaining cached data.
export const startSession = async tokens => {
  try {
    await clearSession()
  } catch (err) {
    throw new SessionStorageError(err)
  }
  // Storage was just emptied: there is nothing to hydrate after a new login.
  await saveTokens(tokens)
}
