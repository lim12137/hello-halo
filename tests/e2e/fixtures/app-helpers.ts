import type { Page } from '@playwright/test'

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

async function isSetupPage(window: Page): Promise<boolean> {
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

async function applyTestConfigFromNodeEnv(window: Page) {
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

async function configureViaUiFallback(window: Page) {
  if (!TEST_API_KEY) return

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

  const modelInput = window.locator('input[placeholder*="gpt"], input[placeholder*="deepseek"], input[placeholder*="claude"], input[placeholder*="qwen"]').first()
  if (await modelInput.isVisible().catch(() => false)) {
    await modelInput.fill(TEST_MODEL)
  }

  const saveAndEnterButton = window.locator('button').filter({ hasText: /Save and enter|保存并进入/i }).first()
  if (await saveAndEnterButton.isVisible().catch(() => false)) {
    await saveAndEnterButton.click()
  } else {
    await window.locator('button.bg-primary').last().click()
  }
}

export async function ensureConfigured(window: Page) {
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

export async function navigateToChat(window: Page) {
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

  const enterHalo = window.locator('text=/Enter Halo/i').first()
  if (await enterHalo.isVisible().catch(() => false)) {
    await enterHalo.click({ force: true })
  }

  await window.waitForSelector('textarea', { timeout: 15000 })
}

export async function navigateToRemoteSettings(window: Page) {
  await ensureConfigured(window)
  await window.waitForSelector('#root', { timeout: 10000 })
  await window.waitForLoadState('networkidle')

  const remoteSection = window.locator('section#remote').first()
  const alreadyInSettings = await remoteSection.isVisible().catch(() => false)
  if (!alreadyInSettings) {
    const explicitSettingsButton = window.locator('[data-testid="settings-button"]').first()
    if (await explicitSettingsButton.isVisible().catch(() => false)) {
      await explicitSettingsButton.click({ force: true })
    } else {
      const headerButtons = window.locator('header button')
      const count = await headerButtons.count()
      if (count === 0) {
        throw new Error('No header button found to enter settings')
      }
      await headerButtons.nth(count - 1).click({ force: true })
    }
  }

  await window.waitForSelector('section#remote', { timeout: 10000 })
  await window.locator('section#remote').first().scrollIntoViewIfNeeded()
}

export async function clickRemoteToggle(window: Page) {
  const toggleLabel = window.locator('#remote label:has(input[type="checkbox"])').first()
  await toggleLabel.waitFor({ state: 'visible', timeout: 10000 })
  await toggleLabel.click({ force: true })
}

export async function waitForAssistantIdle(window: Page, timeout = 45000) {
  await window.waitForSelector('.message-assistant', { timeout })
  await window.locator('.message-working').first().waitFor({ state: 'hidden', timeout }).catch(() => {
    // Working indicator may disappear before we start waiting.
  })
}
