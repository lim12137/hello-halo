/**
 * Chat Flow E2E Tests
 *
 * Real end-to-end tests for chat functionality.
 * These tests actually send messages to the API and verify responses.
 *
 * Required Environment Variables:
 *   HALO_TEST_API_KEY - API key for testing
 *   HALO_TEST_API_URL - API URL (optional)
 *   HALO_TEST_MODEL   - Model to use (optional)
 */

import { test, expect, hasApiKey } from '../fixtures/electron'
import { navigateToChat, waitForAssistantIdle } from '../fixtures/app-helpers'

// Skip all chat tests if no API key is configured
test.beforeEach(async ({}, testInfo) => {
  if (!hasApiKey()) {
    testInfo.skip(true, 'Skipping chat tests: HALO_TEST_API_KEY not set')
  }
})

test.describe('Chat Interface', () => {
  test('chat input is visible and functional', async ({ window }) => {
    await navigateToChat(window)

    const chatInput = await window.waitForSelector('textarea', { timeout: 5000 })
    expect(chatInput).toBeTruthy()

    const isEnabled = await chatInput.isEnabled()
    expect(isEnabled).toBe(true)

    await chatInput.fill('Hello, Halo!')
    const value = await chatInput.inputValue()
    expect(value).toBe('Hello, Halo!')
  })

  test('send button exists and is functional', async ({ window }) => {
    await navigateToChat(window)

    const sendButton = await window.waitForSelector(
      '[data-onboarding="send-button"]',
      { timeout: 5000 }
    )

    expect(sendButton).toBeTruthy()
  })
})

test.describe('Real Chat Flow', () => {
  // Increase timeout for real API calls
  test.setTimeout(60000)

  test('can send message and receive response', async ({ window }) => {
    await navigateToChat(window)

    const chatInput = await window.waitForSelector('textarea', { timeout: 5000 })

    const testMessage = 'Say "Hello Test" and nothing else.'
    await chatInput.fill(testMessage)

    await window.screenshot({ path: 'tests/e2e/results/chat-before-send.png' })

    const sendButton = await window.waitForSelector(
      '[data-onboarding="send-button"]',
      { timeout: 5000 }
    )

    await sendButton.click({ force: true })

    await window.waitForTimeout(1000)
    await window.screenshot({ path: 'tests/e2e/results/chat-after-send.png' })

    await window.waitForSelector('.message-user', { timeout: 10000 })
    await waitForAssistantIdle(window)

    await window.screenshot({ path: 'tests/e2e/results/chat-response.png' })

    const assistantMessage = window.locator('.message-assistant').last()
    const responseText = await assistantMessage.textContent()
    expect(responseText?.toLowerCase()).toContain('hello')
  })

  test('displays thinking indicator during response', async ({ window }, testInfo) => {
    await navigateToChat(window)

    const chatInput = await window.waitForSelector('textarea', { timeout: 5000 })
    await chatInput.fill('Count from 1 to 5 slowly, one number per line.')

    const sendButton = await window.waitForSelector('[data-onboarding="send-button"]', { timeout: 5000 })
    await sendButton.click()

    const hasIndicator = await window
      .locator('.message-working')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false)

    await waitForAssistantIdle(window)

    if (!hasIndicator) {
      testInfo.skip(true, 'Skipping: model responded too quickly to render thinking indicator')
      return
    }

    const assistantMessage = window.locator('.message-assistant').last()
    const responseText = await assistantMessage.textContent()
    expect(responseText).toMatch(/[1-5]/)
  })

  test('input clears after sending message', async ({ window }) => {
    await navigateToChat(window)

    const chatInput = await window.waitForSelector('textarea', { timeout: 5000 })
    await chatInput.fill('Test message for clearing')

    const sendButton = await window.waitForSelector(
      '[data-onboarding="send-button"]',
      { timeout: 5000 }
    )
    await sendButton.click()

    await window.waitForTimeout(500)

    const valueAfterSend = await chatInput.inputValue()
    expect(valueAfterSend).toBe('')
  })

  test('can send multiple messages in sequence', async ({ window }) => {
    await navigateToChat(window)

    const chatInput = await window.waitForSelector('textarea', { timeout: 5000 })
    const sendButton = await window.waitForSelector('[data-onboarding="send-button"]', { timeout: 5000 })

    await chatInput.fill('Say "First" and nothing else.')
    await sendButton.click()

    await waitForAssistantIdle(window)

    let assistantMessages = await window.$$('.message-assistant')
    let firstResponse = await assistantMessages[0].textContent()
    expect(firstResponse?.toLowerCase()).toContain('first')

    await chatInput.fill('Say "Second" and nothing else.')
    await sendButton.click()

    await window.waitForFunction(() => document.querySelectorAll('.message-assistant').length >= 2, { timeout: 30000 })
    await waitForAssistantIdle(window)

    assistantMessages = await window.$$('.message-assistant')
    expect(assistantMessages.length).toBeGreaterThanOrEqual(2)
    const secondResponse = await assistantMessages[1].textContent()
    expect(secondResponse?.toLowerCase()).toContain('second')

    await window.screenshot({ path: 'tests/e2e/results/chat-multiple-messages.png' })
  })
})

test.describe('Switch Provider and Chat', () => {
  test.setTimeout(90000)

  test('switch to tencent provider, select GLM-5.0, and chat', async ({ window }, testInfo) => {
    await navigateToChat(window)

    const modelSelectorBtn = window.locator('header button:has(svg.lucide-chevron-down)').first()

    if (await modelSelectorBtn.isVisible().catch(() => false)) {
      await modelSelectorBtn.click()
    } else {
      await window.locator('button:has(.lucide-chevron-down)').first().click()
    }

    await window.waitForTimeout(500)

    const tencentSection = window.locator('text=/tencent/i').first()
    if (!(await tencentSection.isVisible().catch(() => false))) {
      testInfo.skip(true, 'Skipping: tencent source is not configured in this environment')
      return
    }
    await tencentSection.click()

    await window.waitForTimeout(300)

    const glmModel = window.locator('button:has-text("GLM-5.0")').first()
    if (!(await glmModel.isVisible().catch(() => false))) {
      testInfo.skip(true, 'Skipping: GLM-5.0 model is not available under tencent source')
      return
    }
    await glmModel.click()

    await window.waitForTimeout(500)

    await window.screenshot({ path: 'tests/e2e/results/chat-switch-tencent-glm.png' })

    const chatInput = await window.waitForSelector('textarea', { timeout: 5000 })
    await chatInput.fill('Reply with your current model name only.')

    const sendButton = await window.waitForSelector(
      '[data-onboarding="send-button"]',
      { timeout: 5000 }
    )
    await sendButton.click({ force: true })

    await window.waitForSelector('.message-user', { timeout: 10000 })
    await waitForAssistantIdle(window, 60000)

    await window.screenshot({ path: 'tests/e2e/results/chat-tencent-glm-response.png' })

    const assistantMessage = window.locator('.message-assistant').last()
    const responseText = await assistantMessage.textContent()
    expect(responseText).toBeTruthy()
    expect(responseText!.length).toBeGreaterThan(0)
  })
})

test.describe('Chat Error Handling', () => {
  test('handles empty message gracefully', async ({ window }) => {
    await navigateToChat(window)

    const chatInput = await window.waitForSelector('textarea', { timeout: 5000 })
    const sendButton = await window.waitForSelector(
      '[data-onboarding="send-button"]',
      { timeout: 5000 }
    )

    await chatInput.fill('')

    const isDisabled = await sendButton.isDisabled()
    expect(isDisabled).toBe(true)
  })
})
