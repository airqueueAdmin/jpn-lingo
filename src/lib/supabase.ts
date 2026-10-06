import { createClient } from '@supabase/supabase-js'
import type { AppState, UserProfile, UserProgress } from '../types'
import { mergeAppStates } from './storage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null

interface RemoteProfileRow {
  name: string
  experience: UserProfile['experience']
  goal: UserProfile['goal']
  exam_date: string
  daily_minutes: UserProfile['dailyMinutes']
  onboarding_complete: boolean
}

interface RemoteProgressRow {
  current_lesson_id: string
  completed_lessons: string[]
  answered_question_ids: string[]
  correct_question_ids: string[]
  review_item_ids: string[]
  wrong_answers: UserProgress['wrongAnswers']
  completed_today: boolean
  total_minutes: number
  streak: number
  bonus_xp: number
  last_study_date: string | null
  phase_progress: UserProgress['phaseProgress']
  category_accuracy: UserProgress['categoryAccuracy']
}

async function ensureAnonymousSession() {
  if (!supabase) return null
  const current = await supabase.auth.getSession()
  if (current.data.session) return current.data.session.user
  const signedIn = await supabase.auth.signInAnonymously()
  if (signedIn.error) throw signedIn.error
  return signedIn.data.user
}

export async function loadRemoteState(localState: AppState): Promise<AppState> {
  if (!supabase) return localState
  try {
    const user = await ensureAnonymousSession()
    if (!user) return localState
    const [profileResult, progressResult] = await Promise.all([
      supabase.from('profiles').select('name, experience, goal, exam_date, daily_minutes, onboarding_complete').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_progress').select('current_lesson_id, completed_lessons, answered_question_ids, correct_question_ids, review_item_ids, wrong_answers, completed_today, total_minutes, streak, bonus_xp, last_study_date, phase_progress, category_accuracy').eq('user_id', user.id).maybeSingle(),
    ])
    if (profileResult.error) throw profileResult.error
    if (progressResult.error) throw progressResult.error
    const remoteProfile = profileResult.data as RemoteProfileRow | null
    const remoteProgress = progressResult.data as RemoteProgressRow | null
    if (!remoteProfile && !remoteProgress) return localState
    const remoteState: AppState = {
      profile: remoteProfile ? { name: remoteProfile.name, experience: remoteProfile.experience, goal: remoteProfile.goal, examDate: remoteProfile.exam_date, dailyMinutes: remoteProfile.daily_minutes, onboardingComplete: remoteProfile.onboarding_complete } : localState.profile,
      progress: remoteProgress ? { ...localState.progress, currentLessonId: remoteProgress.current_lesson_id, completedLessons: remoteProgress.completed_lessons ?? [], answeredQuestionIds: remoteProgress.answered_question_ids ?? [], correctQuestionIds: remoteProgress.correct_question_ids ?? [], reviewItemIds: remoteProgress.review_item_ids ?? [], wrongAnswers: remoteProgress.wrong_answers ?? [], completedToday: remoteProgress.completed_today ?? false, totalMinutes: remoteProgress.total_minutes ?? 0, streak: remoteProgress.streak ?? 0, bonusXp: remoteProgress.bonus_xp ?? localState.progress.bonusXp, lastStudyDate: remoteProgress.last_study_date ?? null, phaseProgress: remoteProgress.phase_progress ?? localState.progress.phaseProgress, categoryAccuracy: remoteProgress.category_accuracy ?? localState.progress.categoryAccuracy } : localState.progress,
    }
    return mergeAppStates(localState, remoteState)
  } catch (error) {
    console.warn('Supabase state load failed; using local state.', error)
    return localState
  }
}

export async function saveRemoteState(state: AppState) {
  if (!supabase || !state.profile) return
  try {
    const user = await ensureAnonymousSession()
    if (!user) return
    const profile = { user_id: user.id, name: state.profile.name, experience: state.profile.experience, goal: state.profile.goal, exam_date: state.profile.examDate, daily_minutes: state.profile.dailyMinutes, onboarding_complete: state.profile.onboardingComplete }
    const progress = { user_id: user.id, current_lesson_id: state.progress.currentLessonId, completed_lessons: state.progress.completedLessons, answered_question_ids: state.progress.answeredQuestionIds, correct_question_ids: state.progress.correctQuestionIds, review_item_ids: state.progress.reviewItemIds, wrong_answers: state.progress.wrongAnswers, completed_today: state.progress.completedToday, total_minutes: state.progress.totalMinutes, streak: state.progress.streak, bonus_xp: state.progress.bonusXp, last_study_date: state.progress.lastStudyDate, phase_progress: state.progress.phaseProgress, category_accuracy: state.progress.categoryAccuracy }
    const [profileResult, progressResult] = await Promise.all([supabase.from('profiles').upsert(profile, { onConflict: 'user_id' }), supabase.from('user_progress').upsert(progress, { onConflict: 'user_id' })])
    if (profileResult.error) throw profileResult.error
    if (progressResult.error) throw progressResult.error
  } catch (error) {
    console.warn('Supabase state save failed; local state remains available.', error)
  }
}
