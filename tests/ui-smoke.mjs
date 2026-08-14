import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = process.env.UI_BASE_URL ?? 'http://localhost:3000'
const browser = await chromium.launch({ headless: true })
const browserErrors = []

async function trackErrors(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()} (${message.location().url || 'unknown URL'})`)
  })
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`))
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${label} has horizontal overflow: ${JSON.stringify(dimensions)}`)
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
desktop.setDefaultTimeout(12_000)
desktop.setDefaultNavigationTimeout(30_000)
await trackErrors(desktop)
console.log('Checking desktop login...')
await desktop.goto(baseUrl, { waitUntil: 'networkidle' })
await desktop.getByRole('heading', { name: 'Every lecture becomes a learning companion.' }).waitFor()
await assertNoHorizontalOverflow(desktop, 'desktop login')
await desktop.screenshot({ path: '/tmp/onestop-login-desktop.png', fullPage: true })

console.log('Checking student workspace...')
await desktop.getByRole('button', { name: /Student Learn from your lecture context/ }).click()
await desktop.getByRole('button', { name: /Enter OneStop/ }).click()
await desktop.getByRole('heading', { name: /Welcome,/ }).waitFor()
await assertNoHorizontalOverflow(desktop, 'student overview')
await desktop.screenshot({ path: '/tmp/onestop-student-overview.png', fullPage: true })

await desktop.getByRole('button', { name: 'Classroom', exact: true }).click()
await desktop.getByRole('heading', { name: 'Your subjects' }).waitFor()
await desktop.locator('.subject-card').first().click()
await desktop.getByText('Subject workspace').waitFor()
await desktop.screenshot({ path: '/tmp/onestop-student-subject.png', fullPage: true })
const firstLecture = desktop.locator('.lecture-summary-card').first()
if (await firstLecture.count()) {
  await firstLecture.click()
  await desktop.getByText('Interaction options').waitFor()
  await desktop.screenshot({ path: '/tmp/onestop-student-lecture.png', fullPage: true })
  await desktop.getByRole('button', { name: /Back to/ }).click()
}

await desktop.getByRole('button', { name: 'Search workspace' }).click()
await desktop.getByPlaceholder('Search subjects, lectures, or topics...').fill('data')
await desktop.locator('.search-dialog').waitFor()
await desktop.keyboard.press('Escape')

console.log('Checking teacher workspace...')
await desktop.locator('.role-switcher').click()
await desktop.locator('.role-menu').getByRole('button', { name: 'Teacher' }).click()
await desktop.getByText('Faculty AI voice assistant').waitFor()
await desktop.screenshot({ path: '/tmp/onestop-teacher-overview.png', fullPage: true })
await desktop.getByRole('button', { name: 'Classroom', exact: true }).click()
await desktop.getByRole('heading', { name: 'Assigned subjects and lectures' }).waitFor()
await desktop.screenshot({ path: '/tmp/onestop-teacher-classroom.png', fullPage: true })
await desktop.getByRole('button', { name: 'Connectors', exact: true }).click()
await desktop.getByRole('heading', { name: 'Fetch notes from configured platforms' }).waitFor()
await desktop.screenshot({ path: '/tmp/onestop-connectors.png', fullPage: true })

console.log('Checking super-admin workspace...')
await desktop.locator('.role-switcher').click()
await desktop.locator('.role-menu').getByRole('button', { name: 'Super admin' }).click()
await desktop.getByRole('heading', { name: /Welcome,/ }).waitFor()
await desktop.getByRole('button', { name: 'Users & subjects', exact: true }).click()
await desktop.getByRole('heading', { name: 'Create users' }).waitFor()
await desktop.screenshot({ path: '/tmp/onestop-super-admin.png', fullPage: true })
await assertNoHorizontalOverflow(desktop, 'admin management')

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
mobile.setDefaultTimeout(12_000)
mobile.setDefaultNavigationTimeout(30_000)
await trackErrors(mobile)
console.log('Checking mobile login and navigation...')
await mobile.goto(baseUrl, { waitUntil: 'networkidle' })
await mobile.getByRole('heading', { name: 'Every lecture becomes a learning companion.' }).waitFor()
await assertNoHorizontalOverflow(mobile, 'mobile login')
await mobile.screenshot({ path: '/tmp/onestop-login-mobile.png', fullPage: true })
await mobile.getByRole('button', { name: /Enter OneStop/ }).click()
await mobile.getByRole('heading', { name: /Welcome,/ }).waitFor()
await assertNoHorizontalOverflow(mobile, 'mobile student overview')
await mobile.getByRole('button', { name: 'Open navigation' }).click()
await mobile.locator('.sidebar.is-open').waitFor()
await mobile.screenshot({ path: '/tmp/onestop-mobile-navigation.png', fullPage: true })
await mobile.getByRole('button', { name: 'Classroom', exact: true }).click()
await mobile.getByRole('heading', { name: 'Your subjects' }).waitFor()
await assertNoHorizontalOverflow(mobile, 'mobile classroom')
await mobile.screenshot({ path: '/tmp/onestop-mobile-classroom.png', fullPage: true })

await browser.close()

assert.deepEqual(browserErrors, [], `Browser errors detected:\n${browserErrors.join('\n')}`)
console.log('UI smoke test passed: login, student, teacher, admin, search, and mobile navigation.')
