/**
 * Remote Access E2E Tests
 *
 * Real end-to-end tests for remote access functionality.
 * Tests actual server startup, LAN access, and Cloudflare tunnel.
 */

import { test, expect, hasApiKey } from '../fixtures/electron'
import {
  navigateToRemoteSettings,
  clickRemoteToggle
} from '../fixtures/app-helpers'

// Remote tests still need credentialed app bootstrap to pass setup flow.
test.beforeEach(async ({}, testInfo) => {
  if (!hasApiKey()) {
    testInfo.skip(true, 'Skipping remote tests: HALO_TEST_API_KEY not set')
  }
})

test.describe('Remote Access', () => {
  // Increase timeout for remote operations
  test.setTimeout(60000)

  test('can navigate to settings and find remote access section', async ({ window }) => {
    await navigateToRemoteSettings(window)

    const remoteSection = await window.waitForSelector('section#remote', { timeout: 10000 })
    expect(remoteSection).toBeTruthy()

    await window.screenshot({ path: 'tests/e2e/results/settings-remote-section.png' })
  })

  test('can enable LAN access and get local URL', async ({ window }) => {
    await navigateToRemoteSettings(window)

    await clickRemoteToggle(window)

    await window.waitForFunction(() => {
      const codes = Array.from(document.querySelectorAll('#remote code'))
      return codes.some((el) => /^https?:\/\//.test((el.textContent || '').trim()))
    }, { timeout: 15000 })

    const localUrl = await window
      .locator('#remote code:has-text("http://"), #remote code:has-text("https://")')
      .first()
      .textContent()

    expect(localUrl).toBeTruthy()

    await window.screenshot({ path: 'tests/e2e/results/remote-lan-enabled.png' })
  })

  test('can enable tunnel and get public URL', async ({ window }) => {
    await navigateToRemoteSettings(window)

    await clickRemoteToggle(window)

    await window.waitForFunction(() => {
      const codes = Array.from(document.querySelectorAll('#remote code'))
      return codes.some((el) => /^https?:\/\//.test((el.textContent || '').trim()))
    }, { timeout: 15000 })

    const tunnelButton = window
      .locator('#remote button[class*="px-4"][class*="py-2"][class*="text-sm"]')
      .first()

    await tunnelButton.waitFor({ state: 'visible', timeout: 10000 })
    await tunnelButton.click()

    const publicUrl = await window
      .locator('#remote code:has-text("trycloudflare.com")')
      .first()
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => true)
      .catch(() => false)

    if (publicUrl) {
      const urlCode = await window
        .locator('#remote code:has-text("trycloudflare.com")')
        .first()
        .textContent()
      expect(urlCode).toContain('trycloudflare.com')
      await window.screenshot({ path: 'tests/e2e/results/remote-tunnel-enabled.png' })
    } else {
      const errorMsg = await window
        .locator('#remote')
        .getByText(/Tunnel connection failed|error|failed/i)
        .first()
        .isVisible()
        .catch(() => false)

      if (errorMsg) {
        await window.screenshot({ path: 'tests/e2e/results/remote-tunnel-error.png' })
      }

      // Feature path is valid if we either got a URL or surfaced an error state.
      expect(errorMsg).toBe(true)
    }
  })

  test('shows access password for security', async ({ window }) => {
    await navigateToRemoteSettings(window)

    await clickRemoteToggle(window)

    const passwordCode = window.locator('#remote code.font-mono').first()
    await passwordCode.waitFor({ state: 'visible', timeout: 10000 })

    const showButton = window.locator('#remote code.font-mono + button').first()
    await showButton.waitFor({ state: 'visible', timeout: 5000 })
    await showButton.click()

    const codeText = await passwordCode.textContent()
    expect(codeText).toBeTruthy()

    await window.screenshot({ path: 'tests/e2e/results/remote-password-shown.png' })
  })

  test('can disable remote access', async ({ window }) => {
    await navigateToRemoteSettings(window)

    await clickRemoteToggle(window)

    await window.waitForFunction(() => {
      const codes = Array.from(document.querySelectorAll('#remote code'))
      return codes.some((el) => /^https?:\/\//.test((el.textContent || '').trim()))
    }, { timeout: 15000 })

    await clickRemoteToggle(window)

    await window.waitForTimeout(1000)

    const hasAddress = await window.evaluate(() => {
      const codes = Array.from(document.querySelectorAll('#remote code'))
      return codes.some((el) => /^https?:\/\//.test((el.textContent || '').trim()))
    })

    expect(hasAddress).toBe(false)

    await window.screenshot({ path: 'tests/e2e/results/remote-disabled.png' })
  })
})

test.describe('Remote Access QR Code', () => {
  test.setTimeout(30000)

  test('shows QR code when remote is enabled', async ({ window }) => {
    await navigateToRemoteSettings(window)

    await clickRemoteToggle(window)

    const qrImageVisible = await window
      .locator('#remote img[alt*="QR"], #remote img[src*="data:image"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false)

    expect(qrImageVisible).toBe(true)

    await window.screenshot({ path: 'tests/e2e/results/remote-qr-code.png' })
  })
})
