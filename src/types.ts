import type { JlptLevel } from './data/jlpt'

export type Experience = 'new' | 'kana' | 'basic' | 'n5-n4' | 'n3' | 'n2'
export type DailyMinutes = 15 | 30 | 45 | 60 | 90
export type View = 'home' | 'roadmap' | 'learn' | 'review' | 'profile' | 'exam' | 'more'
export type QuestionType = 'multiple-choice' | 'reading' | 'fill-blank' | 'grammar'

export interface UserProfile {
  name: string
  experience: Experience
  goal: JlptLevel
  examDate: string
  dailyMinutes: DailyMinutes
  onboardingComplete: boolean
}

export interface ExampleSentence { japanese: string; reading?: string; pronunciation?: string; korean: string }

export interface Vocabulary {
  id: string; word: string; reading: string; meaning: string; partOfSpeech: string; example: ExampleSentence; related?: string[]
}

export interface Kanji {
  id: string; character: string; readings: string; meaning: string; words: string[]; example: ExampleSentence
}

export interface Grammar {
  id: string; title: string; meaning: string; connection: string; example: ExampleSentence; usage: string; caution: string; similar?: string[]
}

export interface QuizQuestion {
  id: string; lessonId: string; type: QuestionType; category: '문자' | '어휘' | '문법' | '한자' | '독해' | '청해'; prompt: string; context?: string; options: string[]; answer: string; explanation: string; tip: string; related?: string
}

export interface Lesson {
  id: string; phaseId: string; title: string; subtitle: string; duration: number; level: string; category: '문자' | '어휘' | '문법' | '한자' | '독해' | '청해'; concept: string; examples: ExampleSentence[]; keyPoints: string[]; questionIds: string[]
}

export interface Phase {
  id: string; step: string; title: string; subtitle: string; description: string; color: string; unitTitles: string[]
}

export interface WrongAnswer { id: string; questionId: string; selected: string; createdAt: string; resolved: boolean }

export interface UserProgress {
  currentLessonId: string; completedLessons: string[]; answeredQuestionIds: string[]; correctQuestionIds: string[]; reviewItemIds: string[]; wrongAnswers: WrongAnswer[]; completedToday: boolean; totalMinutes: number; streak: number; bonusXp: number; lastStudyDate: string | null; phaseProgress: Record<string, number>; categoryAccuracy: Record<string, number>
}

export interface AppState { profile: UserProfile | null; progress: UserProgress }
