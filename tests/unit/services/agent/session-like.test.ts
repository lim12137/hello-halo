import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdkMock = vi.hoisted(() => {
  type QueryArgs = { prompt: AsyncIterable<unknown>; options: Record<string, unknown> }

  const state: {
    lastArgs: QueryArgs | null
    receivedInputs: unknown[]
    withControls: boolean
    control: {
      interrupt?: ReturnType<typeof vi.fn>
      setModel?: ReturnType<typeof vi.fn>
      setMaxThinkingTokens?: ReturnType<typeof vi.fn>
      setPermissionMode?: ReturnType<typeof vi.fn>
    } | null
  } = {
    lastArgs: null,
    receivedInputs: [],
    withControls: true,
    control: null
  }

  const query = vi.fn((args: QueryArgs) => {
    state.lastArgs = args

    const iterator = (async function* () {
      for await (const input of args.prompt) {
        state.receivedInputs.push(input)
        yield { type: 'assistant', payload: input }
        yield { type: 'result' }
      }
    })() as AsyncGenerator<any, void> & {
      interrupt?: () => Promise<void>
      setModel?: (model?: string) => Promise<void>
      setMaxThinkingTokens?: (maxThinkingTokens: number | null) => Promise<void>
      setPermissionMode?: (mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan') => Promise<void>
    }

    if (state.withControls) {
      const control = {
        interrupt: vi.fn(async () => {}),
        setModel: vi.fn(async (_model?: string) => {}),
        setMaxThinkingTokens: vi.fn(async (_value: number | null) => {}),
        setPermissionMode: vi.fn(async (_mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan') => {})
      }
      iterator.interrupt = control.interrupt
      iterator.setModel = control.setModel
      iterator.setMaxThinkingTokens = control.setMaxThinkingTokens
      iterator.setPermissionMode = control.setPermissionMode
      state.control = control
    } else {
      state.control = {}
    }

    return iterator
  })

  return {
    query,
    unstable_v2_createSession: vi.fn(),
    state
  }
})

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: sdkMock.query,
  unstable_v2_createSession: sdkMock.unstable_v2_createSession
}))

import { createSessionLikeFromQueryOptions } from '../../../../src/main/services/agent/session-like'

async function collectMessages(stream: AsyncIterable<any>): Promise<any[]> {
  const messages: any[] = []
  for await (const message of stream) {
    messages.push(message)
  }
  return messages
}

describe('SessionLike query-backed mode', () => {
  beforeEach(() => {
    sdkMock.query.mockClear()
    sdkMock.state.lastArgs = null
    sdkMock.state.receivedInputs = []
    sdkMock.state.withControls = true
    sdkMock.state.control = null
  })

  it('sends input into query prompt and streams until result', async () => {
    const session = createSessionLikeFromQueryOptions({ cwd: 'D:/Agent/hello-halo' })
    session.send('hello')

    const messages = await collectMessages(session.stream())

    expect(sdkMock.query).toHaveBeenCalledTimes(1)
    expect(sdkMock.state.lastArgs?.options).toEqual({ cwd: 'D:/Agent/hello-halo' })
    expect(messages).toEqual([
      {
        type: 'assistant',
        payload: {
          type: 'user',
          message: {
            role: 'user',
            content: 'hello'
          }
        }
      },
      { type: 'result' }
    ])
    expect(sdkMock.state.receivedInputs).toHaveLength(1)
  })

  it('maps runtime controls to query methods and reports applied flags', async () => {
    const session = createSessionLikeFromQueryOptions({})
    const applied = await session.applyRuntimeOptions({
      model: 'claude-sonnet',
      maxThinkingTokens: 2048,
      permissionMode: 'plan'
    })
    const interruptResult = await session.interrupt()

    expect(applied).toEqual({
      modelApplied: true,
      maxThinkingTokensApplied: true,
      permissionModeApplied: true
    })
    expect(interruptResult).toBe(true)
    expect(sdkMock.state.control?.setModel).toHaveBeenCalledWith('claude-sonnet')
    expect(sdkMock.state.control?.setMaxThinkingTokens).toHaveBeenCalledWith(2048)
    expect(sdkMock.state.control?.setPermissionMode).toHaveBeenCalledWith('plan')
    expect(sdkMock.state.control?.interrupt).toHaveBeenCalledTimes(1)
  })

  it('gracefully handles query implementations without dynamic controls', async () => {
    sdkMock.state.withControls = false
    const session = createSessionLikeFromQueryOptions({})

    const applied = await session.applyRuntimeOptions({
      model: 'unused',
      maxThinkingTokens: 1,
      permissionMode: 'default'
    })
    const interruptResult = await session.interrupt()
    const capabilities = session.getCapabilities()

    expect(applied).toEqual({
      modelApplied: false,
      maxThinkingTokensApplied: false,
      permissionModeApplied: false
    })
    expect(interruptResult).toBe(false)
    expect(capabilities.hasSetModel).toBe(false)
    expect(capabilities.hasSetMaxThinkingTokens).toBe(false)
    expect(capabilities.hasSetPermissionMode).toBe(false)
  })

  it('rejects send after close', () => {
    const session = createSessionLikeFromQueryOptions({})
    session.close()

    expect(() => session.send('after-close')).toThrow('Query session is closed')
  })
})
