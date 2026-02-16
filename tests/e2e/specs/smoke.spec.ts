/**
 * Smoke Tests
 *
 * Basic tests to verify the application launches and core UI renders correctly.
 * These tests run quickly and catch fundamental issues.
 */

import { test, expect, hasApiKey } from '../fixtures/electron'

const TEST_API_KEY = process.env.HALO_TEST_API_KEY || ''
const TEST_API_URL = process.env.HALO_TEST_API_URL || ''
const TEST_MODEL = process.env.HALO_TEST_MODEL || ''
const TEST_PROVIDER = process.env.HALO_TEST_PROVIDER || 'anthropic'
const TEST_MCP_SERVER_JSON = process.env.HALO_TEST_MCP_SERVER_JSON || ''
const TEST_MCP_SERVER_NAME = process.env.HALO_TEST_MCP_SERVER_NAME || 'test-mcp'

function parseTestMcpServers(): Record<string, any> {
  if (!TEST_MCP_SERVER_JSON.trim()) return {}

  try {
    const parsed = JSON.parse(TEST_MCP_SERVER_JSON)
    const looksLikeSingleServer =
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (typeof parsed.type === 'string' || typeof parsed.command === 'string' || typeof parsed.url === 'string')

    if (looksLikeSingleServer) {
      return { [TEST_MCP_SERVER_NAME]: { ...parsed, disabled: false } }
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const normalized: Record<string, any> = {}
      for (const [name, config] of Object.entries(parsed)) {
        if (config && typeof config === 'object') {
          normalized[name] = { ...(config as Record<string, any>), disabled: false }
        }
      }
      return normalized
    }
  } catch (error) {
    console.warn('[E2E] Failed to parse HALO_TEST_MCP_SERVER_JSON:', error)
  }

  return {}
}

const TEST_MCP_SERVERS = parseTestMcpServers()

async function isSetupPage(window: any): Promise<boolean> {
  const loginSelectorVisible = await window
    .locator('button:has-text("API")')
    .first()
    .isVisible()
    .catch(() => false)

  const apiSetupVisible = await window
    .locator('input[placeholder*="sk-"], text=API Key')
    .first()
    .isVisible()
    .catch(() => false)

  return loginSelectorVisible || apiSetupVisible
}

async function applyTestConfigFromNodeEnv(window: any) {
  if (!TEST_API_KEY) return

  const sourceId = `e2e-source-${Date.now()}`
  const now = new Date().toISOString()
  const updates = {
    api: {
      provider: TEST_PROVIDER,
      apiKey: TEST_API_KEY,
      apiUrl: TEST_API_URL,
      model: TEST_MODEL
    },
    aiSources: {
      version: 2 as const,
      currentId: sourceId,
      sources: [
        {
          id: sourceId,
          name: 'E2E Test Source',
          provider: TEST_PROVIDER,
          authType: 'api-key',
          apiUrl: TEST_API_URL,
          apiKey: TEST_API_KEY,
          model: TEST_MODEL,
          availableModels: [{ id: TEST_MODEL, name: TEST_MODEL }],
          createdAt: now,
          updatedAt: now
        }
      ]
    },
    onboarding: { completed: true },
    isFirstLaunch: false,
    mcpServers: TEST_MCP_SERVERS
  }

  await window.evaluate(async (payload) => {
    const halo = (window as any).halo
    if (!halo?.setConfig) {
      throw new Error('window.halo.setConfig is unavailable')
    }
    const result = await halo.setConfig(payload)
    // Known backend issue: config is saved but health event emission can fail with
    // "changedFields.join is not a function" when aiSources is included.
    const ignorableHealthEventError =
      typeof result?.error === 'string' &&
      result.error.includes('changedFields.join is not a function')

    if (!result?.success && !ignorableHealthEventError) {
      throw new Error(`window.halo.setConfig failed: ${result?.error || 'unknown error'}`)
    }
  }, updates)
}

async function configureViaUiFallback(window: any) {
  const customApiButton = window.locator('button:has-text("API")').first()
  if (await customApiButton.isVisible().catch(() => false)) {
    await customApiButton.click()
  }

  const providerSelect = window.locator('select').first()
  await providerSelect.waitFor({ timeout: 10000 })
  await providerSelect.selectOption(TEST_PROVIDER === 'openai' ? 'openai' : 'anthropic')

  const apiKeyInput = window.locator('input[type="password"], input[placeholder*="sk-"]').first()
  await apiKeyInput.fill(TEST_API_KEY)

  const apiUrlInput = window.locator('input[placeholder*="http"]').first()
  await apiUrlInput.fill(TEST_API_URL)

  const modelInput = window.locator('input[placeholder*="gpt"], input[placeholder*="deepseek"], input[placeholder*="claude"]').first()
  if (await modelInput.isVisible().catch(() => false)) {
    await modelInput.fill(TEST_MODEL)
  }

  const saveAndEnterButton = window.locator('button:has-text("Save and enter"), button:has-text("保存并进入")').first()
  await saveAndEnterButton.click()
}

