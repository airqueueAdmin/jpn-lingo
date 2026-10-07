const rssUrls = [
  'https://news.web.nhk/n-data/conf/na/rss/cat0.xml',
  'https://www.nhk.or.jp/rss/news/cat0.xml',
]

const levels = ['N5', 'N4', 'N3', 'N2', 'N1'] as const
type Level = typeof levels[number]

type FeedItem = { title: string; description: string; url: string }
type GeneratedArticle = {
  level: Level
  category: string
  title: string
  summary: string
  symbol: string
  minutes: number
  paragraphs: Array<{ japanese: string; korean: string }>
  words: Array<{ word: string; reading: string; meaning: string }>
  quiz: { question: string; options: string[]; answer: number; explanation: string }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function dateInSeoul(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function decodeXml(value: string) {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ').trim()
}

function itemValue(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? decodeXml(match[1]) : ''
}

function parseFeed(xml: string): FeedItem[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map((match) => ({
      title: itemValue(match[1], 'title'),
      description: itemValue(match[1], 'description'),
      url: itemValue(match[1], 'link'),
    }))
    .filter((item) => item.title && /^https:\/\//.test(item.url))
}

async function loadFeed() {
  let lastError: unknown
  for (const url of rssUrls) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'japanese-lingo-learning-news/1.0' } })
      if (!response.ok) throw new Error(`RSS request failed: ${response.status}`)
      const items = parseFeed(await response.text())
      if (items.length) return items
      throw new Error('RSS did not contain any items')
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('News RSS is unavailable')
}

function dbHeaders(serviceKey: string, extra: Record<string, string> = {}) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...extra }
}

async function dbRequest<T>(path: string, serviceKey: string, init: RequestInit = {}): Promise<T> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) throw new Error('SUPABASE_URL is missing')
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: dbHeaders(serviceKey, { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers as Record<string, string> ?? {}) }),
  })
  if (!response.ok) throw new Error(`Database request failed (${response.status}): ${await response.text()}`)
  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

function targetLevel(date: string): Level {
  const day = Math.floor(new Date(`${date}T00:00:00+09:00`).getTime() / 86_400_000)
  return levels[((day % levels.length) + levels.length) % levels.length]
}

function parseGenerated(text: string, expectedLevel: Level): GeneratedArticle {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
  const value = JSON.parse(cleaned) as Partial<GeneratedArticle>
  const paragraphOk = Array.isArray(value.paragraphs) && value.paragraphs.length >= 2 && value.paragraphs.every((item) => typeof item?.japanese === 'string' && typeof item?.korean === 'string')
  const wordsOk = Array.isArray(value.words) && value.words.length >= 4 && value.words.length <= 6 && value.words.every((item) => typeof item?.word === 'string' && typeof item?.reading === 'string' && typeof item?.meaning === 'string')
  const quizOk = value.quiz && typeof value.quiz.question === 'string' && Array.isArray(value.quiz.options) && value.quiz.options.length === 3 && value.quiz.options.every((item) => typeof item === 'string') && Number.isInteger(value.quiz.answer) && value.quiz.answer! >= 0 && value.quiz.answer! < 3 && typeof value.quiz.explanation === 'string'
  const body = paragraphOk ? value.paragraphs!.map((paragraph) => paragraph.japanese).join('\n') : ''
  const tappableWords = wordsOk && value.words!.every((word) => body.includes(`[${word.word}|${word.reading}]`))
  if (value.level !== expectedLevel || typeof value.category !== 'string' || typeof value.title !== 'string' || typeof value.summary !== 'string' || typeof value.symbol !== 'string' || !Number.isInteger(value.minutes) || value.minutes! < 1 || value.minutes! > 10 || !paragraphOk || !wordsOk || !tappableWords || !quizOk) {
    throw new Error('Gemini returned an invalid daily-news schema')
  }
  return value as GeneratedArticle
}

