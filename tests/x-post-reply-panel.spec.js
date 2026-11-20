import { test, expect } from '@playwright/test'

// Covers picking a post from the X panel and drafting/submitting a reply to
// it (src/App.jsx). The Java backend isn't part of this repo, so the posts,
// ask, and video endpoints are stubbed here.
async function mockBackend(page) {
  await page.route('**/api/posts**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          posts: [
            { id: '1', text: 'Post uno sobre el modelo', createdAt: '2026-01-01T00:00:00Z' },
            { id: '2', text: 'Post dos sobre el modelo', createdAt: '2026-01-02T00:00:00Z' },
          ],
        }),
      }),
  )
  await page.route('**/api/ask**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'stub answer' }) }),
  )
  await page.route('**/api/video**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [] }) }),
  )
}

async function submitCarModel(page, model) {
  await page.goto('/')
  await page.fill('#question', model)
  await page.click('button[type="submit"]')
  await page.waitForSelector('.console__post')
}

test.describe('X post reply panel', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await submitCarModel(page, 'Nissan Skyline GTR')
  })

  test('selecting a post reveals a Reply box for it', async ({ page }) => {
    const posts = page.locator('.console__post')
    await posts.nth(0).click()

    await expect(posts.nth(0)).toHaveClass(/is-selected/)
    await expect(page.locator('label[for="post-comment"]')).toHaveText('REPLY')
    await expect(page.locator('#post-comment')).toBeVisible()
  })

  test('Reply button is disabled until a draft is typed, then submits with a confirmation', async ({ page }) => {
    await page.locator('.console__post').nth(0).click()
    const submitButton = page.locator('.console__post-comment-submit')

    await expect(submitButton).toBeDisabled()

    await page.fill('#post-comment', 'Great review!')
    await expect(submitButton).toBeEnabled()

    await submitButton.click()
    await expect(page.locator('.console__post-comment-status')).toHaveText('Respuesta enviada.')
  })

  test('editing the draft after submitting clears the confirmation', async ({ page }) => {
    await page.locator('.console__post').nth(0).click()
    await page.fill('#post-comment', 'Great review!')
    await page.click('.console__post-comment-submit')
    await expect(page.locator('.console__post-comment-status')).toBeVisible()

    await page.fill('#post-comment', 'Great review! edited')
    await expect(page.locator('.console__post-comment-status')).toHaveCount(0)
  })

  test('draft comments are kept separately per post when switching selection', async ({ page }) => {
    const posts = page.locator('.console__post')

    await posts.nth(0).click()
    await page.fill('#post-comment', 'Comentario para el post 1')

    await posts.nth(1).click()
    await expect(page.locator('#post-comment')).toHaveValue('')
    await page.fill('#post-comment', 'Comentario para el post 2')

    await posts.nth(0).click()
    await expect(page.locator('#post-comment')).toHaveValue('Comentario para el post 1')

    await posts.nth(1).click()
    await expect(page.locator('#post-comment')).toHaveValue('Comentario para el post 2')
  })
})