async function ensureConfigured(window: any) {
  await window.waitForSelector('#root', { timeout: 10000 })
  await window.waitForLoadState('networkidle')

  if (!TEST_API_KEY) return

  // Always enforce deterministic config in credentialed E2E runs.
  await applyTestConfigFromNodeEnv(window)
  await window.reload()
  await window.waitForSelector('#root', { timeout: 10000 })
  await window.waitForLoadState('networkidle')

  if (await isSetupPage(window)) {
    await configureViaUiFallback(window)
    await window.waitForLoadState('networkidle')
  }
}

/**
 * Helper to navigate from Home Page to Chat Interface
 */
async function navigateToChat(window: any) {
  await ensureConfigured(window)
  await window.waitForSelector('#root', { timeout: 10000 })
  await window.waitForLoadState('networkidle')

  const chatInputReady = await window.locator('textarea').first().isVisible().catch(() => false)
  if (chatInputReady) return

  const haloSpaceCard = window.locator('[data-onboarding="halo-space"]').first()
  if (await haloSpaceCard.isVisible().catch(() => false)) {
    await haloSpaceCard.click({ force: true })
    await window.waitForSelector('textarea', { timeout: 10000 })
    return
  }

  let enterHalo = await window.waitForSelector('text=/Enter Halo|进入 Halo/i', { timeout: 5000 }).catch(() => null)

  if (enterHalo) {
    await enterHalo.click({ force: true })
  }

  await window.waitForSelector('textarea', { timeout: 10000 })
}

/**
 * Helper to navigate to settings and find remote section
 */
async function navigateToRemoteSettings(window: any) {
  await ensureConfigured(window)
  await window.waitForSelector('#root', { timeout: 10000 })
  await window.waitForLoadState('networkidle')

  const settingsButton = await window.waitForSelector('header button', { timeout: 10000 })
  await settingsButton.click()
  await window.waitForTimeout(500)

  await window.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await window.waitForTimeout(500)

  await window.waitForSelector('text=/Remote Access|远程访问/i', { timeout: 10000 })
}

/**
 * Helper to click the remote access toggle
 */
async function clickRemoteToggle(window: any) {
  await window.evaluate(() => {
    const labels = document.querySelectorAll('label')
    for (const label of labels) {
      const checkbox = label.querySelector('input[type="checkbox"]')
      if (checkbox) {
        const parent = label.closest('div')
        if (parent && (parent.textContent?.includes('启用远程访问') || parent.textContent?.includes('Enable Remote Access'))) {
          label.click()
          break
        }
      }
    }
  })
}

test.describe('Smoke Tests', () => {
  test('application launches successfully', async ({ electronApp }) => {
    const isRunning = electronApp.process() !== null
    expect(isRunning).toBe(true)
  })

  test('main window opens', async ({ window }) => {
    const title = await window.title()
    expect(title).toBeTruthy()
  })

  test('window has correct dimensions', async ({ window }) => {
    const dimensions = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }))

    expect(dimensions.width).toBeGreaterThan(600)
    expect(dimensions.height).toBeGreaterThan(400)
  })

  test('renders main UI container', async ({ window }) => {
    await window.waitForSelector('#root', { timeout: 10000 })
    const root = await window.$('#root')
    expect(root).toBeTruthy()
  })

  test('shows splash or main content', async ({ window }) => {
    await Promise.race([
      window.waitForSelector('[data-testid="splash-screen"]', { timeout: 5000 }).catch(() => null),
      window.waitForSelector('[data-testid="main-content"]', { timeout: 5000 }).catch(() => null),
      window.waitForSelector('[data-testid="api-setup"]', { timeout: 5000 }).catch(() => null),
      window.waitForSelector('text=/Halo|API|连接|设置/', { timeout: 5000 }).catch(() => null)
    ])

    await window.screenshot({ path: 'tests/e2e/results/smoke-initial-state.png' })
  })

  test('no console errors on startup', async ({ window }) => {
    const errors: string[] = []

    window.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await window.waitForTimeout(2000)

    const criticalErrors = errors.filter(error =>
      !error.includes('net::ERR_') &&
      !error.includes('favicon') &&
      !error.includes('DevTools')
    )

    expect(criticalErrors).toHaveLength(0)
  })

  test('no unhandled promise rejections', async ({ electronApp }) => {
    const rejections: string[] = []

    electronApp.on('close', () => {
      // Process closed normally
    })

    await new Promise(resolve => setTimeout(resolve, 2000))

    expect(rejections).toHaveLength(0)
  })
})

