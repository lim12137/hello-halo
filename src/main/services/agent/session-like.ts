import type { V2SDKSession } from './types'
import { query } from '@anthropic-ai/claude-agent-sdk'
import {
  applyRuntimeSessionOptions,
  closeSession,
  getSessionCapabilities,
  interruptSession,
  type RuntimeApplyResult,
  type RuntimeSessionOptions,
  type SessionCapabilities
} from './sdk-adapter'

type QueryControlLike = AsyncGenerator<any, void> & {
  interrupt?: () => Promise<void>
  setModel?: (model?: string) => Promise<void>
  setMaxThinkingTokens?: (maxThinkingTokens: number | null) => Promise<void>
  setPermissionMode?: (mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan') => Promise<void>
}

class AsyncInputQueue<T> implements AsyncIterable<T> {
  private items: T[] = []
  private waiters: Array<(result: IteratorResult<T>) => void> = []
  private isClosed = false

  push(item: T): boolean {
    if (this.isClosed) return false
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter({ value: item, done: false })
      return true
    }
    this.items.push(item)
    return true
  }

  close(): void {
    if (this.isClosed) return
    this.isClosed = true
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()
      waiter?.({ value: undefined as never, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        const queued = this.items.shift()
        if (queued !== undefined) {
          return { value: queued, done: false }
        }
        if (this.isClosed) {
          return { value: undefined as never, done: true }
        }
        return await new Promise<IteratorResult<T>>((resolve) => {
          this.waiters.push(resolve)
        })
      }
    }
  }
}

function toSdkUserMessage(message: unknown): any {
  if (typeof message === 'string') {
    return {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: message
      }
    }
  }
  return message
}

function isResultMessage(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message as { type?: unknown }).type === 'result'
  )
}

export interface SessionLike {
  send: (message: unknown) => void
  stream: () => AsyncIterable<any>
  interrupt: () => Promise<boolean>
  close: () => void
  applyRuntimeOptions: (options: RuntimeSessionOptions) => Promise<RuntimeApplyResult>
  getCapabilities: () => SessionCapabilities
}

export function createSessionLikeFromV2(session: V2SDKSession): SessionLike {
  return {
    send: (message: unknown) => session.send(message as any),
    stream: () => session.stream(),
    interrupt: () => interruptSession(session),
    close: () => closeSession(session),
    applyRuntimeOptions: (options: RuntimeSessionOptions) =>
      applyRuntimeSessionOptions(session, options),
    getCapabilities: () => getSessionCapabilities(session)
  }
}

/**
 * Experimental V1 query()-backed SessionLike.
 *
 * Uses streaming input mode (AsyncIterable prompt) so runtime controls
 * (interrupt/setModel/setPermissionMode/setMaxThinkingTokens) remain available.
 */
export function createSessionLikeFromQueryOptions(options: Record<string, unknown>): SessionLike {
  const inputQueue = new AsyncInputQueue<any>()
  const queryStream = query({
    prompt: inputQueue,
    options: options as any
  }) as unknown as QueryControlLike
  const iterator = queryStream[Symbol.asyncIterator]()
  let closed = false
  let streamInProgress = false

  return {
    send: (message: unknown) => {
      if (closed) {
        throw new Error('Query session is closed')
      }
      if (!inputQueue.push(toSdkUserMessage(message))) {
        throw new Error('Failed to enqueue message into query session')
      }
    },
    stream: () => (async function* streamUntilResult() {
      if (streamInProgress) {
        throw new Error('Query session stream already in progress')
      }
      streamInProgress = true
      try {
        while (true) {
          const next = await iterator.next()
          if (next.done) return
          const message = next.value
          yield message
          if (isResultMessage(message)) return
        }
      } finally {
        streamInProgress = false
      }
    })(),
    interrupt: async () => {
      if (typeof queryStream.interrupt !== 'function') {
        return false
      }
      await queryStream.interrupt()
      return true
    },
    close: () => {
      if (closed) return
      closed = true
      inputQueue.close()
      void iterator.return?.()
    },
    applyRuntimeOptions: async (runtimeOptions: RuntimeSessionOptions) => {
      const result: RuntimeApplyResult = {
        modelApplied: false,
        maxThinkingTokensApplied: false,
        permissionModeApplied: false
      }

      if (runtimeOptions.model !== undefined && typeof queryStream.setModel === 'function') {
        await queryStream.setModel(runtimeOptions.model)
        result.modelApplied = true
      }

      if (
        runtimeOptions.maxThinkingTokens !== undefined &&
        typeof queryStream.setMaxThinkingTokens === 'function'
      ) {
        await queryStream.setMaxThinkingTokens(runtimeOptions.maxThinkingTokens)
        result.maxThinkingTokensApplied = true
      }

      if (
        runtimeOptions.permissionMode !== undefined &&
        typeof queryStream.setPermissionMode === 'function'
      ) {
        await queryStream.setPermissionMode(runtimeOptions.permissionMode)
        result.permissionModeApplied = true
      }

      return result
    },
    getCapabilities: () => ({
      hasPatchedPid: false,
      hasTransportReadyCheck: false,
      hasTransportExitHook: false,
      hasSetModel: typeof queryStream.setModel === 'function',
      hasSetMaxThinkingTokens: typeof queryStream.setMaxThinkingTokens === 'function',
      hasSetPermissionMode: typeof queryStream.setPermissionMode === 'function'
    })
  }
}
