import type { DailyActivity, UserProgress, WordReviewItem, WrongAnswer } from '../types'

export type ActivityKind = 'lessons' | 'reviews' | 'news'

const reviewIntervals = [1, 3, 7, 14]

export function dateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function shiftDate(key: string, days: number) {
  const date = new Date(`${key}T12:00:00`)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

export function isReviewDue(nextReviewAt?: string, today = dateKey()) {
  return !nextReviewAt || nextReviewAt.slice(0, 10) <= today
}

export function scheduleWrongAnswer(item: WrongAnswer, remembered: boolean, now = new Date()): WrongAnswer {
  const correctStreak = remembered ? (item.correctStreak ?? 0) + 1 : 0
  const intervalDays = remembered ? reviewIntervals[Math.min(correctStreak - 1, reviewIntervals.length - 1)] : 1
  return {
    ...item,
    resolved: correctStreak >= reviewIntervals.length,
    correctStreak,
    intervalDays,
    attempts: (item.attempts ?? 0) + 1,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: `${shiftDate(dateKey(now), intervalDays)}T00:00:00.000Z`,
  }
}

export function createWordReview(id: string, articleId: string, word: string, reading: string, meaning: string, now = new Date()): WordReviewItem {
  return { id, articleId, word, reading, meaning, createdAt: now.toISOString(), nextReviewAt: now.toISOString(), intervalDays: 0, correctStreak: 0, attempts: 0, mastered: false }
}

export function scheduleWordReview(item: WordReviewItem, remembered: boolean, now = new Date()): WordReviewItem {
  const correctStreak = remembered ? item.correctStreak + 1 : 0
  const intervalDays = remembered ? reviewIntervals[Math.min(correctStreak - 1, reviewIntervals.length - 1)] : 1
  return {
    ...item,
    mastered: correctStreak >= reviewIntervals.length,
    correctStreak,
    intervalDays,
    attempts: item.attempts + 1,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: `${shiftDate(dateKey(now), intervalDays)}T00:00:00.000Z`,
  }
}

export function calculateStreak(studyDates: string[], today = dateKey()) {
  const dates = new Set(studyDates)
  let cursor = dates.has(today) ? today : shiftDate(today, -1)
  let streak = 0
  while (dates.has(cursor)) {
    streak += 1
    cursor = shiftDate(cursor, -1)
  }
  return streak
}

export function recordActivity(progress: UserProgress, kind: ActivityKind, minutes: number) {
  const today = dateKey()
  const current: DailyActivity = progress.activityByDate[today] ?? { lessons: 0, reviews: 0, news: 0, minutes: 0 }
  const activityByDate = { ...progress.activityByDate, [today]: { ...current, [kind]: current[kind] + 1, minutes: current.minutes + minutes } }
  const studyDates = Array.from(new Set([...progress.studyDates, today])).sort()
  return { ...progress, activityByDate, studyDates, streak: calculateStreak(studyDates, today), lastStudyDate: today }
}

export function weekDateKeys(today = dateKey()) {
  const date = new Date(`${today}T12:00:00`)
  const mondayOffset = (date.getDay() + 6) % 7
  const monday = shiftDate(today, -mondayOffset)
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index))
}
