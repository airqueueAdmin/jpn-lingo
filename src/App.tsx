import { useEffect, useMemo, useState } from 'react'
import { grammar, getLesson, getPhase, getQuestion, kanji, lessons, phases, questions, vocabulary } from './data/content'
import { jlptExamInfo, jlptLevels, jlptOfficialLinks, type JlptLevel } from './data/jlpt'
import { askTutor, type TutorResponse } from './services/tutor'
import { assessLearnerLevel, levelForExperience, levelForLessonId } from './services/learner-level'
import { BannerAd, RewardedAdCard, useFullscreenAd } from './components/ads'
import { NotificationConsentCard } from './components/notification'
import { daysUntil, hydrateState, initialState, loadState, saveNativeState, saveState, shouldUseNativeStorage, todayKey } from './lib/storage'
import { isSupabaseConfigured, loadRemoteState, saveRemoteState } from './lib/supabase'
import { logAppEvent, logClick, logScreen } from './services/toss'
import type { AppState, DailyMinutes, Experience, Lesson, QuizQuestion, UserProfile, UserProgress, View, WrongAnswer } from './types'

type QuizResult = { questionId: string; selected: string; correct: boolean }

const experienceOptions: { value: Experience; label: string; detail: string }[] = [
  { value: 'new', label: '완전 처음이에요', detail: '히라가나도 처음이에요' }, { value: 'kana', label: '히라가나·가타카나를 알아요', detail: '문자는 읽을 수 있어요' }, { value: 'basic', label: '기초 일본어를 공부했어요', detail: '짧은 문장을 이해해요' }, { value: 'n5-n4', label: 'N5/N4 수준이에요', detail: '기초 문법을 배웠어요' }, { value: 'n3', label: 'N3 수준이에요', detail: '중급 지문을 읽어요' }, { value: 'n2', label: 'N2를 준비 중이에요', detail: '실전 연습이 필요해요' },
]
const minutesOptions: { value: DailyMinutes; label: string }[] = [{ value: 15, label: '15분' }, { value: 30, label: '30분' }, { value: 45, label: '45분' }, { value: 60, label: '60분' }, { value: 90, label: '90분 이상' }]
const goalOptions: { value: JlptLevel; detail: string }[] = [{ value: 'N5', detail: '기초 일본어' }, { value: 'N4', detail: '기본 일본어' }, { value: 'N3', detail: '일상 일본어' }, { value: 'N2', detail: '중고급 일본어' }, { value: 'N1', detail: '고급 일본어' }]

type LevelEventParam = string | number | boolean | null | undefined

function progressAfterAnswers(progress: UserProgress, results: QuizResult[]): UserProgress {
  const answeredQuestionIds = Array.from(new Set([...progress.answeredQuestionIds, ...results.map((result) => result.questionId)]))
  const correctQuestionIds = Array.from(new Set([...progress.correctQuestionIds, ...results.filter((result) => result.correct).map((result) => result.questionId)]))
  return { ...progress, answeredQuestionIds, correctQuestionIds }
}

