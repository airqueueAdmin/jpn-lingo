import { Fragment, useMemo, useState } from 'react'
import { kanaChartGroups, kanaCharacters, type KanaCharacter, type KanaScript } from '../data/kana'
import { recordActivity } from '../lib/learning'
import type { KanaMastery, UserProgress } from '../types'

type KanaFilter = 'all' | KanaScript
type KanaQuestion = { target: KanaCharacter; mode: 'read' | 'match'; options: string[] }

function shuffle<T>(values: T[]) {
  return [...values].sort(() => Math.random() - 0.5)
}

function masteryOf(progress: UserProgress, id: string): KanaMastery {
  return progress.kanaMastery[id] ?? { attempts: 0, correct: 0, streak: 0, mastered: false }
}

function makeSession(progress: UserProgress, filter: KanaFilter): KanaQuestion[] {
  const pool = kanaCharacters.filter((item) => filter === 'all' || item.script === filter)
  const candidates = shuffle(pool).sort((a, b) => {
    const aMastery = masteryOf(progress, a.id)
    const bMastery = masteryOf(progress, b.id)
    return Number(aMastery.mastered) - Number(bMastery.mastered) || aMastery.streak - bMastery.streak
  }).slice(0, 10)
  return candidates.map((target, index) => {
    const distractors = shuffle(pool.filter((item) => item.id !== target.id && item.group === target.group)).slice(0, 3)
    const mode = index % 2 === 0 ? 'read' : 'match'
    return { target, mode, options: shuffle([mode === 'read' ? target.romaji : target.character, ...distractors.map((item) => mode === 'read' ? item.romaji : item.character)]) }
  })
}

function updateKana(progress: UserProgress, target: KanaCharacter, correct: boolean): UserProgress {
  const previous = masteryOf(progress, target.id)
  const nextStreak = correct ? previous.streak + 1 : 0
  const nextMastery: KanaMastery = { attempts: previous.attempts + 1, correct: previous.correct + (correct ? 1 : 0), streak: nextStreak, mastered: nextStreak >= 3 }
  return { ...progress, kanaMastery: { ...progress.kanaMastery, [target.id]: nextMastery } }
}

