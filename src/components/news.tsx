import { Fragment, useEffect, useRef, useState } from 'react'
import { jlptLevels, type JlptLevel } from '../data/jlpt'
import { plainNewsText, type NewsArticle, type NewsWord } from '../data/news'
import type { NewsProgress } from '../types'
import type { NewsAction } from '../lib/news-progress'
import { logAppEvent, subscribeNativeBack } from '../services/toss'
import { loadCachedNewsArticles, loadNewsArticles, seoulDateKey } from '../services/news'
import './news.css'

const levelLabels: Record<JlptLevel, string> = { N5: '기초', N4: '초급', N3: '중급', N2: '중고급', N1: '고급' }
const wordId = (article: NewsArticle, word: NewsWord) => `${article.id}:${word.word}`
const articleDate = (article: NewsArticle) => article.dateLabel ?? article.date.replaceAll('-', '.')

export function NewsScreen({ goal, progress, onAction }: { goal: JlptLevel; progress: NewsProgress; onAction: (action: NewsAction) => void }) {
  const [level, setLevel] = useState<JlptLevel | 'all'>(goal)
  const [collection, setCollection] = useState<'all' | 'saved' | 'read' | 'words'>('all')
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [articles, setArticles] = useState<NewsArticle[]>(loadCachedNewsArticles)
  const [newsLoading, setNewsLoading] = useState(true)
  const [cloudAvailable, setCloudAvailable] = useState(false)
  const listScroll = useRef(0)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const activeArticle = articles.find((article) => article.id === activeId)
  const search = query.trim().toLocaleLowerCase()
  const todayArticle = articles.find((article) => article.date === seoulDateKey())
  const showToday = collection === 'all' && !search
  const matches = articles.filter((article) => (level === 'all' || article.level === level)
    && (collection !== 'saved' || progress.bookmarks[article.id]?.saved)
    && (collection !== 'read' || progress.readArticleIds.includes(article.id))
    && `${plainNewsText(article.title)} ${article.summary} ${article.category} ${article.source.name}`.toLocaleLowerCase().includes(search))
  const visibleMatches = showToday && todayArticle ? matches.filter((article) => article.id !== todayArticle.id) : matches
  const savedWords = articles.flatMap((article) => article.words.filter((word) => progress.savedWords[wordId(article, word)]?.saved).map((word) => ({ article, word })))

  useEffect(() => {
    let cancelled = false
    void loadNewsArticles().then((result) => {
      if (cancelled) return
      setArticles(result.articles)
      setCloudAvailable(result.cloudAvailable)
      setNewsLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (activeId) window.scrollTo(0, 0)
    else {
      window.scrollTo(0, listScroll.current)
      returnFocus.current?.focus({ preventScroll: true })
    }
  }, [activeId])

  useEffect(() => {
    const handleHistoryBack = () => setActiveId(null)
    window.addEventListener('popstate', handleHistoryBack)
    return () => window.removeEventListener('popstate', handleHistoryBack)
  }, [])

  useEffect(() => {
    if (!activeId) return
    return subscribeNativeBack(() => {
      if (window.history.state?.japaneseLingoNewsArticle === activeId) window.history.back()
      else setActiveId(null)
    })
  }, [activeId])

  const open = (article: NewsArticle, target: HTMLButtonElement) => {
    listScroll.current = window.scrollY
    returnFocus.current = target
    const url = new URL(window.location.href)
    url.searchParams.set('article', article.id)
    window.history.pushState({ ...(window.history.state ?? {}), japaneseLingoNewsArticle: article.id }, '', url)
    setActiveId(article.id)
    logAppEvent('news_article_open', { article_id: article.id, level: article.level })
  }

  if (activeArticle) return <NewsReader key={activeArticle.id} article={activeArticle} progress={progress} onAction={onAction} />

  return <section className="news-screen">
    <header className="page-header"><p className="eyebrow">NEWS READING</p><h1>뉴스로 읽는 일본어</h1><p>세상 이야기를 읽으며, 한 문장씩 내 것으로.</p></header>
    <div className="news-intro"><div><span className="eyebrow">MY READING</span><strong>{progress.readArticleIds.filter((id) => articles.some((article) => article.id === id)).length}<small>편 읽었어요</small></strong><p>목표는 {goal} · 내 속도에 맞게 레벨을 골라요.</p></div><span className="news-intro-mark" aria-hidden="true">読む</span></div>
    <div className="news-collections" role="group" aria-label="뉴스 모아보기">
      {([{ id: 'all', label: '전체 기사' }, { id: 'saved', label: '북마크' }, { id: 'read', label: '읽은 기사' }, { id: 'words', label: '내 단어장' }] as const).map((item) => <button key={item.id} aria-pressed={collection === item.id} onClick={() => setCollection(item.id)}>{item.label}</button>)}
    </div>
    {showToday && <section className="news-today" aria-labelledby="today-news-heading">
      <div className="news-list-heading"><h2 id="today-news-heading">오늘의 뉴스 <span>매일 1편</span></h2><span>{seoulDateKey().replaceAll('-', '.')}</span></div>
      {todayArticle
        ? <NewsCard article={todayArticle} progress={progress} onAction={onAction} onOpen={open} today />
        : <div className="news-today-pending" role="status"><span aria-hidden="true">日</span><div><strong>{newsLoading ? '오늘의 뉴스를 확인하고 있어요' : cloudAvailable ? '오늘의 뉴스를 준비하고 있어요' : '오늘의 뉴스가 아직 연결되지 않았어요'}</strong><p>{newsLoading ? '잠시만 기다려 주세요.' : cloudAvailable ? '아침 자동 업데이트가 완료되면 여기에 표시됩니다.' : '클라우드 뉴스 설정 후 매일 새 기사가 표시됩니다.'}</p></div></div>}
    </section>}
    {collection === 'words' ? <section className="news-word-list"><h2>저장한 단어 <small>{savedWords.length}개</small></h2>{savedWords.length ? savedWords.map(({ article, word }) => <div className="news-saved-word" key={wordId(article, word)}><div><strong lang="ja">{word.word}</strong><small lang="ja">{word.reading}</small><p>{word.meaning}</p><button className="text-button" onClick={(event) => open(article, event.currentTarget)}>관련 {article.level} 기사 읽기 →</button></div><button className="news-chip" aria-label={`${word.word} 단어 저장 해제`} onClick={() => onAction({ type: 'word', id: wordId(article, word) })}>저장 해제</button></div>) : <NewsEmpty title="아직 저장한 단어가 없어요" description="기사에서 밑줄 친 단어를 누르고 단어장에 저장해 보세요." />}</section> : <>
      <div className="news-levels" role="group" aria-label="뉴스 난이도"><button aria-pressed={level === 'all'} onClick={() => setLevel('all')}>전체<small>레벨</small></button>{jlptLevels.map((item) => <button key={item} aria-pressed={level === item} onClick={() => setLevel(item)}>{item}<small>{levelLabels[item]}</small></button>)}</div>
      <label className="news-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="뉴스 검색" placeholder="일본어 제목, 한국어 주제로 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="news-list-heading"><h2>{showToday ? '지난 뉴스' : level === 'all' ? '모든 난이도' : `${level} ${levelLabels[level]}`} <span>{visibleMatches.length}편</span></h2><span>최신 날짜순</span></div>
      <div className="news-list">{visibleMatches.map((article) => <NewsCard key={article.id} article={article} progress={progress} onAction={onAction} onOpen={open} />)}</div>
      {!visibleMatches.length && <NewsEmpty title="조건에 맞는 기사가 없어요" description="다른 난이도를 선택하거나 검색어를 바꿔 보세요."><button className="secondary-button" onClick={() => { setLevel('all'); setQuery(''); setCollection('all') }}>전체 기사 보기</button></NewsEmpty>}
    </>}
    <p className="news-disclosure">공식 뉴스의 제목과 요약을 바탕으로 재작성한 학습용 아카이브입니다. 오늘의 뉴스는 매일 1편 추가되고, 이전 기사는 삭제하지 않습니다. 날짜와 사실관계는 연결된 원문도 함께 확인해 주세요.</p>
  </section>
}

function NewsCard({ article, progress, onAction, onOpen, today = false }: { article: NewsArticle; progress: NewsProgress; onAction: (action: NewsAction) => void; onOpen: (article: NewsArticle, target: HTMLButtonElement) => void; today?: boolean }) {
  return <article className={today ? 'news-card news-card-today' : 'news-card'}>
    {today && <span className="news-today-label">TODAY</span>}
    <button className="news-card-open" onClick={(event) => onOpen(article, event.currentTarget)} aria-label={`${plainNewsText(article.title)} 기사 읽기`}>
      <span className={`news-art news-art-${article.level.toLowerCase()}`} aria-hidden="true"><span>{article.symbol}</span><small>{article.category}</small></span>
      <span className="news-card-copy"><span className="news-meta"><span className={`news-badge news-badge-${article.level.toLowerCase()}`}>{article.level}</span><span>{article.category} · 약 {article.minutes}분</span></span><strong lang="ja">{plainNewsText(article.title)}</strong><span className="news-summary">{article.summary}</span></span>
    </button>
    <div className="news-card-footer"><span>{articleDate(article)}{progress.readArticleIds.includes(article.id) && <b> · 읽음 ✓</b>}</span><button className="news-bookmark" aria-label={`${plainNewsText(article.title)} 북마크`} aria-pressed={Boolean(progress.bookmarks[article.id]?.saved)} onClick={() => onAction({ type: 'bookmark', id: article.id })}>{progress.bookmarks[article.id]?.saved ? '★ 저장됨' : '☆ 저장'}</button></div>
  </article>
}

function NewsEmpty({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <div className="empty-state news-empty"><span aria-hidden="true">文</span><h2>{title}</h2><p>{description}</p>{children}</div>
}

function NewsText({ text, furigana, words = [], onWord }: { text: string; furigana: boolean; words?: NewsWord[]; onWord?: (word: NewsWord) => void }) {
  return <>{text.split(/(\[[^|\]]+\|[^\]]+\])/g).map((part, index) => {
    const match = /^\[([^|\]]+)\|([^\]]+)\]$/.exec(part)
    if (!match) return <Fragment key={index}>{part}</Fragment>
    const [, surface, reading] = match
    const word = words.find((item) => item.word === surface)
    const label = furigana ? <ruby>{surface}<rp>(</rp><rt>{reading}</rt><rp>)</rp></ruby> : surface
    return word && onWord ? <button className="news-inline-word" key={index} onClick={() => onWord(word)} aria-label={`${surface} 뜻 보기`}>{label}</button> : <Fragment key={index}>{label}</Fragment>
  })}</>
}

