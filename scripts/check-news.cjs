const { chromium } = require('playwright-core')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { stripTypeScriptTypes } = require('node:module')

// Verify compatibility and merging without a live Supabase project.
async function checkProgress() {
  const progressCode = stripTypeScriptTypes(fs.readFileSync('src/lib/news-progress.ts', 'utf8'))
  const { parseNewsProgress, mergeNewsProgress, updateNewsProgress } = await import(`data:text/javascript;base64,${Buffer.from(progressCode).toString('base64')}`)
  assert.deepEqual(parseNewsProgress(undefined), { readArticleIds: [], bookmarks: {}, savedWords: {} })
  assert.deepEqual(parseNewsProgress({ readArticleIds: ['one', 1, 'one'], bookmarks: { broken: { saved: true, updatedAt: 'bad' } } }).readArticleIds, ['one'])
  const previous = parseNewsProgress({ readArticleIds: ['one'], bookmarks: { one: { saved: true, updatedAt: '2026-10-05T00:00:00Z' } } })
  const current = parseNewsProgress({ readArticleIds: ['two'], bookmarks: { one: { saved: false, updatedAt: '2026-10-06T00:00:00Z' } } })
  const merged = mergeNewsProgress(current, previous)
  assert.equal(merged.bookmarks.one.saved, false, 'Old storage must not restore a removed bookmark')
  assert.deepEqual(merged.readArticleIds, ['one', 'two'])
  assert.deepEqual(updateNewsProgress(merged, { type: 'read', id: 'one' }).readArticleIds, ['one', 'two'])
  const dataCode = stripTypeScriptTypes(fs.readFileSync('src/data/news.ts', 'utf8'))
  const { newsArticles, plainNewsText } = await import(`data:text/javascript;base64,${Buffer.from(dataCode).toString('base64')}`)
  assert.equal(new Set(newsArticles.map((article) => article.id)).size, newsArticles.length)
  assert.equal(new Set(newsArticles.map((article) => article.level)).size, 5)
  for (const article of newsArticles) {
    assert.equal(new URL(article.source.url).protocol, 'https:')
    assert.ok(article.quiz.options[article.quiz.answer])
    const text = article.paragraphs.map((paragraph) => paragraph.japanese).join('')
    assert.ok(!/[\[\]|]/.test(plainNewsText(text)), `${article.id}: complete ruby markup`)
    for (const word of article.words) assert.ok(text.includes(`[${word.word}|${word.reading}]`), `${article.id}: dictionary word is tappable`)
  }
}

const storageKey = 'kana-step-app-state-v1'
const newsCacheKey = 'japanese-lingo:daily-news-cache-v1'
const seed = {
  profile: { name: '테스트', experience: 'new', goal: 'N5', examDate: '2026-12-06', dailyMinutes: 30, onboardingComplete: true },
  progress: { currentLessonId: 'hiragana-basic', completedLessons: [], answeredQuestionIds: [], correctQuestionIds: [], reviewItemIds: [], wrongAnswers: [], completedToday: false, totalMinutes: 0, streak: 0, bonusXp: 0, lastStudyDate: null, phaseProgress: {}, categoryAccuracy: {} },
}

function seoulDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