function trackLearnerLevelSnapshot(profile: UserProfile | null, progress: UserProgress, source: string, extra: Record<string, LevelEventParam> = {}) {
  if (!profile) return null
  const assessment = assessLearnerLevel(progress, levelForExperience(profile.experience))
  logAppEvent('learner_level_snapshot', {
    source,
    estimated_level: assessment.estimatedLevel,
    confidence: assessment.confidence,
    evidence_count: assessment.evidenceCount,
    overall_accuracy: assessment.overallAccuracy,
    self_reported_level: levelForExperience(profile.experience),
    goal_level: profile.goal,
    current_lesson_id: progress.currentLessonId,
    ...extra,
  })
  return assessment
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [view, setView] = useState<View>(() => viewFromLocation())
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null)
  const [lessonMode, setLessonMode] = useState<'lesson' | 'quiz' | 'result' | null>(null)
  const [lessonResults, setLessonResults] = useState<QuizResult[]>([])
  const [tutorOpen, setTutorOpen] = useState(false)
  const [cloudReady, setCloudReady] = useState(!isSupabaseConfigured)
  const [migrationReady, setMigrationReady] = useState(!shouldUseNativeStorage())

  useEffect(() => {
    if (!migrationReady) return
    saveState(state)
    void saveNativeState(state)
  }, [state, migrationReady])
  useEffect(() => {
    logAppEvent('app_open', { entry_view: viewFromLocation() })
  }, [])
  useEffect(() => {
    if (!cloudReady || !migrationReady || !state.profile?.onboardingComplete) return
    trackLearnerLevelSnapshot(state.profile, state.progress, 'app_open')
  }, [cloudReady, migrationReady])
  useEffect(() => {
    logScreen(activeLessonId ? 'lesson' : view, activeLessonId ? { lesson_id: activeLessonId } : {})
  }, [activeLessonId, view])
  useEffect(() => {
    const handleReward = () => setState((current) => ({ ...current, progress: { ...current.progress, bonusXp: current.progress.bonusXp + 10 } }))
    window.addEventListener('japanese-lingo:ad-reward', handleReward)
    return () => window.removeEventListener('japanese-lingo:ad-reward', handleReward)
  }, [])
  useEffect(() => {
    if (!shouldUseNativeStorage()) return
    let cancelled = false
    void hydrateState().then((hydratedState) => {
      if (cancelled) return
      setState(hydratedState)
      setMigrationReady(true)
    })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!migrationReady || !isSupabaseConfigured) return
    let cancelled = false
    void loadRemoteState(state).then((remoteState) => {
      if (cancelled) return
      setState(remoteState)
      setCloudReady(true)
    })
    return () => { cancelled = true }
  }, [migrationReady])
  useEffect(() => {
    if (!migrationReady || !cloudReady || !isSupabaseConfigured) return
    const timer = window.setTimeout(() => { void saveRemoteState(state) }, 450)
    return () => window.clearTimeout(timer)
  }, [state, cloudReady, migrationReady])

  if (!cloudReady || !migrationReady) return <LoadingScreen />
  if (!state.profile?.onboardingComplete) {
    return <OnboardingScreen onComplete={(profile, startLessonId) => {
      const nextState = { ...initialState, profile, progress: { ...initialState.progress, currentLessonId: startLessonId } }
      setState(nextState)
      logAppEvent('onboarding_completed', { self_reported_level: levelForExperience(profile.experience), goal_level: profile.goal, start_lesson_id: startLessonId, daily_minutes: profile.dailyMinutes })
      trackLearnerLevelSnapshot(profile, nextState.progress, 'onboarding_completed')
      setView('home')
    }} />
  }

  const profile = state.profile
  const progress = state.progress
  const activeLesson = activeLessonId ? getLesson(activeLessonId) : null
  const startLesson = (lessonId = progress.currentLessonId) => { logClick('lesson_start', { lesson_id: lessonId, source: view }); logAppEvent('learning_session_started', { lesson_id: lessonId, lesson_level: levelForLessonId(lessonId), goal_level: profile.goal, source: view }); setActiveLessonId(lessonId); setLessonMode('lesson'); setLessonResults([]); setView('learn') }

  const recordQuizAnswer = (lesson: Lesson, question: QuizQuestion, result: QuizResult, index: number, total: number, sessionResults: QuizResult[]) => {
    const signalProgress = progressAfterAnswers(progress, sessionResults)
    const assessment = assessLearnerLevel(signalProgress, levelForExperience(profile.experience))
    logAppEvent('learner_level_signal', {
      source: 'lesson_quiz',
      lesson_id: lesson.id,
      question_id: question.id,
      question_level: levelForLessonId(question.lessonId),
      category: question.category,
      question_index: index + 1,
      question_count: total,
      is_correct: result.correct,
      estimated_level: assessment.estimatedLevel,
      confidence: assessment.confidence,
      evidence_count: assessment.evidenceCount,
      overall_accuracy: assessment.overallAccuracy,
      goal_level: profile.goal,
    })
  }

  const completeLesson = (lesson: Lesson, results: QuizResult[]) => {
    logAppEvent('lesson_complete', { lesson_id: lesson.id, correct_count: results.filter((result) => result.correct).length, question_count: results.length })
    const answeredIds = Array.from(new Set([...progress.answeredQuestionIds, ...results.map((result) => result.questionId)]))
    const correctIds = Array.from(new Set([...progress.correctQuestionIds, ...results.filter((result) => result.correct).map((result) => result.questionId)]))
    const nextWrong: WrongAnswer[] = [...progress.wrongAnswers]
    results.filter((result) => !result.correct).forEach((result) => {
      const existing = nextWrong.find((wrong) => wrong.questionId === result.questionId && !wrong.resolved)
      if (!existing) nextWrong.push({ id: `${result.questionId}-${Date.now()}`, questionId: result.questionId, selected: result.selected, createdAt: new Date().toISOString(), resolved: false })
    })
    const completedLessons = Array.from(new Set([...progress.completedLessons, lesson.id]))
    const lessonIndex = lessons.findIndex((item) => item.id === lesson.id)
    const nextLesson = lessons[lessonIndex + 1] ?? lesson
    const phaseProgress = { ...progress.phaseProgress }
    phases.forEach((phase) => {
      const phaseLessons = lessons.filter((item) => item.phaseId === phase.id)
      const finished = phaseLessons.filter((item) => completedLessons.includes(item.id)).length
      if (phaseLessons.length) phaseProgress[phase.id] = Math.min(100, Math.max(phaseProgress[phase.id] ?? 0, Math.round((finished / phaseLessons.length) * 100)))
    })
    const categoryAccuracy = { ...progress.categoryAccuracy }
    const relevantCategories = Array.from(new Set(results.map((result) => getQuestion(result.questionId)?.category).filter(Boolean)))
    relevantCategories.forEach((category) => {
      const categoryQuestions = questions.filter((question) => question.category === category && answeredIds.includes(question.id))
      categoryAccuracy[category as keyof typeof categoryAccuracy] = categoryQuestions.length ? Math.round((categoryQuestions.filter((question) => correctIds.includes(question.id)).length / categoryQuestions.length) * 100) : 0
    })
    const today = todayKey()
    const wasStudyingToday = progress.lastStudyDate === today
    const newProgress: UserProgress = { ...progress, currentLessonId: nextLesson.id, completedLessons, answeredQuestionIds: answeredIds, correctQuestionIds: correctIds, wrongAnswers: nextWrong, reviewItemIds: nextWrong.filter((item) => !item.resolved).map((item) => item.id), completedToday: true, totalMinutes: progress.totalMinutes + lesson.duration, streak: wasStudyingToday ? progress.streak : progress.streak + 1, lastStudyDate: today, phaseProgress, categoryAccuracy }
    const lessonAccuracy = results.length ? Math.round((results.filter((result) => result.correct).length / results.length) * 100) : 0
    const previousAssessment = assessLearnerLevel(progress, levelForExperience(profile.experience))
    const nextAssessment = trackLearnerLevelSnapshot(profile, newProgress, 'lesson_complete', { lesson_id: lesson.id, lesson_level: levelForLessonId(lesson.id), lesson_accuracy: lessonAccuracy, question_count: results.length, wrong_count: results.filter((result) => !result.correct).length })
    if (nextAssessment && nextAssessment.estimatedLevel !== previousAssessment.estimatedLevel) {
      logAppEvent('learner_level_updated', { source: 'lesson_complete', previous_level: previousAssessment.estimatedLevel, estimated_level: nextAssessment.estimatedLevel, confidence: nextAssessment.confidence, lesson_id: lesson.id })
    }
    setState((current) => ({ ...current, progress: newProgress }))
    setLessonMode('result'); setLessonResults(results)
  }

  const finishLesson = () => { setLessonMode(null); setActiveLessonId(null); setView('home') }
  const navItems: { id: View; icon: string; label: string }[] = [{ id: 'home', icon: '⌂', label: '홈' }, { id: 'roadmap', icon: '◎', label: '로드맵' }, { id: 'learn', icon: '◌', label: '학습' }, { id: 'review', icon: '↻', label: '복습' }, { id: 'more', icon: '•••', label: '더보기' }]

  const renderView = () => {
  if (activeLesson && lessonMode) return <LessonFlow lesson={activeLesson} mode={lessonMode} initialResults={lessonResults} onStartQuiz={() => setLessonMode('quiz')} onComplete={(results) => completeLesson(activeLesson, results)} onAnswer={(question, result, index, total, sessionResults) => recordQuizAnswer(activeLesson, question, result, index, total, sessionResults)} onFinish={finishLesson} onTutor={() => setTutorOpen(true)} />
    if (view === 'home') return <HomeScreen profile={profile} progress={progress} onStart={() => startLesson()} onNavigate={(nextView) => { logClick('navigation', { destination: nextView }); setView(nextView) }} />
    if (view === 'roadmap') return <RoadmapScreen progress={progress} goal={profile.goal} onStartLesson={startLesson} />
    if (view === 'learn') return <LearnScreen progress={progress} onStartLesson={startLesson} />
    if (view === 'review') return <ReviewScreen progress={progress} onUpdate={(next) => { setState((current) => ({ ...current, progress: next })); if (progress.reviewItemIds.length && next.reviewItemIds.length === 0) trackLearnerLevelSnapshot(profile, next, 'review_complete', { reviewed_count: progress.reviewItemIds.length }) }} />
    if (view === 'exam') return <ExamInfoScreen goal={profile.goal} />
    if (view === 'more') return <MoreScreen onNavigate={setView} />
    return <ProfileScreen profile={profile} progress={progress} tutorOpen={tutorOpen} setTutorOpen={setTutorOpen} />
  }

  return <div className="app-shell"><main className={activeLesson ? 'app-content learning-content' : 'app-content'}>{renderView()}</main>{!activeLesson && <nav className="bottom-nav" aria-label="주요 메뉴">{navItems.map((item) => { const moreActive = item.id === 'more' && (view === 'more' || view === 'exam' || view === 'profile'); return <button className={view === item.id || moreActive ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => { setView(item.id); setActiveLessonId(null); setLessonMode(null) }}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button> })}</nav>}</div>
}

