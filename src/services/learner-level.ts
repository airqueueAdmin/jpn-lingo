import { getQuestion, getLesson } from '../data/content'
import type { Experience, UserProgress } from '../types'

export type LearnerLevel = '입문' | '기초' | 'N5' | 'N4' | 'N3' | 'N2'

const levelOrder: LearnerLevel[] = ['입문', '기초', 'N5', 'N4', 'N3', 'N2']

export function levelForLessonId(lessonId: string): LearnerLevel {
  const phaseId = getLesson(lessonId).phaseId
  if (phaseId === 'basic') return '기초'
  if (phaseId === 'n5') return 'N5'
  if (phaseId === 'n4') return 'N4'
  if (phaseId === 'n3') return 'N3'
  if (phaseId === 'n2' || phaseId === 'mock') return 'N2'
  return '입문'
}
export function levelForExperience(experience: Experience): LearnerLevel {
  if (experience === 'basic') return '기초'
  if (experience === 'n5-n4') return 'N5'
  if (experience === 'n3') return 'N3'
  if (experience === 'n2') return 'N2'
  return '입문'
}

export interface LearnerLevelAssessment {
  estimatedLevel: LearnerLevel
  confidence: 'low' | 'medium' | 'high'
  evidenceCount: number
  overallAccuracy: number
}

export function assessLearnerLevel(progress: UserProgress, fallback: LearnerLevel): LearnerLevelAssessment {
  const stats = Object.fromEntries(levelOrder.map((level) => [level, { attempts: 0, correct: 0 }])) as Record<LearnerLevel, { attempts: number; correct: number }>
  const correctIds = new Set(progress.correctQuestionIds)

  progress.answeredQuestionIds.forEach((questionId) => {
    const question = getQuestion(questionId)
    if (!question) return
    const level = levelForLessonId(question.lessonId)
    stats[level].attempts += 1
    if (correctIds.has(questionId)) stats[level].correct += 1
  })

  const qualifiedLevels = levelOrder.filter((level) => {
    const levelStats = stats[level]
    return levelStats.attempts >= 2 && levelStats.correct / levelStats.attempts >= 0.7
  })
  const estimatedLevel = qualifiedLevels.at(-1) ?? fallback
  const evidenceCount = progress.answeredQuestionIds.length
  const correctCount = progress.correctQuestionIds.filter((questionId) => progress.answeredQuestionIds.includes(questionId)).length

  return {
    estimatedLevel,
    confidence: evidenceCount >= 8 ? 'high' : evidenceCount >= 3 ? 'medium' : 'low',
    evidenceCount,
    overallAccuracy: evidenceCount ? Math.round((correctCount / evidenceCount) * 100) : 0,
  }
}
