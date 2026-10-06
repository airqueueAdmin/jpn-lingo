import type { AppState, UserProgress } from '../types'

const STORAGE_KEY = 'kana-step-app-state-v1'
const ORIGIN_MIGRATION_KEY = 'japanese-lingo:origin-storage-migrated-v1'
type TossModule = typeof import('@apps-in-toss/web-framework')
let tossModulePromise: Promise<TossModule> | null = null

function getTossModule() {
  tossModulePromise ??= import('@apps-in-toss/web-framework')
  return tossModulePromise
}

export const defaultProgress: UserProgress = {
  currentLessonId: 'hiragana-basic', completedLessons: [], answeredQuestionIds: [], correctQuestionIds: [], reviewItemIds: [], wrongAnswers: [], completedToday: false, totalMinutes: 0, streak: 0, bonusXp: 0, lastStudyDate: null,
  phaseProgress: { intro: 12, basic: 0, n5: 0, n4: 0, n3: 0, n2: 0, mock: 0 }, categoryAccuracy: { '문자': 0, '어휘': 0, '문법': 0, '한자': 0, '독해': 0, '청해': 0 },
}

export const initialState: AppState = { profile: null, progress: defaultProgress }

function parseState(raw: string | null): AppState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>
    const parsedProgress = (parsed.progress ?? {}) as Partial<UserProgress>
    return {
      profile: parsed.profile ?? null,
      progress: {
        ...defaultProgress,
        ...parsedProgress,
        completedLessons: parsedProgress.completedLessons ?? [],
        answeredQuestionIds: parsedProgress.answeredQuestionIds ?? [],
        correctQuestionIds: parsedProgress.correctQuestionIds ?? [],
        reviewItemIds: parsedProgress.reviewItemIds ?? [],
        wrongAnswers: parsedProgress.wrongAnswers ?? [],
        phaseProgress: { ...defaultProgress.phaseProgress, ...(parsedProgress.phaseProgress ?? {}) },
        categoryAccuracy: { ...defaultProgress.categoryAccuracy, ...(parsedProgress.categoryAccuracy ?? {}) },
      },
    }
  } catch {
    return null
  }
}

function unique(values: string[]) { return Array.from(new Set(values)) }

function mergeWrongAnswers(current: UserProgress['wrongAnswers'], previous: UserProgress['wrongAnswers']) {
  const merged = new Map<string, UserProgress['wrongAnswers'][number]>()
  ;[...previous, ...current].forEach((item) => {
    const key = `${item.questionId}:${item.selected}`
    const existing = merged.get(key)
    if (!existing || (existing.resolved && !item.resolved) || item.createdAt > existing.createdAt) {
      merged.set(key, existing?.resolved && !item.resolved ? { ...item, resolved: true } : item)
    }
  })
  return Array.from(merged.values())
}

/**
 * Origin migration is only available inside an Apps in Toss WebView. Keeping
 * this guard prevents a normal browser preview from waiting for the native
 * bridge timeout.
 */
function isTossRuntime() {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  const isTossOrigin = hostname.endsWith('.apps.tossmini.com') || hostname.endsWith('.private-apps.tossmini.com') || hostname.endsWith('.web.tossmini.com') || hostname.endsWith('.private-web.tossmini.com')
  return isTossOrigin || /AppsInToss|TossApp/i.test(window.navigator.userAgent)
}

export function shouldUseNativeStorage() {
  return isTossRuntime()
}

export function shouldMigrateOriginStorage() {
  return shouldUseNativeStorage() && window.localStorage.getItem(ORIGIN_MIGRATION_KEY) !== 'done'
}