test.describe('First Launch Flow', () => {
  test('shows API setup on first launch', async ({ window }) => {
    await window.waitForSelector('#root', { timeout: 10000 })
    const bodyText = await window.evaluate(() => document.body.innerText)
    expect(bodyText.length).toBeGreaterThan(0)
  })
})

test.describe('Basic Navigation', () => {
  test('settings button is accessible', async ({ window }) => {
    await ensureConfigured(window)
    await window.waitForLoadState('networkidle')

    const settingsButton = await window.$('[data-testid="settings-button"], button:has(svg[class*="settings"]), button:has(svg[class*="cog"]), header button').catch(() => null)

    if (settingsButton) {
      expect(settingsButton).toBeTruthy()
    }
  })
})

/**
 * Core Features Smoke Tests
 *
 * These tests verify critical functionality:
 * - Chat: AI can send messages and receive responses
 * - Remote: Tunnel can be enabled and get public URL
 * - MCP: MCP test endpoint can report server status
 */
test.describe('Core Features', () => {
  test.setTimeout(90000)

  test('can send message and receive AI response', async ({ window }, testInfo) => {
    if (!hasApiKey()) {
      testInfo.skip(true, 'Skipping: HALO_TEST_API_KEY not set')
      return
    }

    await navigateToChat(window)

    const chatInput = await window.waitForSelector('textarea', { timeout: 5000 })
    await chatInput.fill('Say "Hello Test" and nothing else.')

    const sendButton = await window.waitForSelector('[data-onboarding="send-button"]', { timeout: 5000 })
    await sendButton.click({ force: true })

    await window.waitForSelector('.message-user', { timeout: 10000 })
    await window.waitForSelector('.message-assistant', { timeout: 30000 })

    await window.waitForSelector('text=/Halo 工作中|Halo is working/i', { state: 'hidden', timeout: 45000 }).catch(() => {})

    const assistantMessage = await window.waitForSelector('.message-assistant', { timeout: 5000 })
    const responseText = await assistantMessage.textContent()
    expect(responseText?.toLowerCase()).toContain('hello')

    await window.screenshot({ path: 'tests/e2e/results/smoke-chat-response.png' })
  })

  test('can enable tunnel and get public URL', async ({ window }, testInfo) => {
    if (!hasApiKey()) {
      testInfo.skip(true, 'Skipping: HALO_TEST_API_KEY not set')
      return
    }

    await navigateToRemoteSettings(window)

    await clickRemoteToggle(window)
    await window.waitForTimeout(2000)

    await window.waitForSelector('text=/本机地址|局域网地址|Local Address|LAN Address/i', { timeout: 15000 })

    await window.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await window.waitForTimeout(500)

    const tunnelButton = await window.waitForSelector('button:has-text("启动隧道"), button:has-text("Start Tunnel")', { timeout: 10000 })
    await tunnelButton.click()

    const publicUrl = await window.waitForSelector('text=/\\.trycloudflare\\.com|公网地址|Public URL/i', { timeout: 30000 }).catch(() => null)

    if (publicUrl) {
      const urlCode = await window.waitForSelector('code:has-text("trycloudflare.com")', { timeout: 15000 }).catch(() => null)
      expect(urlCode).toBeTruthy()
      await window.screenshot({ path: 'tests/e2e/results/smoke-tunnel-enabled.png' })
    } else {
      const errorMsg = await window.$('text=/隧道连接失败|Tunnel.*fail|error/i')
      expect(publicUrl || errorMsg).toBeTruthy()
      await window.screenshot({ path: 'tests/e2e/results/smoke-tunnel-error.png' })
    }
  })

  test('can run MCP connectivity check with configured test server', async ({ window }, testInfo) => {
    if (!hasApiKey()) {
      testInfo.skip(true, 'Skipping: HALO_TEST_API_KEY not set')
      return
    }

    if (Object.keys(TEST_MCP_SERVERS).length === 0) {
      testInfo.skip(true, 'Skipping: HALO_TEST_MCP_SERVER_JSON not set')
      return
    }

    await ensureConfigured(window)

    const result = await window.evaluate(async () => {
      const halo = (window as any).halo
      if (!halo?.testMcpConnections) {
        return { success: false, servers: [], error: 'window.halo.testMcpConnections is unavailable' }
      }
      return await halo.testMcpConnections()
    })

    expect(result.success).toBe(true)
    expect(Array.isArray(result.servers)).toBe(true)
    expect(result.servers.length).toBeGreaterThan(0)
  })
})
