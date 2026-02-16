import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk'
import type { V2SDKSession } from './types'

type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

type TransportLike = {
  isReady?: () => boolean
  ready?: boolean
  onExit?: (cb: (error?: Error) => void) => (() => void) | void
  process?: {
    pid?: number
  }
}

type SessionInternals = {
  pid?: number
  query?: {
    transport?: TransportLike
  }
}

export interface SessionCapabilities {
  hasPatchedPid: boolean
  hasTransportReadyCheck: boolean
  hasTransportExitHook: boolean
  hasSetModel: boolean
  hasSetMaxThinkingTokens: boolean
  hasSetPermissionMode: boolean
}

export interface RuntimeSessionOptions {
  model?: string
  maxThinkingTokens?: number | null
  permissionMode?: PermissionMode
}

export interface RuntimeApplyResult {
  modelApplied: boolean
  maxThinkingTokensApplied: boolean
  permissionModeApplied: boolean
}

function getTransport(session: V2SDKSession): TransportLike | undefined {
  return (session as unknown as SessionInternals).query?.transport
}

export async function createV2SdkSession(options: Record<string, unknown>): Promise<V2SDKSession> {
  return (await unstable_v2_createSession(options as any)) as unknown as V2SDKSession
}

export function getSessionCapabilities(session: V2SDKSession): SessionCapabilities {
  const transport = getTransport(session)
  return {
    hasPatchedPid: typeof (session as unknown as SessionInternals).pid === 'number',
    hasTransportReadyCheck:
      typeof transport?.isReady === 'function' || typeof transport?.ready === 'boolean',
    hasTransportExitHook: typeof transport?.onExit === 'function',
    hasSetModel: typeof session.setModel === 'function',
    hasSetMaxThinkingTokens: typeof session.setMaxThinkingTokens === 'function',
    hasSetPermissionMode: typeof session.setPermissionMode === 'function'
  }
}

export function isSessionReady(session: V2SDKSession): boolean {
  try {
    const transport = getTransport(session)
    if (!transport) return false
    if (typeof transport.isReady === 'function') {
      return transport.isReady()
    }
    if (typeof transport.ready === 'boolean') {
      return transport.ready
    }
    return true
  } catch {
    return false
  }
}

export function getSessionPid(session: V2SDKSession): number | null {
  const internal = session as unknown as SessionInternals
  if (typeof internal.pid === 'number') {
    return internal.pid
  }
  const transportPid = internal.query?.transport?.process?.pid
  return typeof transportPid === 'number' ? transportPid : null
}

export function onSessionExit(
  session: V2SDKSession,
  cb: (error?: Error) => void
): (() => void) | null {
  try {
    const transport = getTransport(session)
    if (!transport || typeof transport.onExit !== 'function') {
      return null
    }
    const maybeUnsubscribe = transport.onExit((error?: Error) => cb(error))
    return typeof maybeUnsubscribe === 'function' ? maybeUnsubscribe : () => {}
  } catch {
    return null
  }
}

export async function applyRuntimeSessionOptions(
  session: V2SDKSession,
  options: RuntimeSessionOptions
): Promise<RuntimeApplyResult> {
  const result: RuntimeApplyResult = {
    modelApplied: false,
    maxThinkingTokensApplied: false,
    permissionModeApplied: false
  }

  if (options.model !== undefined && typeof session.setModel === 'function') {
    await session.setModel(options.model)
    result.modelApplied = true
  }

  if (
    options.maxThinkingTokens !== undefined &&
    typeof session.setMaxThinkingTokens === 'function'
  ) {
    await session.setMaxThinkingTokens(options.maxThinkingTokens)
    result.maxThinkingTokensApplied = true
  }

  if (options.permissionMode !== undefined && typeof session.setPermissionMode === 'function') {
    await session.setPermissionMode(options.permissionMode)
    result.permissionModeApplied = true
  }

  return result
}

export async function interruptSession(session: V2SDKSession): Promise<boolean> {
  if (typeof session.interrupt !== 'function') {
    return false
  }
  await session.interrupt()
  return true
}

export function closeSession(session: V2SDKSession): void {
  session.close()
}