function LoadingScreen() { return <div className="loading-screen"><div className="loading-logo">j</div><p>학습 공간을 준비하고 있어요…</p></div> }

function viewFromLocation(): View {
  if (typeof window === 'undefined') return 'home'
  const route = window.location.pathname.toLowerCase()
  if (route.endsWith('/roadmap')) return 'roadmap'
  if (route.endsWith('/learn')) return 'learn'
  if (route.endsWith('/review')) return 'review'
  if (route.endsWith('/profile')) return 'profile'
  if (route.endsWith('/exam') || route.endsWith('/test-info')) return 'exam'
  if (route.endsWith('/more')) return 'more'
  return 'home'
}

function OnboardingScreen({ onComplete }: { onComplete: (profile: UserProfile, startLessonId: string) => void }) {
  const [step, setStep] = useState(1)
  const [experience, setExperience] = useState<Experience>('new')
  const [goal, setGoal] = useState<JlptLevel | null>(null)
  const [examDate, setExamDate] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 180); return date.toISOString().slice(0, 10) })
  const [dailyMinutes, setDailyMinutes] = useState<DailyMinutes>(30)
  const [diagnosis, setDiagnosis] = useState<Record<string, string>>({})
  const [diagnosed, setDiagnosed] = useState(false)
  const canGoNext = step === 1 ? Boolean(experience) : step === 2 ? Boolean(goal && examDate && dailyMinutes) : diagnosed
  const startId = experience === 'new' || experience === 'kana' ? 'hiragana-basic' : experience === 'basic' ? 'basic-sentence' : experience === 'n5-n4' ? 'n5-vocabulary' : experience === 'n3' ? 'n4-grammar' : 'n2-grammar'
  const finish = () => { if (!goal) return; onComplete({ name: '학습자', experience, goal, examDate, dailyMinutes, onboardingComplete: true }, startId) }

  return <div className="onboarding"><div className="brand-mark"><span>japanese</span><b>-lingo</b></div><div className="onboarding-progress"><span className="progress-label">{step} / 3</span><div className="progress-track"><div style={{ width: `${(step / 3) * 100}%` }} /></div></div>{step === 1 && <section className="onboarding-card"><p className="eyebrow">반가워요</p><h1>일본어, 오늘부터<br /><em>한 걸음씩</em> 시작해요.</h1><p className="intro-copy">현재 위치를 알려주면 목표 레벨까지 이어지는<br />나만의 첫 학습을 준비할게요.</p><h2>일본어를 얼마나 공부했나요?</h2><div className="choice-grid">{experienceOptions.map((item) => <button key={item.value} className={experience === item.value ? 'choice-card selected' : 'choice-card'} onClick={() => setExperience(item.value)}><span className="choice-radio" /><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>)}</div></section>}{step === 2 && <section className="onboarding-card"><p className="eyebrow">학습 목표</p><h1>{goal ? `${goal}까지의 길을` : '나만의 목표를'}<br /><em>함께 계획해요.</em></h1><p className="intro-copy">목표 레벨과 시험일, 하루 학습 시간을 기준으로<br />무리 없는 오늘의 학습량을 계산합니다.</p><label className="field-label">목표 JLPT 레벨</label><div className="goal-grid">{goalOptions.map((item) => <button key={item.value} className={goal === item.value ? 'goal-choice selected' : 'goal-choice'} onClick={() => setGoal(item.value)}><strong>{item.value}</strong><small>{item.detail}</small></button>)}</div><label className="field-label" htmlFor="exam-date">목표 시험일</label><input id="exam-date" className="date-input" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} /><label className="field-label">하루 학습 시간</label><div className="minutes-grid">{minutesOptions.map((item) => <button key={item.value} className={dailyMinutes === item.value ? 'minute-chip selected' : 'minute-chip'} onClick={() => setDailyMinutes(item.value)}>{item.label}</button>)}</div>{goal && <div className="plan-note"><span>✦</span><p>{goal} 목표에 맞춰 매일 가장 중요한 학습부터 보여드려요.</p></div>}</section>}{step === 3 && <section className="onboarding-card diagnosis-card"><p className="eyebrow">빠른 진단</p><h1>지금의 위치를<br /><em>가볍게 확인해요.</em></h1><p className="intro-copy">모르는 문제는 틀려도 괜찮아요.<br />더 좋은 시작점을 찾기 위한 진단이에요.</p>{!diagnosed ? <DiagnosisQuestions answers={diagnosis} setAnswers={setDiagnosis} onFinish={() => setDiagnosed(true)} /> : goal ? <DiagnosisResult experience={experience} goal={goal} onStart={finish} /> : null}</section>}<div className="onboarding-actions">{step > 1 && !diagnosed && <button className="text-button" onClick={() => setStep(step - 1)}>← 이전</button>}{step < 3 && <button className="primary-button wide" disabled={!canGoNext} onClick={() => setStep(step + 1)}>다음으로 <span>→</span></button>}{step === 3 && diagnosed && <button className="primary-button wide" onClick={finish}>내 학습 시작하기 <span>→</span></button>}</div><p className="privacy-note">학습 정보는 이 기기에 안전하게 저장됩니다.</p></div>
}

