/**
 * Express Router
 *
 * Defines API routes for the OpenAI compatibility layer
 */

import express, { type Express, type Request, type Response } from 'express'
import type { AnthropicRequest } from '../types'
import { decodeBackendConfig } from '../utils'
import { handleMessagesRequest, handleCountTokensRequest } from './request-handler'

export interface RouterOptions {
  debug?: boolean
  timeoutMs?: number
}

/**
 * Create and configure the Express application
 */
export function createApp(options: RouterOptions = {}): Express {
  const app = express()
  const { debug = false, timeoutMs } = options

  // Body parser with large limit for images
  app.use(express.json({ limit: '50mb' }))

  // [DIAG] Always log all incoming requests for debugging
  app.use((req, _res, next) => {
    console.log(`[Router:DIAG] Incoming: ${req.method} ${req.url}`)
    next()
  })

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // Main messages endpoint
  app.post('/v1/messages', async (req: Request, res: Response) => {
    // [DIAG] Route matched
    console.log('[Router:DIAG] /v1/messages route matched')

    const anthropicRequest = (req.body || {}) as AnthropicRequest

    // Extract API key from header
    const rawKey = req.headers['x-api-key']
    const rawKeyStr = Array.isArray(rawKey) ? rawKey[0] : rawKey

    if (!rawKeyStr) {
      console.log('[Router:DIAG] x-api-key missing, returning 401')
      return res.status(401).json({
        type: 'error',
        error: { type: 'authentication_error', message: 'x-api-key is required' }
      })
    }

    // Decode backend configuration from API key
    const decodedConfig = decodeBackendConfig(String(rawKeyStr))
    if (!decodedConfig) {
      console.log('[Router:DIAG] x-api-key decode failed, returning 400')
      return res.status(400).json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Invalid x-api-key format. Expect base64(JSON.stringify({ url, key, model?, apiType? }))'
        }
      })
    }

    console.log(`[Router:DIAG] Decoded config: url=${decodedConfig.url}, model=${decodedConfig.model}`)

    // Handle the request
    await handleMessagesRequest(anthropicRequest, decodedConfig, res, { debug, timeoutMs })
  })

  // Token counting endpoint
  app.post('/v1/messages/count_tokens', (req: Request, res: Response) => {
    const { messages, system } = (req.body || {}) as { messages?: unknown; system?: unknown }
    const result = handleCountTokensRequest(messages, system)
    res.json(result)
  })

  // [DIAG] Catch-all 404 handler - if request reaches here, route didn't match
  app.use((req, res) => {
    console.log(`[Router:DIAG] 404 - No route matched: ${req.method} ${req.url}`)
    res.status(404).json({
      type: 'error',
      error: { type: 'not_found', message: `Route not found: ${req.method} ${req.url}` }
    })
  })

  return app
}