export function mergeAppStates(current: AppState, previous: AppState): AppState {
  const currentProgress = current.progress
  const previousProgress = previous.progress
  const currentIsFurther = currentProgress.completedLessons.length >= previousProgress.completedLessons.length
  const wrongAnswers = mergeWrongAnswers(currentProgress.wrongAnswers, previousProgress.wrongAnswers)
  const phaseProgress = Object.fromEntries(Object.keys(defaultProgress.phaseProgress).map((phase) => [phase, Math.max(currentProgress.phaseProgress[phase] ?? 0, previousProgress.phaseProgress[phase] ?? 0)]))
  const categoryAccuracy = Object.fromEntries(Object.keys(defaultProgress.categoryAccuracy).map((category) => [category, Math.max(currentProgress.categoryAccuracy[category] ?? 0, previousProgress.categoryAccuracy[category] ?? 0)]))
  const mergedProgress: UserProgress = {
    ...currentProgress,
    currentLessonId: currentIsFurther ? currentProgress.currentLessonId : previousProgress.currentLessonId,
    completedLessons: unique([...previousProgress.completedLessons, ...currentProgress.completedLessons]),
    answeredQuestionIds: unique([...previousProgress.answeredQuestionIds, ...currentProgress.answeredQuestionIds]),
    correctQuestionIds: unique([...previousProgress.correctQuestionIds, ...currentProgress.correctQuestionIds]),
    reviewItemIds: wrongAnswers.filter((item) => !item.resolved).map((item) => item.id),
    wrongAnswers,
    completedToday: currentProgress.completedToday || previousProgress.completedToday,
    totalMinutes: Math.max(currentProgress.totalMinutes, previousProgress.totalMinutes),
    streak: Math.max(currentProgress.streak, previousProgress.streak),
    bonusXp: Math.max(currentProgress.bonusXp, previousProgress.bonusXp),
    lastStudyDate: [currentProgress.lastStudyDate, previousProgress.lastStudyDate].filter(Boolean).sort().at(-1) ?? null,
    phaseProgress,
    categoryAccuracy,
  }
  return {
    profile: current.profile?.onboardingComplete ? current.profile : previous.profile?.onboardingComplete ? previous.profile : current.profile ?? previous.profile,
    progress: { ...mergedProgress, completedToday: mergedProgress.lastStudyDate === todayKey() ? mergedProgress.completedToday : false },
  }
}

/**
 * Reads both Toss Origins once, merges the app's state key, and writes the
 * result into the current Origin. Other storage types are intentionally left
 * untouched because this app only persists its learning state in localStorage.
 */
export async function migrateOriginStorage(): Promise<AppState | null> {
  if (!shouldMigrateOriginStorage() || window.localStorage.getItem(ORIGIN_MIGRATION_KEY) === 'done') return null
  try {
    const { Migration } = await getTossModule()
    const { previous, current } = await Migration.getOriginStorage()
    if (previous.errors.length > 0 || current.errors.length > 0) {
      console.warn('Apps in Toss Origin storage migration skipped because a storage snapshot could not be read.', { previous: previous.errors, current: current.errors })
      return null
    }
    const currentRaw = current.localStorage[STORAGE_KEY] ?? window.localStorage.getItem(STORAGE_KEY)
    const previousRaw = previous.localStorage[STORAGE_KEY]
    const currentState = parseState(currentRaw) ?? initialState
    const previousState = parseState(previousRaw)
    const merged = previousState ? mergeAppStates(currentState, previousState) : currentState
    saveState(merged)
    window.localStorage.setItem(ORIGIN_MIGRATION_KEY, 'done')
    return merged
  } catch (error) {
    console.warn('Apps in Toss Origin storage migration is unavailable in this runtime.', error)
    return null
  }
}

export function loadState(): AppState {
  const state = parseState(window.localStorage.getItem(STORAGE_KEY)) ?? initialState
  return { ...state, progress: { ...state.progress, completedToday: state.progress.lastStudyDate === todayKey() ? state.progress.completedToday : false } }
}

export function saveState(state: AppState) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }

export async function hydrateState(): Promise<AppState> {
  let state = loadState()
  const migratedState = await migrateOriginStorage()
  if (migratedState) state = migratedState
  if (shouldUseNativeStorage()) {
    try {
      const { Storage } = await getTossModule()
      const nativeState = parseState(await Storage.getItem(STORAGE_KEY))
      if (nativeState) state = mergeAppStates(state, nativeState)
    } catch (error) {
      console.warn('토스 영구 저장소에서 학습 상태를 복원하지 못했어요. 웹 저장소를 사용합니다.', error)
    }
  }
  saveState(state)
  return state
}

export async function saveNativeState(state: AppState) {
  if (!shouldUseNativeStorage()) return
  try {
    const { Storage } = await getTossModule()
    await Storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('토스 영구 저장소에 학습 상태를 저장하지 못했어요.', error)
  }
}

export function todayKey() { return new Date().toISOString().slice(0, 10) }

export function daysUntil(date: string) {
  const target = new Date(`${date}T00:00:00`)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86_400_000))
}