function DiagnosisQuestions({ answers, setAnswers, onFinish }: { answers: Record<string, string>; setAnswers: (next: Record<string, string>) => void; onFinish: () => void }) {
  const items = [{ id: 'kana', label: '「あ」의 읽기는?', category: '문자', level: '입문', answer: 'a', options: ['a', 'ka', 'sa'] }, { id: 'word', label: '「学生」의 뜻은?', category: '어휘', level: 'N5', answer: '학생', options: ['학생', '선생님', '회사'] }, { id: 'grammar', label: '학교에 갑니다: 学校 ___ 行きます.', category: '문법', level: '기초', answer: 'に', options: ['に', 'を', 'で'] }]
  const finish = () => {
    const correctCount = items.filter((item) => answers[item.id] === item.answer).length
    logAppEvent('diagnosis_completed', { correct_count: correctCount, question_count: items.length, accuracy: Math.round((correctCount / items.length) * 100) })
    onFinish()
  }
  return <div className="diagnosis-list">{items.map((item, index) => <div className="diagnosis-item" key={item.id}><span className="question-number">0{index + 1}</span><div><strong>{item.label}</strong><div className="mini-options">{item.options.map((option) => <button key={option} className={answers[item.id] === option ? 'mini-option selected' : 'mini-option'} onClick={() => { logAppEvent('diagnosis_answer', { question_id: item.id, question_level: item.level, category: item.category, is_correct: option === item.answer, question_index: index + 1 }); setAnswers({ ...answers, [item.id]: option }) }}>{option}</button>)}</div></div></div>)}<button className="secondary-button wide" disabled={Object.keys(answers).length < items.length} onClick={finish}>진단 결과 보기</button></div>
}

function DiagnosisResult({ experience, goal, onStart }: { experience: Experience; goal: JlptLevel; onStart: () => void }) {
  const result = experience === 'new' ? { title: '일본어 입문부터 시작해요', detail: `${goal} 목표를 위해 문자와 발음부터 차근차근 쌓으면 됩니다.` } : experience === 'n2' ? { title: `${goal} 목표로 이어가요`, detail: '현재 실력을 바탕으로 다음 레벨과 실전 문제를 준비해요.' } : { title: '기초부터 빈틈없이 시작해요', detail: `${goal} 목표에 맞춰 이미 아는 내용은 빠르게 통과하고 다음 단계로 갈게요.` }
  return <div className="diagnosis-result"><div className="result-check">✓</div><p className="eyebrow">추천 시작점</p><h2>{result.title}</h2><p>{result.detail}</p><div className="diagnosis-bars"><span>문자 <b>{experience === 'new' ? '0%' : '45%'}</b></span><div><i style={{ width: experience === 'new' ? '2%' : '45%' }} /></div><span>어휘 <b>{experience === 'new' ? '0%' : '30%'}</b></span><div><i style={{ width: experience === 'new' ? '2%' : '30%' }} /></div><span>문법 <b>{experience === 'new' ? '0%' : '20%'}</b></span><div><i style={{ width: experience === 'new' ? '2%' : '20%' }} /></div></div></div>
}

function phasesForGoal(goal: JlptLevel) {
  const targetPhaseId = goal === 'N5' ? 'n5' : goal === 'N4' ? 'n4' : goal === 'N3' ? 'n3' : 'mock'
  const targetIndex = phases.findIndex((phase) => phase.id === targetPhaseId)
  return targetIndex >= 0 ? phases.slice(0, targetIndex + 1) : phases
}

function HomeScreen({ profile, progress, onStart, onNavigate }: { profile: UserProfile; progress: UserProgress; onStart: () => void; onNavigate: (view: View) => void }) {
  const currentLesson = getLesson(progress.currentLessonId); const phase = getPhase(currentLesson.phaseId); const days = daysUntil(profile.examDate); const goalPhases = phasesForGoal(profile.goal); const totalProgress = Math.round(goalPhases.reduce((sum, item) => sum + (progress.phaseProgress[item.id] ?? 0), 0) / goalPhases.length); const reviewCount = progress.wrongAnswers.filter((item) => !item.resolved).length; const accuracy = progress.answeredQuestionIds.length ? Math.round((progress.correctQuestionIds.length / progress.answeredQuestionIds.length) * 100) : 0; const xp = progress.totalMinutes * 10 + progress.correctQuestionIds.length * 5 + progress.completedLessons.length * 20 + progress.bonusXp
  return <><header className="topbar"><div><p className="brand-mini">japanese-lingo</p><p className="greeting">안녕하세요, <strong>{profile.name}</strong>님 <span>✦</span></p><div className="top-status"><span>🔥 {progress.streak}일 연속</span><span>⚡ {xp} XP</span></div></div><button className="icon-button" onClick={() => onNavigate('profile')} aria-label="내 기록">☻</button></header><section className="goal-banner"><div><p className="eyebrow light">JLPT {profile.goal} 목표까지</p><strong>{days}<small>일</small></strong><p className="goal-date">{profile.examDate.replaceAll('-', '.')} 시험을 향해</p></div><div className="goal-ring"><span>{totalProgress}%</span><svg viewBox="0 0 44 44"><circle className="ring-bg" cx="22" cy="22" r="18" /><circle className="ring-value" cx="22" cy="22" r="18" style={{ strokeDashoffset: 113 - (113 * totalProgress) / 100 }} /></svg></div></section><section className="daily-quest"><span className="quest-badge">✦</span><div><strong>오늘의 목표</strong><small>레슨 1개를 끝내고 XP를 모아보세요</small></div><b>{progress.completedToday ? '1' : '0'}<small>/ 1</small></b><div className="quest-track"><i style={{ width: progress.completedToday ? '100%' : '0%' }} /></div></section><section className="current-path"><div className="section-heading"><div><p className="eyebrow">현재 위치</p><h2>{phase.title}</h2></div><span className="path-step">{phase.step}</span></div><div className="path-line"><span className="path-dot done" /><span className="path-line-fill" /><span className="path-dot current" /><span className="path-line-empty" /><span className="path-dot" /></div><div className="path-labels"><span>입문</span><strong>{currentLesson.title}</strong><span>{profile.goal}</span></div></section><section className="today-card"><div className="today-heading"><div><p className="eyebrow">오늘의 학습 <span className="today-dot" /></p><h2>지금은 이것부터 해볼까요?</h2></div><span className="today-time">{profile.dailyMinutes}분</span></div><div className="study-tasks"><TaskRow icon="あ" label={currentLesson.title} duration={`${currentLesson.duration}분`} active /><TaskRow icon="単" label="오늘의 단어 복습" duration="10분" /><TaskRow icon="文" label="기초 문법 한 문제" duration="5분" /></div><button className="primary-button wide" onClick={onStart}><span className="play-icon">▶</span> 오늘 학습 시작</button></section><section className="stats-grid"><StatCard label="연속 학습일" value={`${progress.streak}일`} icon="◷" /><StatCard label="누적 학습 시간" value={`${progress.totalMinutes}분`} icon="↗" /><StatCard label="정답률" value={progress.answeredQuestionIds.length ? `${accuracy}%` : '—'} icon="✓" /></section><NotificationConsentCard completedLessons={progress.completedLessons.length} /><RewardedAdCard /><BannerAd /><section className="insight-card"><div className="insight-icon">✦</div><div><p className="eyebrow">오늘의 추천</p><h3>{reviewCount ? '오답 복습을 먼저 해보세요' : '문자부터 탄탄하게 시작해요'}</h3><p>{reviewCount ? `아직 확인하지 않은 오답이 ${reviewCount}개 있어요.` : '소리와 글자를 연결하면 이후 학습 속도가 빨라져요.'}</p></div><button onClick={() => onNavigate(reviewCount ? 'review' : 'roadmap')}>→</button></section></>
}