async function main() {
  await checkProgress()
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-jp-news-'))
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    // Never contact or mutate a real account during smoke tests.
    await context.route('https://**/*', (route) => route.abort())
    await context.addInitScript(({ storageKey, seed }) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(seed))
      window.__newsSpeech = { cancelled: 0, text: '', rate: 0 }
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        getVoices: () => [], addEventListener() {}, removeEventListener() {},
        cancel() { window.__newsSpeech.cancelled++ },
        speak(utterance) { window.__newsSpeech.text = utterance.text; window.__newsSpeech.rate = utterance.rate; window.__newsUtterance = utterance },
      } })
    }, { storageKey, seed })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(process.env.NEWS_BASE_URL || 'http://127.0.0.1:4173/news')
    await page.getByRole('heading', { name: '뉴스로 읽는 일본어' }).waitFor()
    assert.equal(await page.locator('.news-card').count(), 1)
    for (const level of ['N5', 'N4', 'N3', 'N2', 'N1']) {
      await page.getByRole('group', { name: '뉴스 난이도' }).getByRole('button', { name: new RegExp(level) }).click()
      assert.equal(await page.locator('.news-card').count(), 1, `${level} needs readable content`)
      assert.equal(await page.locator('.news-card .news-badge').innerText(), level)
    }
    await page.getByRole('group', { name: '뉴스 난이도' }).getByRole('button', { name: '전체' }).click()
    assert.equal(await page.locator('.news-card').count(), 5)
    // Search summaries and titles in both Korean and Japanese.
    await page.getByRole('searchbox', { name: '뉴스 검색' }).fill('뮤지엄')
    assert.equal(await page.locator('.news-card').count(), 1)
    await page.getByRole('searchbox', { name: '뉴스 검색' }).fill('no-result-123')
    await page.getByRole('heading', { name: '조건에 맞는 기사가 없어요' }).waitFor()
    await page.getByRole('button', { name: '전체 기사 보기' }).click()
    await page.screenshot({ path: path.join(artifacts, 'news-list-mobile.png'), fullPage: true })
    await page.getByRole('group', { name: '뉴스 난이도' }).getByRole('button', { name: /N5/ }).click()
    await page.locator('.news-card-open').click()
    assert.equal(await page.getByRole('button', { name: '← 뉴스 목록' }).count(), 0, 'Native navigation owns the reader back action')
    assert.ok(await page.locator('ruby').count() > 0)
    await page.getByRole('button', { name: '후리가나', exact: true }).click()
    assert.equal(await page.locator('ruby').count(), 0)
    await page.getByRole('button', { name: '한국어 해석', exact: true }).click()
    assert.equal(await page.locator('.news-translation').count(), 2)
    await page.getByRole('button', { name: '京都 뜻 보기' }).click()
    await page.getByRole('region', { name: '단어 뜻' }).waitFor()
    await page.getByRole('button', { name: '+ 단어 저장' }).click()
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('region', { name: '단어 뜻' }).count(), 0)
    await page.getByRole('button', { name: '☆ 북마크', exact: true }).click()
    await page.getByRole('combobox', { name: '읽어주기 속도' }).selectOption('0.7')
    await page.getByRole('button', { name: '▶ 읽어주기', exact: true }).click()
    const speech = await page.evaluate(() => window.__newsSpeech)
    assert.ok(Math.abs(speech.rate - 0.7) < 0.00001)
    assert.ok(speech.text.includes('京都'))
    assert.ok(!speech.text.includes('|'), 'Speech must not include ruby markup')
    await page.getByRole('button', { name: '■ 읽기 중지', exact: true }).click()
    await page.locator('.news-quiz-options button').first().click()
    await page.getByText('정답은 2번이에요.', { exact: true }).waitFor()
    await page.getByRole('button', { name: '다시 풀기' }).click()
    await page.locator('.news-quiz-options button').nth(1).click()
    await page.getByText('정답이에요!', { exact: true }).waitFor()
    await page.getByRole('button', { name: '읽기 완료', exact: true }).click()
    assert.ok(await page.getByRole('button', { name: '✓ 읽기 완료한 기사' }).isDisabled())
    assert.match(await page.locator('.news-source a').getAttribute('href'), /^https:\/\/www.nintendo.co.jp\//)
    await page.getByRole('button', { name: '후리가나', exact: true }).click()
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: path.join(artifacts, 'news-reader-mobile.png'), fullPage: true })
    console.log('Reader interactions passed')
    // Leaving a reader cancels speech, including via the main navigation.
    await page.getByRole('button', { name: '▶ 읽어주기', exact: true }).click()
    const before = await page.evaluate(() => window.__newsSpeech.cancelled)
    await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: /홈/ }).click()
    assert.ok(await page.evaluate(() => window.__newsSpeech.cancelled) > before)
    await page.reload()
    console.log('Reloaded for persistence checks')
    await page.getByRole('heading', { name: '뉴스로 읽는 일본어' }).waitFor()
    await page.getByRole('button', { name: '북마크', exact: true }).click()
    assert.equal(await page.locator('.news-card').count(), 1)
    await page.getByRole('button', { name: '읽은 기사', exact: true }).click()
    assert.equal(await page.locator('.news-card').count(), 1)
    await page.getByRole('button', { name: '내 단어장', exact: true }).click()
    assert.equal(await page.locator('.news-saved-word').count(), 1)
    await page.getByRole('button', { name: '京都 단어 저장 해제' }).click()
    await page.getByRole('heading', { name: '아직 저장한 단어가 없어요' }).waitFor()
    await page.getByRole('button', { name: '북마크', exact: true }).click()
    await page.locator('.news-card-footer .news-bookmark').click()
    assert.equal(await page.locator('.news-card').count(), 0)
    await page.reload()
    await page.getByRole('heading', { name: '뉴스로 읽는 일본어' }).waitFor()
    await page.getByRole('button', { name: '북마크', exact: true }).click()
    assert.equal(await page.locator('.news-card').count(), 0)
    await page.getByRole('button', { name: '내 단어장', exact: true }).click()
    assert.equal(await page.locator('.news-saved-word').count(), 0)
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey)
    assert.deepEqual(stored.news.readArticleIds, ['nintendo-museum-2024'])
    assert.deepEqual(stored.progress.completedLessons, [], 'News must not change lesson progress')
    await page.getByRole('button', { name: '전체 기사', exact: true }).click()
    for (const width of [320, 780]) {
      await page.setViewportSize({ width, height: 900 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`)
      await page.locator('.news-card-open').click()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Reader fits ${width}px`)
      await page.evaluate(() => window.history.back())
      await page.locator('.news-card-open').first().waitFor()
    }
    await page.getByRole('navigation').getByRole('button', { name: /더보기/ }).click()
    await page.getByRole('button', { name: /학습 로드맵/ }).click()
    assert.ok(await page.locator('.roadmap-list').isVisible())
    assert.deepEqual(errors, [])

    // A cloud article dated today is featured once and remains available in
    // read/bookmark history after a reload.
    const dailyId = `daily-${seoulDateKey()}-test`
    const dailyRow = {
      id: dailyId, publish_date: seoulDateKey(), level: 'N5', category: '생활',
      title: '[今日|きょう]のテストニュース', summary: '매일 추가되는 오늘의 뉴스 테스트예요.', symbol: '日', minutes: 2,
      source_name: 'NHK NEWS', source_url: 'https://www.nhk.or.jp/test/daily-news',
      paragraphs: [
        { japanese: '[今日|きょう]、[新|あたら]しいニュースを[発表|はっぴょう]しました。', korean: '오늘 새로운 뉴스를 발표했습니다.' },
        { japanese: '[毎日|まいにち][一|ひと]つずつ[記事|きじ]を[読|よ]みます。', korean: '매일 하나씩 기사를 읽습니다.' },
      ],
      words: [
        { word: '今日', reading: 'きょう', meaning: '오늘' }, { word: '新', reading: 'あたら', meaning: '새로운' },
        { word: '発表', reading: 'はっぴょう', meaning: '발표' }, { word: '記事', reading: 'きじ', meaning: '기사' },
      ],
      quiz: { question: '기사는 얼마나 자주 추가되나요?', options: ['매일 하나', '매주 하나', '매달 하나'], answer: 0, explanation: '「毎日一つずつ」는 매일 하나씩이라는 뜻이에요.' },
    }
    const cachedDailyArticle = {
      id: dailyRow.id, date: dailyRow.publish_date, level: dailyRow.level, category: dailyRow.category,
      title: dailyRow.title, summary: dailyRow.summary, symbol: dailyRow.symbol, minutes: dailyRow.minutes,
      source: { name: dailyRow.source_name, url: dailyRow.source_url }, paragraphs: dailyRow.paragraphs, words: dailyRow.words, quiz: dailyRow.quiz,
    }
    const dailyContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
    try {
      await dailyContext.route('https://**/*', (route) => {
        if (route.request().url().includes('/rest/v1/news_articles')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([dailyRow]) })
        return route.abort()
      })
      await dailyContext.addInitScript(({ storageKey, newsCacheKey, seed, cachedDailyArticle }) => {
        if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(seed))
        if (!localStorage.getItem(newsCacheKey)) localStorage.setItem(newsCacheKey, JSON.stringify([cachedDailyArticle]))
      }, { storageKey, newsCacheKey, seed, cachedDailyArticle })
      const dailyPage = await dailyContext.newPage()
      dailyPage.setDefaultTimeout(10000)
      await dailyPage.goto(process.env.NEWS_BASE_URL || 'http://127.0.0.1:4173/news')
      await dailyPage.getByRole('heading', { name: '오늘의 뉴스' }).waitFor()
      await dailyPage.locator('.news-card-today').getByRole('button', { name: /今日のテストニュース 기사 읽기/ }).click()
      await dailyPage.getByRole('button', { name: '☆ 북마크', exact: true }).click()
      await dailyPage.getByRole('button', { name: '읽기 완료', exact: true }).click()
      await dailyPage.waitForFunction(({ key, id }) => {
        const stored = JSON.parse(localStorage.getItem(key))
        return stored?.news?.readArticleIds?.includes(id) && stored?.news?.bookmarks?.[id]?.saved
      }, { key: storageKey, id: dailyId })
      await dailyPage.reload()
      await dailyPage.getByRole('heading', { name: '뉴스로 읽는 일본어' }).waitFor()
      await dailyPage.getByRole('button', { name: '읽은 기사', exact: true }).click()
      await dailyPage.getByText('今日のテストニュース', { exact: true }).waitFor()
      await dailyPage.getByRole('button', { name: '북마크', exact: true }).click()
      await dailyPage.getByText('今日のテストニュース', { exact: true }).waitFor()
      const dailyStored = await dailyPage.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey)
      assert.ok(dailyStored.news.readArticleIds.includes(dailyId))
      assert.equal(dailyStored.news.bookmarks[dailyId].saved, true)
    } finally { await dailyContext.close() }
    console.log(`News checks passed: daily article, history, levels, search, reader, quiz, bookmarks, vocabulary, legacy storage, persistence, speech lifecycle, layout, roadmap. Screenshots: ${artifacts}`)
  } finally { await browser.close() }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
