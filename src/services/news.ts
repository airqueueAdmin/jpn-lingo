import { newsArticles as builtInArticles, type NewsArticle } from '../data/news'
import { supabase } from '../lib/supabase'
import type { JlptLevel } from '../data/jlpt'

interface NewsRow {
  id: string
  publish_date: string
  level: string
  category: string
  title: string
  summary: string
  symbol: string
  minutes: number
  source_name: string
  source_url: string
  paragraphs: unknown
  words: unknown
  quiz: unknown
}

const levels = new Set<JlptLevel>(['N5', 'N4', 'N3', 'N2', 'N1'])
const NEWS_CACHE_KEY = 'japanese-lingo:daily-news-cache-v1'
const CACHE_LIMIT = 180

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseArticle(row: NewsRow): NewsArticle | null {
  if (!row.id || !/^\d{4}-\d{2}-\d{2}$/.test(row.publish_date) || !levels.has(row.level as JlptLevel)) return null
  if (!row.category || !row.title || !row.summary || !row.symbol || !Number.isFinite(row.minutes) || !row.source_name || !/^https:\/\//.test(row.source_url)) return null
  if (!Array.isArray(row.paragraphs) || !row.paragraphs.every((item) => isRecord(item) && typeof item.japanese === 'string' && typeof item.korean === 'string')) return null
  if (!Array.isArray(row.words) || !row.words.every((item) => isRecord(item) && typeof item.word === 'string' && typeof item.reading === 'string' && typeof item.meaning === 'string')) return null
  if (!isRecord(row.quiz) || typeof row.quiz.question !== 'string' || !Array.isArray(row.quiz.options) || !row.quiz.options.every((item) => typeof item === 'string') || typeof row.quiz.answer !== 'number' || typeof row.quiz.explanation !== 'string') return null
  return {
    id: row.id,
    date: row.publish_date,
    level: row.level as JlptLevel,
    category: row.category,
    title: row.title,
    summary: row.summary,
    symbol: row.symbol,
    minutes: row.minutes,
    source: { name: row.source_name, url: row.source_url },
    paragraphs: row.paragraphs as NewsArticle['paragraphs'],
    words: row.words as NewsArticle['words'],
    quiz: row.quiz as NewsArticle['quiz'],
  }
}

function parseCachedArticle(value: unknown) {
  if (!isRecord(value) || !isRecord(value.source)) return null
  return parseArticle({
    id: typeof value.id === 'string' ? value.id : '',
    publish_date: typeof value.date === 'string' ? value.date : '',
    level: typeof value.level === 'string' ? value.level : '',
    category: typeof value.category === 'string' ? value.category : '',
    title: typeof value.title === 'string' ? value.title : '',
    summary: typeof value.summary === 'string' ? value.summary : '',
    symbol: typeof value.symbol === 'string' ? value.symbol : '',
    minutes: typeof value.minutes === 'number' ? value.minutes : Number.NaN,
    source_name: typeof value.source.name === 'string' ? value.source.name : '',
    source_url: typeof value.source.url === 'string' ? value.source.url : '',
    paragraphs: value.paragraphs,
    words: value.words,
    quiz: value.quiz,
  })
}

export function sortNewsArticles(articles: NewsArticle[]) {
  return [...articles].sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id))
}

export function mergeNewsArticles(remoteArticles: NewsArticle[]) {
  const merged = new Map(builtInArticles.map((article) => [article.id, article]))
  remoteArticles.forEach((article) => merged.set(article.id, article))
  return sortNewsArticles([...merged.values()])
}

export function loadCachedNewsArticles() {
  if (typeof window === 'undefined') return mergeNewsArticles([])
  try {
    const value = JSON.parse(window.localStorage.getItem(NEWS_CACHE_KEY) ?? '[]') as unknown
    const cached = Array.isArray(value) ? value.map(parseCachedArticle).filter((article): article is NewsArticle => Boolean(article)) : []
    return mergeNewsArticles(cached)
  } catch {
    return mergeNewsArticles([])
  }
}

function saveNewsCache(articles: NewsArticle[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(sortNewsArticles(articles).slice(0, CACHE_LIMIT)))
  } catch (error) {
    console.warn('Daily news cache could not be updated.', error)
  }
}

export function seoulDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export async function loadNewsArticles() {
  const cachedArticles = loadCachedNewsArticles()
  if (!supabase) return { articles: cachedArticles, cloudAvailable: false }
  const rows: NewsRow[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('news_articles')
      .select('id, publish_date, level, category, title, summary, symbol, minutes, source_name, source_url, paragraphs, words, quiz')
      .order('publish_date', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) {
      console.warn('Daily news archive is unavailable; using the cached archive.', error)
      return { articles: cachedArticles, cloudAvailable: false }
    }
    rows.push(...data as NewsRow[])
    if (data.length < pageSize) break
  }
  const remoteArticles = rows.map(parseArticle).filter((article): article is NewsArticle => Boolean(article))
  saveNewsCache(remoteArticles)
  return {
    articles: mergeNewsArticles(remoteArticles),
    cloudAvailable: true,
  }
}