export function KanaPracticeScreen({ progress, onUpdate, onBack }: { progress: UserProgress; onUpdate: (next: UserProgress) => void; onBack: () => void }) {
  const [filter, setFilter] = useState<KanaFilter>('all')
  const [started, setStarted] = useState(false)
  const [session, setSession] = useState<KanaQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState('')
  const [checked, setChecked] = useState(false)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)
  const visibleCharacters = useMemo(() => kanaCharacters.filter((item) => filter === 'all' || item.script === filter), [filter])
  const mastered = visibleCharacters.filter((item) => masteryOf(progress, item.id).mastered).length
  const current = session[index]

  const start = () => {
    setSession(makeSession(progress, filter)); setIndex(0); setSelected(''); setChecked(false); setScore(0); setFinished(false); setStarted(true)
  }

  const answer = () => {
    if (!current || !selected) return
    if (!checked) { setChecked(true); return }
    const correct = selected === (current.mode === 'read' ? current.target.romaji : current.target.character)
    const nextProgress = updateKana(progress, current.target, correct)
    const nextScore = score + (correct ? 1 : 0)
    onUpdate(index === session.length - 1 ? recordActivity(nextProgress, 'lessons', 5) : nextProgress)
    if (index === session.length - 1) { setScore(nextScore); setFinished(true); setStarted(false) }
    else { setScore(nextScore); setIndex(index + 1); setSelected(''); setChecked(false) }
  }

  if (started && current) {
    const correct = selected === (current.mode === 'read' ? current.target.romaji : current.target.character)
    return <div className="kana-practice"><button className="back-button" onClick={() => setStarted(false)}>← 문자 마스터로</button><div className="kana-quiz-top"><span>문제 {index + 1} / {session.length}</span><div className="quiz-progress"><i style={{ width: `${((index + 1) / session.length) * 100}%` }} /></div><span>{current.target.script === 'hiragana' ? '히라가나' : '가타카나'}</span></div><section className="kana-quiz-card"><span className="question-type">{current.mode === 'read' ? '읽기' : '글자 찾기'}</span><div className="kana-prompt" lang="ja">{current.mode === 'read' ? current.target.character : current.target.romaji}</div><p>{current.mode === 'read' ? '소리를 떠올린 뒤 로마자를 골라 보세요.' : '이 소리에 해당하는 글자를 골라 보세요.'}</p><div className="answer-options">{current.options.map((option, optionIndex) => <button key={option} disabled={checked} className={checked && option === (current.mode === 'read' ? current.target.romaji : current.target.character) ? 'answer-option correct' : checked && option === selected ? 'answer-option incorrect' : selected === option ? 'answer-option selected' : 'answer-option'} onClick={() => setSelected(option)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{checked && <div className={correct ? 'explanation correct-box' : 'explanation incorrect-box'}><strong>{correct ? '정답이에요!' : `정답 · ${current.mode === 'read' ? current.target.romaji : current.target.character}`}</strong><p>{current.target.character} = {current.target.romaji} · {current.target.group === 'combination' ? '두 글자를 한 박자로 읽어요.' : current.target.group === 'voiced' ? '탁음·반탁음 소리를 확인해요.' : '기본음 표에서 행을 다시 확인해요.'}</p></div>}</section><button className="primary-button wide" disabled={!selected} onClick={answer}>{checked ? index === session.length - 1 ? '결과 확인' : '다음 문제' : '정답 확인'} <span>→</span></button></div>
  }

  return <div className="kana-lab"><button className="back-button" onClick={onBack}>← 학습으로 돌아가기</button><header className="page-header"><p className="eyebrow">KANA MASTER</p><h1>히라가나·가타카나<br /><em>만점 연습실</em></h1><p>표를 보고, 바로 읽고, 3회 연속 맞혀야 숙달돼요.</p></header><div className="kana-score-card"><div><span>현재 숙달</span><strong>{mastered}<small> / {visibleCharacters.length}자</small></strong></div><div className="kana-score-ring"><span>{visibleCharacters.length ? Math.round((mastered / visibleCharacters.length) * 100) : 0}%</span></div></div><div className="kana-filter" role="tablist" aria-label="문자 종류 선택">{(['all', 'hiragana', 'katakana'] as KanaFilter[]).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => { setFilter(item); setFinished(false) }}>{item === 'all' ? '전체' : item === 'hiragana' ? 'ひ 히라가나' : 'カ 가타카나'}</button>)}</div>{finished && <div className="kana-finished"><strong>{score === session.length ? '완벽해요! 🎉' : '한 번 더 하면 만점에 가까워져요.'}</strong><span>{session.length}문제 중 {score}문제 정답 · 틀린 글자는 다시 우선 출제돼요.</span></div>}<button className="primary-button wide kana-start" onClick={start}>{finished ? '취약 글자 다시 연습' : '오늘의 10문제 시작'} <span>→</span></button><section className="kana-chart-section"><div className="section-heading compact"><div><p className="eyebrow">REFERENCE CHART</p><h2>문자표</h2></div><span className="muted-text">{visibleCharacters.length}자</span></div>{kanaChartGroups.map((group) => <div className="kana-chart-group" key={group.title}><div><strong>{group.title}</strong><small>{group.note}</small></div><div className="kana-chart"><span className="kana-chart-head">행</span><span className="kana-chart-head">히라가나</span><span className="kana-chart-head">가타카나</span>{group.rows.map((row) => { const h = masteryOf(progress, row.hiragana.id); const k = masteryOf(progress, row.katakana.id); return <Fragment key={`${group.title}-${row.label}`}><span className="kana-row-label">{row.label}</span><span className={h.mastered ? 'kana-cell mastered' : 'kana-cell'}><b lang="ja">{row.hiragana.character}</b><small>{row.hiragana.romaji}</small>{h.mastered && <i>✓</i>}</span><span className={k.mastered ? 'kana-cell mastered' : 'kana-cell'}><b lang="ja">{row.katakana.character}</b><small>{row.katakana.romaji}</small>{k.mastered && <i>✓</i>}</span></Fragment>})}</div></div>)}</section></div>
}