function TaskRow({ icon, label, duration, active = false }: { icon: string; label: string; duration: string; active?: boolean }) { return <div className={active ? 'task-row active' : 'task-row'}><span className="task-icon">{icon}</span><span>{label}</span><small>{duration}</small><span className="task-check">{active ? '→' : '○'}</span></div> }
function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) { return <div className="stat-card"><span className="stat-icon">{icon}</span><small>{label}</small><strong>{value}</strong></div> }

function RoadmapScreen({ progress, goal, onStartLesson }: { progress: UserProgress; goal: JlptLevel; onStartLesson: (id: string) => void }) {
  const visiblePhases = phasesForGoal(goal)
  return <><PageHeader eyebrow="YOUR JOURNEY" title={`${goal}까지의 로드맵`} description="지금의 위치에서 다음 한 걸음만 생각해요." />{goal === 'N1' && <div className="plan-note roadmap-goal-note"><span>✦</span><p>현재 코스는 N2 실전까지 제공돼요. N2를 완료하면 N1 학습 코스를 이어서 확장할 수 있어요.</p></div>}<div className="roadmap-list">{visiblePhases.map((phase, index) => { const phaseLessons = lessons.filter((lesson) => lesson.phaseId === phase.id); const value = progress.phaseProgress[phase.id] ?? 0; const unlocked = index === 0 || (progress.phaseProgress[visiblePhases[index - 1].id] ?? 0) >= 70; return <section className={unlocked ? 'phase-card' : 'phase-card locked'} key={phase.id}><div className="phase-marker" style={{ background: phase.color }}>{index === 0 ? '✓' : phase.step.replace('STEP ', '')}</div><div className="phase-main"><div className="phase-heading"><div><span className="phase-step">{phase.step}</span><h2>{phase.title}</h2><p>{phase.subtitle}</p></div><strong className="phase-percent">{value}%</strong></div><div className="bar"><i style={{ width: `${value}%`, background: phase.color }} /></div><p className="phase-description">{phase.description}</p><div className="unit-chips">{phase.unitTitles.map((title) => <span key={title}>{title}</span>)}</div>{unlocked && phaseLessons.length > 0 && <button className="outline-button" onClick={() => onStartLesson(phaseLessons.find((lesson) => !progress.completedLessons.includes(lesson.id))?.id ?? phaseLessons[0].id)}>{value > 0 ? '이어서 학습' : index === 0 ? '첫 레슨 시작' : '미리보기'} <span>→</span></button>}</div></section> })}</div></>
}

function LearnScreen({ progress, onStartLesson }: { progress: UserProgress; onStartLesson: (id: string) => void }) {
  const next = getLesson(progress.currentLessonId)
  return <><PageHeader eyebrow="LEARN" title="학습하기" description="짧은 레슨 하나가 오늘의 실력이 됩니다." /><section className="next-lesson-card"><div className="lesson-label">NEXT LESSON <span>{next.level}</span></div><h2>{next.title}</h2><p>{next.subtitle}</p><div className="lesson-meta"><span>◷ {next.duration}분</span><span>◌ {next.category}</span></div><button className="primary-button" onClick={() => onStartLesson(next.id)}>레슨 시작 <span>→</span></button></section><div className="section-heading compact"><div><p className="eyebrow">전체 레슨</p><h2>순서대로 쌓아가요</h2></div><span className="muted-text">{progress.completedLessons.length}/{lessons.length}</span></div><div className="lesson-list">{lessons.map((lesson, index) => <button key={lesson.id} className={progress.completedLessons.includes(lesson.id) ? 'lesson-list-item done' : lesson.id === next.id ? 'lesson-list-item current' : 'lesson-list-item'} onClick={() => onStartLesson(lesson.id)}><span className="lesson-index">{progress.completedLessons.includes(lesson.id) ? '✓' : String(index + 1).padStart(2, '0')}</span><span className="lesson-list-copy"><strong>{lesson.title}</strong><small>{lesson.subtitle}</small></span><span className="lesson-list-meta">{lesson.duration}분 <b>→</b></span></button>)}</div></>
}

function MoreScreen({ onNavigate }: { onNavigate: (view: View) => void }) {
  return <><PageHeader eyebrow="MORE" title="더보기" description="학습 기록과 JLPT 시험 정보를 확인해요." /><div className="more-menu-list"><button className="more-menu-item" onClick={() => onNavigate('exam')}><span className="more-menu-icon blue">▣</span><span><strong>JLPT 시험 정보</strong><small>과목, 시험 시간, 합격·과락 기준</small></span><b>→</b></button><button className="more-menu-item" onClick={() => onNavigate('profile')}><span className="more-menu-icon purple">☻</span><span><strong>내 학습 기록</strong><small>학습 통계와 AI 일본어 튜터</small></span><b>→</b></button></div><section className="more-tip"><span>✦</span><div><p className="eyebrow">JLPT JOURNEY</p><h3>시험 정보와 학습 기록을 함께 확인해요</h3><p>현재 진도와 목표 시험을 비교하면서 다음 학습을 계획할 수 있어요.</p></div></section></>
}