async function generateArticle(item: FeedItem, level: Level) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing')
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite'
  const prompt = `다음 NHK RSS 제목과 요약만 근거로 한국인 일본어 학습자를 위한 짧은 학습용 뉴스를 새로 작성해라.
원문 문장을 길게 복제하지 말고 사실을 추가로 상상하지 마라. 정보가 부족하면 확인되는 사실만 간결하게 쓴다.
목표 난이도는 ${level}이다.
한자가 포함된 핵심 표현은 [漢字|かんじ] 형식으로 후리가나를 붙인다.
words의 모든 단어는 paragraphs의 japanese 안에 정확히 같은 [word|reading] 형식으로 최소 한 번 포함한다.
category는 사회, 생활, 문화, 과학, 경제, 환경, 스포츠 중 하나다.
symbol은 기사 주제를 나타내는 한자 한 글자다. quiz.options는 정확히 3개이고 answer는 0부터 시작하는 정답 인덱스다.
반드시 아래 JSON 필드만 반환한다.
{"level":"${level}","category":"생활","title":"후리가나가 포함된 일본어 제목","summary":"한국어 한 줄 요약","symbol":"日","minutes":3,"paragraphs":[{"japanese":"학습용 일본어 문단","korean":"한국어 번역"},{"japanese":"학습용 일본어 문단","korean":"한국어 번역"}],"words":[{"word":"発表","reading":"はっぴょう","meaning":"발표"},{"word":"予定","reading":"よてい","meaning":"예정"},{"word":"地域","reading":"ちいき","meaning":"지역"},{"word":"利用","reading":"りよう","meaning":"이용"}],"quiz":{"question":"한국어 독해 질문","options":["선택지1","선택지2","선택지3"],"answer":0,"explanation":"한국어 해설"}}

RSS 제목: ${item.title.slice(0, 300)}
RSS 요약: ${item.description.slice(0, 1000)}
원문 URL: ${item.url}`

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 1800, responseMimeType: 'application/json' },
    }),
  })
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}): ${await response.text()}`)
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  return parseGenerated(text, level)
}

async function shortHash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes).slice(0, 6), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405)
  const cronSecret = Deno.env.get('DAILY_NEWS_CRON_SECRET')
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) return json({ error: '허용되지 않은 요청입니다.' }, 401)

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')
    const today = dateInSeoul()
    const existing = await dbRequest<Array<{ id: string; publish_date: string }>>(`news_articles?select=id,publish_date&publish_date=eq.${today}&limit=1`, serviceKey)
    if (existing[0]) return json({ created: false, reason: 'already_exists', article: existing[0] })

    const recent = await dbRequest<Array<{ source_url: string }>>('news_articles?select=source_url&order=publish_date.desc&limit=100', serviceKey)
    const usedUrls = new Set(recent.map((row) => row.source_url))
    const feedItems = await loadFeed()
    const safeTopic = (title: string) => !/殺人|死亡|死体|自殺|性的|虐待|逮捕/.test(title)
    const source = feedItems.find((item) => !usedUrls.has(item.url) && safeTopic(item.title)) ?? feedItems.find((item) => !usedUrls.has(item.url))
    if (!source) throw new Error('RSS has no unused article')

    const level = targetLevel(today)
    const generated = await generateArticle(source, level)
    const id = `daily-${today}-${await shortHash(source.url)}`
    const row = {
      id, publish_date: today, level: generated.level, category: generated.category,
      title: generated.title, summary: generated.summary, symbol: generated.symbol.slice(0, 2), minutes: generated.minutes,
      source_name: 'NHK NEWS', source_url: source.url,
      paragraphs: generated.paragraphs, words: generated.words, quiz: generated.quiz,
    }
    const inserted = await dbRequest<Array<typeof row>>('news_articles?on_conflict=publish_date', serviceKey, {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(row),
    })
    if (inserted[0]) return json({ created: true, article: inserted[0] }, 201)
    const raced = await dbRequest<Array<{ id: string; publish_date: string }>>(`news_articles?select=id,publish_date&publish_date=eq.${today}&limit=1`, serviceKey)
    return json({ created: false, reason: 'already_exists', article: raced[0] ?? null })
  } catch (error) {
    console.error('daily-news failed', error)
    return json({ error: error instanceof Error ? error.message : '오늘의 뉴스를 만들지 못했습니다.' }, 500)
  }
})