function NewsReader({ article, progress, onAction }: { article: NewsArticle; progress: NewsProgress; onAction: (action: NewsAction) => void }) {
  const [furigana, setFurigana] = useState(true)
  const [translation, setTranslation] = useState(false)
  const [selectedWord, setSelectedWord] = useState<NewsWord | null>(null)
  const [answer, setAnswer] = useState<number | null>(null)
  const [rate, setRate] = useState(0.85)
  const [speaking, setSpeaking] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const wordPanel = useRef<HTMLDivElement | null>(null)
  const wordTrigger = useRef<HTMLElement | null>(null)
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => { if (selectedWord) wordPanel.current?.focus({ preventScroll: true }) }, [selectedWord])
  useEffect(() => {
    if (!speechSupported) return
    const synth = window.speechSynthesis
    const updateVoices = () => setVoices(synth.getVoices().filter((voice) => /^ja(?:[-_]|$)/i.test(voice.lang)))
    updateVoices()
    synth.addEventListener('voiceschanged', updateVoices)
    return () => { utterance.current = null; synth.cancel(); synth.removeEventListener('voiceschanged', updateVoices) }
  }, [speechSupported])

  const stop = () => { utterance.current = null; if (speechSupported) window.speechSynthesis.cancel(); setSpeaking(false) }
  const speak = () => {
    if (speaking) { stop(); return }
    if (!speechSupported) return
    setSpeechError('')
    try {
      window.speechSynthesis.cancel()
      const speech = new SpeechSynthesisUtterance(article.paragraphs.map((paragraph) => plainNewsText(paragraph.japanese)).join('\n'))
      speech.lang = 'ja-JP'; speech.rate = rate
      if (voices[0]) speech.voice = voices[0]
      speech.onend = () => { if (utterance.current === speech) { utterance.current = null; setSpeaking(false) } }
      speech.onerror = () => { if (utterance.current === speech) { utterance.current = null; setSpeaking(false); setSpeechError('일본어 음성을 재생하지 못했어요. 기기의 일본어 음성 설정을 확인해 주세요.') } }
      utterance.current = speech
      setSpeaking(true)
      window.speechSynthesis.speak(speech)
    } catch { stop(); setSpeechError('이 환경에서는 읽어주기를 시작할 수 없어요.') }
  }
  const showWord = (word: NewsWord) => { wordTrigger.current = document.activeElement as HTMLElement; setSelectedWord(word) }
  const closeWord = () => { setSelectedWord(null); wordTrigger.current?.focus({ preventScroll: true }) }
  const read = progress.readArticleIds.includes(article.id)

  return <article className="news-reader">
    <header className="news-reader-header"><div className="news-reader-heading"><div className="news-meta"><span className={`news-badge news-badge-${article.level.toLowerCase()}`}>{article.level} · {levelLabels[article.level]}</span><span>{article.category} · 약 {article.minutes}분</span></div><button className="news-bookmark" aria-pressed={Boolean(progress.bookmarks[article.id]?.saved)} onClick={() => onAction({ type: 'bookmark', id: article.id })}>{progress.bookmarks[article.id]?.saved ? '★ 북마크됨' : '☆ 북마크'}</button></div><h1 ref={heading} tabIndex={-1} lang="ja"><NewsText text={article.title} furigana={furigana} /></h1><p>{article.summary}</p><small>{articleDate(article)} · {article.source.name}</small></header>
    <div className="news-reader-tools"><div className="news-tool-row"><button className="news-chip" aria-pressed={furigana} onClick={() => setFurigana(!furigana)}>후리가나</button><button className="news-chip" aria-pressed={translation} onClick={() => setTranslation(!translation)}>한국어 해석</button></div><div className="news-tool-row"><button className="news-chip" disabled={!speechSupported} aria-pressed={speaking} onClick={speak}>{speaking ? '■ 읽기 중지' : '▶ 읽어주기'}</button><label className="news-speed">속도 <select aria-label="읽어주기 속도" value={rate} onChange={(event) => { stop(); setRate(Number(event.target.value)) }}><option value={0.7}>0.7×</option><option value={0.85}>0.85×</option><option value={1}>1.0×</option><option value={1.2}>1.2×</option></select></label></div></div>
    {!speechSupported && <p className="news-note">이 기기에서는 읽어주기를 지원하지 않아요.</p>}
    {speechError && <p className="news-note" role="status">{speechError}</p>}
    <p className="news-note">밑줄 친 단어를 누르면 뜻을 볼 수 있어요.</p>
    <div className="news-body">{article.paragraphs.map((paragraph, index) => <section key={index}><p lang="ja"><NewsText text={paragraph.japanese} furigana={furigana} words={article.words} onWord={showWord} /></p>{translation && <p className="news-translation">{paragraph.korean}</p>}</section>)}</div>
    {selectedWord && <div className="news-word-panel" ref={wordPanel} tabIndex={-1} role="region" aria-label="단어 뜻" onKeyDown={(event) => { if (event.key === 'Escape') closeWord() }}><div><strong lang="ja">{selectedWord.word}</strong><span lang="ja">{selectedWord.reading}</span><p>{selectedWord.meaning}</p></div><button className="news-chip" aria-pressed={Boolean(progress.savedWords[wordId(article, selectedWord)]?.saved)} onClick={() => onAction({ type: 'word', id: wordId(article, selectedWord) })}>{progress.savedWords[wordId(article, selectedWord)]?.saved ? '✓ 저장됨' : '+ 단어 저장'}</button><button className="news-word-close" aria-label="단어 뜻 닫기" onClick={closeWord}>×</button></div>}
    <section className="news-vocabulary"><h2>기사 속 단어 <span>{article.words.length}</span></h2><div>{article.words.map((word) => <button key={word.word} onClick={() => showWord(word)}><strong lang="ja">{word.word}</strong><small lang="ja">{word.reading}</small><span>{word.meaning}</span></button>)}</div></section>
    <section className="news-quiz"><p className="eyebrow">READING CHECK</p><h2>잘 읽었는지 확인해요</h2><p>{article.quiz.question}</p><div className="news-quiz-options">{article.quiz.options.map((option, index) => <button key={option} disabled={answer !== null} className={answer !== null && index === article.quiz.answer ? 'correct' : answer === index ? 'incorrect' : ''} onClick={() => setAnswer(index)}><span>{index + 1}</span>{option}{answer !== null && index === article.quiz.answer && ' ✓'}</button>)}</div>{answer !== null && <div className="news-quiz-result" role="status"><strong>{answer === article.quiz.answer ? '정답이에요!' : `정답은 ${article.quiz.answer + 1}번이에요.`}</strong><p>{article.quiz.explanation}</p><button className="text-button" onClick={() => setAnswer(null)}>다시 풀기</button></div>}</section>
    <button className="primary-button wide" disabled={read} onClick={() => { onAction({ type: 'read', id: article.id }); logAppEvent('news_article_complete', { article_id: article.id, level: article.level }) }}>{read ? '✓ 읽기 완료한 기사' : '읽기 완료'}</button>
    <footer className="news-source"><a href={article.source.url} target="_blank" rel="noreferrer">{article.source.name} 원문 확인 ↗</a><p>출처의 발표 당시 내용을 학습용으로 재작성했어요. 날짜와 예정 사항은 원문 기준이며, 현재 상황과 다를 수 있습니다.</p></footer>
  </article>
}