function ExamInfoScreen({ goal }: { goal: JlptLevel }) {
  const [selectedLevel, setSelectedLevel] = useState<JlptLevel>(goal)
  const info = jlptExamInfo[selectedLevel]

  return <><PageHeader eyebrow="JLPT GUIDE" title="시험 정보" description="레벨별 과목, 시험 시간, 합격 기준을 한눈에 확인해요." /><div className="exam-level-tabs" role="tablist" aria-label="JLPT 레벨 선택">{jlptLevels.map((level) => <button key={level} role="tab" aria-selected={selectedLevel === level} className={selectedLevel === level ? 'exam-level-tab active' : 'exam-level-tab'} onClick={() => setSelectedLevel(level)}>{level}{level === goal && <small>목표</small>}</button>)}</div><section className="exam-hero"><div><span className="exam-level-badge">JLPT {info.level}</span><h2>{info.summary}</h2></div><div className="exam-hero-mark">{info.level}</div></section><section className="exam-highlight-grid"><div><small>총점</small><strong>{info.totalRange}</strong></div><div><small>종합 합격점</small><strong>{info.overallPassMark}</strong></div><div><small>시험 시간</small><strong>{info.testSections.reduce((total, section) => total + Number.parseInt(section.time, 10), 0)}분</strong></div></section><section className="exam-info-section"><div className="section-heading compact"><div><p className="eyebrow">TEST SECTIONS</p><h2>시험 과목</h2></div><span className="muted-text">실제 응시 순서</span></div><div className="exam-test-list">{info.testSections.map((section, index) => <div className="exam-test-row" key={section.name}><span>{String(index + 1).padStart(2, '0')}</span><strong>{section.name}</strong><b>{section.time}</b></div>)}</div></section><section className="exam-info-section"><div className="section-heading compact"><div><p className="eyebrow">SCORING</p><h2>채점 구분과 과락</h2></div></div><div className="exam-score-list">{info.scoringSections.map((section) => <div className="exam-score-row" key={section.name}><div><strong>{section.name}</strong><small>{section.range}</small></div><b>{section.passMark}</b></div>)}</div><div className="exam-warning"><span>!</span><p><strong>총점만 넘으면 합격하는 시험이 아니에요.</strong><br />각 채점 구분에서 기준점 이상을 받아야 하고, 한 영역이라도 미달하면 불합격이에요.</p></div><p className="exam-note">{info.note}</p></section><section className="exam-info-section"><div className="section-heading compact"><div><p className="eyebrow">STUDY FOCUS</p><h2>{info.level} 학습 포인트</h2></div></div><div className="exam-focus-list">{info.studyFocus.map((focus, index) => <span key={focus}><b>{index + 1}</b>{focus}</span>)}</div></section><section className="exam-schedule-card"><p className="eyebrow">KOREA TEST SCHEDULE</p><h2>한국 시험 일정 확인</h2><p>한국 시험은 지역별 실시기관에서 접수해요. 시험일, 접수 기간, 수험표 출력 일정을 공식 사이트에서 확인하세요.</p><div className="exam-schedule-links"><a href={jlptOfficialLinks.korea} target="_blank" rel="noreferrer">서울·중부·호남권 <span>↗</span></a><a href={jlptOfficialLinks.koreaBusan} target="_blank" rel="noreferrer">부산·영남권 <span>↗</span></a></div></section><footer className="exam-sources"><p>시험 정보는 JLPT 공식 안내를 기준으로 정리했어요.</p><a href={jlptOfficialLinks.official} target="_blank" rel="noreferrer">JLPT 공식 홈페이지 확인 <span>↗</span></a></footer></>
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <header className="page-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header> }

function LessonFlow({ lesson, mode, initialResults, onStartQuiz, onComplete, onAnswer, onFinish, onTutor }: { lesson: Lesson; mode: 'lesson' | 'quiz' | 'result'; initialResults: QuizResult[]; onStartQuiz: () => void; onComplete: (results: QuizResult[]) => void; onAnswer: (question: QuizQuestion, result: QuizResult, index: number, total: number, sessionResults: QuizResult[]) => void; onFinish: () => void; onTutor: () => void }) {
  if (mode === 'lesson') return <LessonIntro lesson={lesson} onStartQuiz={onStartQuiz} onTutor={onTutor} />
  if (mode === 'quiz') return <QuizRunner lesson={lesson} onComplete={onComplete} onAnswer={onAnswer} />
  return <LessonResult lesson={lesson} results={initialResults} onFinish={onFinish} />
}

function LessonIntro({ lesson, onStartQuiz, onTutor }: { lesson: Lesson; onStartQuiz: () => void; onTutor: () => void }) {
  return <div className="lesson-flow"><div className="lesson-flow-top"><span>LESSON · {lesson.level}</span><span>⚡ +20 XP</span></div><div className="lesson-hero"><span className="lesson-category">{lesson.category}</span><h1>{lesson.title}</h1><p>{lesson.subtitle}</p></div><section className="concept-block"><p className="eyebrow">오늘의 개념</p><p className="concept-copy">{lesson.concept}</p></section><section className="example-block"><div className="section-heading compact"><div><p className="eyebrow">예문으로 익혀요</p><h2>이렇게 사용해요</h2></div><span className="example-count">{lesson.examples.length} 예문</span></div>{lesson.examples.map((example) => <div className="example-row" key={example.japanese}><strong>{example.japanese}</strong>{example.reading && <small>{example.reading}</small>}{example.pronunciation && <small className="example-pronunciation">{example.pronunciation}</small>}<span>{example.korean}</span></div>)}</section><section className="keypoint-block"><p className="eyebrow">핵심 포인트</p>{lesson.keyPoints.map((point, index) => <div className="keypoint" key={point}><span>0{index + 1}</span><p>{point}</p></div>)}</section>{lesson.id === 'n2-grammar' && <button className="tutor-callout" onClick={onTutor}><span className="sparkle">✦</span><span><strong>이해가 막히면 AI 튜터에게</strong><small>わけではない과 わけがない 차이를 물어보세요.</small></span><b>→</b></button>}<button className="primary-button wide lesson-start" onClick={onStartQuiz}>연습 문제 {lesson.questionIds.length}개 풀기 <span>→</span></button></div>
}

function QuizRunner({ lesson, onComplete, onAnswer }: { lesson: Lesson; onComplete: (results: QuizResult[]) => void; onAnswer: (question: QuizQuestion, result: QuizResult, index: number, total: number, sessionResults: QuizResult[]) => void }) {
  const quizQuestions = lesson.questionIds.map(getQuestion).filter((question): question is QuizQuestion => Boolean(question)); const [index, setIndex] = useState(0); const [selected, setSelected] = useState(''); const [checked, setChecked] = useState(false); const [results, setResults] = useState<QuizResult[]>([]); const question = quizQuestions[index]; const isCorrect = selected === question.answer
  const next = () => { if (!checked) { const result: QuizResult = { questionId: question.id, selected, correct: isCorrect }; onAnswer(question, result, index, quizQuestions.length, [...results, result]); setChecked(true); return } const result: QuizResult = { questionId: question.id, selected, correct: isCorrect }; const nextResults = [...results, result]; if (index === quizQuestions.length - 1) onComplete(nextResults); else { setResults(nextResults); setIndex(index + 1); setSelected(''); setChecked(false) } }
  return <div className="quiz-flow"><div className="quiz-top"><span>문제 {index + 1} / {quizQuestions.length}</span><div className="quiz-progress"><i style={{ width: `${((index + 1) / quizQuestions.length) * 100}%` }} /></div><span>{lesson.category}</span></div><div className="quiz-card"><span className="question-type">{question.type === 'reading' ? '읽기' : question.type === 'grammar' ? '문법' : question.type === 'fill-blank' ? '의미' : '선택'}</span><h1>{question.prompt}</h1>{question.context && <p>{question.context}</p>}<div className="answer-options">{question.options.map((option, optionIndex) => <button key={option} disabled={checked} className={checked && option === question.answer ? 'answer-option correct' : checked && option === selected ? 'answer-option incorrect' : selected === option ? 'answer-option selected' : 'answer-option'} onClick={() => setSelected(option)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{checked && <div className={isCorrect ? 'explanation correct-box' : 'explanation incorrect-box'}><strong>{isCorrect ? '정답이에요!' : '아쉬워요. 다시 기억해봐요.'}</strong><p>{question.explanation}</p><small>TIP · {question.tip}</small></div>}</div><button className="primary-button wide" disabled={!selected} onClick={next}>{checked ? index === quizQuestions.length - 1 ? '결과 확인' : '다음 문제' : '정답 확인'} <span>→</span></button></div>
}

function LessonResult({ lesson, results, onFinish }: { lesson: Lesson; results: QuizResult[]; onFinish: () => void }) { const correct = results.filter((result) => result.correct).length; const percent = Math.round((correct / results.length) * 100); const [finishing, setFinishing] = useState(false); const finish = () => { if (finishing) return; setFinishing(true); onFinish() }; return <div className="result-screen"><div className="result-hero"><div className="result-orbit"><span>{percent}<small>%</small></span><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="49" /><circle className="result-circle" cx="60" cy="60" r="49" style={{ strokeDashoffset: 308 - (308 * percent) / 100 }} /></svg></div><p className="eyebrow">LESSON COMPLETE</p><h1>{percent >= 70 ? '좋은 흐름이에요!' : '끝까지 해냈어요!'}</h1><p>{lesson.title} · {results.length}문제 중 {correct}문제 정답</p></div><section className="result-breakdown"><div><span>정답률</span><strong>{percent}%</strong></div><div><span>학습 시간</span><strong>{lesson.duration}분</strong></div><div><span>다음 단계</span><strong>복습</strong></div></section>{percent < 100 && <div className="result-message"><span>↻</span><p>틀린 문제는 오답노트에 저장했어요.<br />잠시 후 다시 만나면 더 오래 기억할 수 있어요.</p></div>}<button className="primary-button wide" disabled={finishing} onClick={finish}>{finishing ? '오늘 학습을 저장하는 중…' : '학습 마치기'} <span>→</span></button></div> }

function ReviewScreen({ progress, onUpdate }: { progress: UserProgress; onUpdate: (next: UserProgress) => void }) {
  const pending = progress.wrongAnswers.filter((item) => !item.resolved); const [reviewing, setReviewing] = useState(false); const [index, setIndex] = useState(0); const [showAnswer, setShowAnswer] = useState(false)
  const markDone = () => { const done = pending[index]; const doneId = done?.id; const question = done ? getQuestion(done.questionId) : undefined; const nextWrong = progress.wrongAnswers.map((item) => item.id === doneId ? { ...item, resolved: true } : item); logAppEvent('review_item_completed', { question_id: done?.questionId, question_level: question ? levelForLessonId(question.lessonId) : undefined, category: question?.category, remaining_count: Math.max(0, pending.length - index - 1) }); onUpdate({ ...progress, wrongAnswers: nextWrong, reviewItemIds: nextWrong.filter((item) => !item.resolved).map((item) => item.id) }); if (index >= pending.length - 1) { logAppEvent('review_session_completed', { reviewed_count: pending.length }); setReviewing(false); setIndex(0); setShowAnswer(false) } else { setIndex(index + 1); setShowAnswer(false) } }
  if (reviewing && pending[index]) { const wrong = pending[index]; const question = getQuestion(wrong.questionId); if (!question) return null; return <div className="review-session"><div className="quiz-top"><span>복습 {index + 1} / {pending.length}</span><div className="quiz-progress"><i style={{ width: `${((index + 1) / pending.length) * 100}%` }} /></div><span>오답</span></div><div className="review-question"><span className="question-type">{question.category}</span><h1>{question.prompt}</h1><div className="your-answer"><small>내가 고른 답</small><strong>{wrong.selected}</strong></div>{showAnswer ? <div className="explanation correct-box"><strong>정답 · {question.answer}</strong><p>{question.explanation}</p><small>관련 포인트 · {question.tip}</small></div> : <button className="secondary-button wide" onClick={() => setShowAnswer(true)}>정답과 해설 보기</button>}</div>{showAnswer && <button className="primary-button wide" onClick={markDone}>복습 완료 <span>→</span></button>}</div> }
  return <><PageHeader eyebrow="REVIEW" title="복습하기" description="틀린 문제를 다시 만나면 실력이 됩니다." /><section className="review-summary"><div><span className="review-big-number">{pending.length}</span><p>오늘 확인할 오답</p></div><div className="review-summary-icon">↻</div></section><div className="review-categories"><ReviewCategory label="단어" value={Math.min(15, vocabulary.length)} icon="単" color="blue" /><ReviewCategory label="한자" value={Math.min(8, kanji.length)} icon="漢" color="orange" /><ReviewCategory label="문법" value={Math.min(5, grammar.length)} icon="文" color="purple" /><ReviewCategory label="오답" value={pending.length} icon="!”" color="green" /></div>{pending.length ? <button className="primary-button wide review-start" onClick={() => setReviewing(true)}>오늘의 복습 시작 <span>→</span></button> : <div className="empty-state"><span>✦</span><h2>복습할 오답이 없어요</h2><p>레슨을 마치면 틀린 문제를 자동으로 모아드려요.</p></div>}<section className="weakness-section"><div className="section-heading compact"><div><p className="eyebrow">INSIGHT</p><h2>나의 학습 분석</h2></div></div><WeaknessChart progress={progress} /></section></>
}
function ReviewCategory({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) { return <div className="review-category"><span className={`review-icon ${color}`}>{icon}</span><strong>{value}<small>개</small></strong><span>{label}</span></div> }
function WeaknessChart({ progress }: { progress: UserProgress }) { const categories = Object.entries(progress.categoryAccuracy).filter(([category]) => ['문자', '어휘', '문법', '한자', '독해'].includes(category)); return <div className="weakness-chart">{categories.map(([category, value]) => <div className="weakness-row" key={category}><span>{category}</span><div className="bar"><i style={{ width: `${value || 0}%` }} /></div><strong>{value || 0}%</strong></div>)}</div> }

function ProfileScreen({ profile, progress, tutorOpen, setTutorOpen }: { profile: UserProfile; progress: UserProgress; tutorOpen: boolean; setTutorOpen: (open: boolean) => void }) { return <><PageHeader eyebrow="MY RECORD" title="나의 학습 기록" description="조금씩 쌓인 오늘을 확인해요." /><section className="profile-card"><div className="profile-avatar">カ</div><div><p className="eyebrow">JLPT {profile.goal} LEARNER</p><h2>{profile.name}님</h2><p>하루 {profile.dailyMinutes}분 · {profile.examDate.replaceAll('-', '.')} 목표</p></div></section><section className="profile-stats"><div><strong>{progress.streak}</strong><span>연속 학습일</span></div><div><strong>{progress.totalMinutes}</strong><span>누적 학습 분</span></div><div><strong>{progress.completedLessons.length}</strong><span>완료 레슨</span></div></section><button className="ai-tutor-card" onClick={() => setTutorOpen(!tutorOpen)}><span className="ai-icon">✦</span><span><strong>AI 일본어 튜터</strong><small>문법과 표현이 궁금할 때 물어보세요</small></span><b>{tutorOpen ? '×' : '→'}</b></button>{tutorOpen && <TutorPanel level={profile.goal} /> }<section className="data-card"><p className="eyebrow">MY CONTENT</p><div><span>단어 라이브러리</span><strong>{vocabulary.length}개 <b>→</b></strong></div><div><span>기초 한자</span><strong>{kanji.length}개 <b>→</b></strong></div><div><span>문법 노트</span><strong>{grammar.length}개 <b>→</b></strong></div></section><a className="legal-link" href="/terms.html">서비스 이용약관 <span>↗</span></a></> }

function TutorPanel({ level }: { level: JlptLevel }) {
  const rewarded = useFullscreenAd('rewarded')
  const [question, setQuestion] = useState('わけではない랑 わけがない 차이가 뭐야?')
  const [response, setResponse] = useState<TutorResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [adMessage, setAdMessage] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading || !question.trim()) return
    if (!rewarded.configured) {
      setAdMessage('보상형 광고가 설정되지 않아 AI 튜터를 사용할 수 없어요.')
      return
    }
    if (!rewarded.isSupported) {
      setAdMessage('토스 앱에서 보상형 광고를 시청한 후 AI 튜터를 사용할 수 있어요.')
      return
    }
    if (!rewarded.isLoaded) {
      setAdMessage('보상형 광고를 준비하고 있어요. 잠시 후 다시 시도해주세요.')
      return
    }

    setLoading(true)
    setAdMessage('')
    let earnedReward = false
    try {
      await rewarded.show(() => { earnedReward = true })
      if (!earnedReward) {
        setAdMessage('광고를 끝까지 시청하면 AI 튜터 답변을 받을 수 있어요.')
        return
      }
      setResponse(await askTutor({ question, level, context: '한국어 학습자에게 쉬운 설명과 예문으로 답변' }))
    } catch {
      setResponse({ answer: '잠시 연결이 불안정해요. 기본 설명을 준비하지 못했어요.', examples: [] })
    } finally {
      setLoading(false)
    }
  }

  const buttonLabel = loading ? '…' : rewarded.isLoaded ? '광고 보고 질문' : '광고 준비 중'
  return <section className="tutor-panel"><div className="tutor-panel-heading"><span className="ai-icon">✦</span><div><strong>japanese-lingo 튜터</strong><small>{level} 학습자에게 맞춰 설명해요</small></div></div><div className="chat-bubble bot">궁금한 일본어를 한국어로 편하게 물어보세요.<br />질문을 보내기 전에 광고를 먼저 시청하면 예문과 미니 퀴즈까지 준비할게요.</div>{response && <div className="chat-bubble bot response"><p>{response.answer}</p>{response.examples.map((example) => <pre key={example}>{example}</pre>)}{response.quiz && <div className="tutor-quiz"><small>MINI QUIZ</small><strong>{response.quiz.prompt}</strong><span>{response.quiz.options.join('  /  ')}</span></div>}</div>}<p className="tutor-ad-disclosure"><span>AD</span> 질문을 보내면 짧은 광고가 먼저 재생돼요.</p><form className="tutor-form" onSubmit={submit}><input value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="튜터에게 질문" placeholder="예: は와 が는 어떻게 달라?" /><button disabled={!question.trim() || loading || !rewarded.isLoaded} aria-label="광고를 보고 질문 보내기">{buttonLabel}</button></form>{adMessage && <p className="tutor-note">{adMessage}</p>}<p className="tutor-note">AI 답변은 학습 보조용이에요. 중요한 표현은 레슨 해설과 함께 확인하세요.</p></section>
}

export default App
