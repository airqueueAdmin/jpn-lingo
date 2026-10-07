import type { NewsProgress, NewsSave } from '../types'

export const emptyNewsProgress: NewsProgress = { readArticleIds: [], bookmarks: {}, savedWords: {} }

function parseSaves(value: unknown): Record<string, NewsSave> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry && typeof entry.saved === 'boolean' && typeof entry.updatedAt === 'string' && Number.isFinite(Date.parse(entry.updatedAt))))
}

export function parseNewsProgress(value: unknown): NewsProgress {
  if (!value || typeof value !== 'object') return { ...emptyNewsProgress }
  const data = value as Partial<NewsProgress>
  return {
    readArticleIds: Array.isArray(data.readArticleIds) ? [...new Set(data.readArticleIds.filter((id): id is string => typeof id === 'string'))] : [],
    bookmarks: parseSaves(data.bookmarks), savedWords: parseSaves(data.savedWords),
  }
}

function mergeSaves(current: Record<string, NewsSave>, previous: Record<string, NewsSave>) {
  const merged = { ...previous }
  Object.entries(current).forEach(([id, entry]) => {
    if (!merged[id] || Date.parse(entry.updatedAt) >= Date.parse(merged[id].updatedAt)) merged[id] = entry
  })
  return merged
}

export function mergeNewsProgress(current: NewsProgress, previous: NewsProgress): NewsProgress {
  return {
    readArticleIds: [...new Set([...previous.readArticleIds, ...current.readArticleIds])],
    bookmarks: mergeSaves(current.bookmarks, previous.bookmarks),
    savedWords: mergeSaves(current.savedWords, previous.savedWords),
  }
}

export type NewsAction = { type: 'read' | 'bookmark' | 'word'; id: string }

export function updateNewsProgress(progress: NewsProgress, action: NewsAction): NewsProgress {
  if (action.type === 'read') return { ...progress, readArticleIds: [...new Set([...progress.readArticleIds, action.id])] }
  const field = action.type === 'bookmark' ? 'bookmarks' : 'savedWords'
  return { ...progress, [field]: { ...progress[field], [action.id]: { saved: !progress[field][action.id]?.saved, updatedAt: new Date().toISOString() } } }
}
