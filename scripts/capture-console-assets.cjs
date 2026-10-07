const { chromium } = require('playwright-core')
const fs = require('fs')

const baseUrl = process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:4173/'
const storageKey = 'kana-step-app-state-v1'
const screenshotDir = 'public/assets/screenshots'
const demoState = {
  profile: { name: '학습자', experience: 'new', goal: 'N2', examDate: '2026-12-28', dailyMinutes: 30, onboardingComplete: true },
  progress: {
    currentLessonId: 'hiragana-basic', completedLessons: [], answeredQuestionIds: [], correctQuestionIds: [], reviewItemIds: [], wrongAnswers: [], completedToday: false, totalMinutes: 0, streak: 4, lastStudyDate: null,
    phaseProgress: { intro: 12, basic: 0, n5: 0, n4: 0, n3: 0, n2: 0, mock: 0 }, categoryAccuracy: { '문자': 0, '어휘': 0, '문법': 0, '한자': 0, '독해': 0, '청해': 0 },
  },
}

async function seed(page) {
  await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify(value)), [storageKey, demoState])
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(450)
}

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  const mobile = await browser.newPage({ viewport: { width: 636, height: 1048 }, deviceScaleFactor: 1 })
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' })
  await mobile.screenshot({ path: `${screenshotDir}/01-onboarding.png` })
  await seed(mobile)
  await mobile.screenshot({ path: `${screenshotDir}/02-home.png` })
  await mobile.getByRole('button', { name: /오늘 학습 시작/ }).click()
  await mobile.waitForTimeout(250)
  await mobile.screenshot({ path: `${screenshotDir}/03-lesson.png` })
  await mobile.close()

  const desktop = await browser.newPage({ viewport: { width: 1504, height: 741 }, deviceScaleFactor: 1 })
  await desktop.goto(baseUrl, { waitUntil: 'networkidle' })
  await seed(desktop)
  await desktop.addStyleTag({ content: '.app-shell{max-width:1100px}.app-content{padding-left:72px;padding-right:72px}' })
  await desktop.locator('.nav-item').filter({ hasText: '더보기' }).click()
  await desktop.getByRole('button', { name: /학습 로드맵/ }).click()
  await desktop.waitForTimeout(250)
  await desktop.screenshot({ path: `${screenshotDir}/04-roadmap-landscape.png` })
  await desktop.close()
  await browser.close()
  console.log('Console screenshots created')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
