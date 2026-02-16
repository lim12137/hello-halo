/**
 * Agent Module - Generation Control
 *
 * Functions for controlling agent generation including:
 * - Stop/abort generation
 * - Check if generating
 * - Get active sessions
 * - Get session state for recovery
 */

import { activeSessions, v2Sessions } from './session-manager'
import type { Thought } from './types'
import { createSessionLikeFromV2 } from './session-like'

function getMessageType(message: unknown): string {
  const type = (message as { type?: unknown } | null)?.type
  return typeof type === 'string' ? type : 'unknown'
}

// ============================================
// Stop Generation
// ============================================

/**
 * Stop generation for a specific conversation or all conversations
 *
 * @param conversationId - Optional conversation ID. If not provided, stops all.
 */
export async function stopGeneration(conversationId?: string): Promise<void> {
  if (conversationId) {
    // Stop specific session
    const session = activeSessions.get(conversationId)
    if (session) {
      session.abortController.abort()
      activeSessions.delete(conversationId)

      // Interrupt runtime session and drain stale messages
      const runtimeSession =
        session.runtimeSession || (() => {
          const v2Session = v2Sessions.get(conversationId)
          return v2Session ? createSessionLikeFromV2(v2Session.session) : undefined
        })()

      if (runtimeSession) {
        try {
          const interrupted = await runtimeSession.interrupt()
          if (interrupted) {
            console.log(`[Agent] Session interrupted, draining stale messages...`)

            // Drain stale messages until we hit the result
            for await (const msg of runtimeSession.stream()) {
              const messageType = getMessageType(msg)
              console.log(`[Agent] Drained: ${messageType}`)
              if (messageType === 'result') break
            }
            console.log(`[Agent] Drain complete for: ${conversationId}`)
          } else {
            console.warn(`[Agent] Session interrupt not available: ${conversationId}`)
          }
        } catch (e) {
          console.error(`[Agent] Failed to interrupt/drain session:`, e)
        }
      }

      console.log(`[Agent] Stopped generation for conversation: ${conversationId}`)
    }
  } else {
    // Stop all sessions (backward compatibility)
    for (const [convId, session] of Array.from(activeSessions)) {
      session.abortController.abort()

      // Interrupt runtime session
      const runtimeSession =
        session.runtimeSession || (() => {
          const v2Session = v2Sessions.get(convId)
          return v2Session ? createSessionLikeFromV2(v2Session.session) : undefined
        })()
      if (runtimeSession) {
        try {
          const interrupted = await runtimeSession.interrupt()
          if (!interrupted) {
            console.warn(`[Agent] Session interrupt not available: ${convId}`)
          }
        } catch (e) {
          console.error(`[Agent] Failed to interrupt session ${convId}:`, e)
        }
      }

      console.log(`[Agent] Stopped generation for conversation: ${convId}`)
    }
    activeSessions.clear()
    console.log('[Agent] All generations stopped')
  }
}

// ============================================
// Generation Status
// ============================================

/**
 * Check if a conversation has an active generation
 */
export function isGenerating(conversationId: string): boolean {
  return activeSessions.has(conversationId)
}

/**
 * Get all active session conversation IDs
 */
export function getActiveSessions(): string[] {
  return Array.from(activeSessions.keys())
}

// ============================================
// Session State Recovery
// ============================================

/**
 * Get current session state for a conversation (for recovery after refresh)
 *
 * This is used by remote clients to recover the current state when they
 * reconnect or refresh the page during an active generation.
 */
export function getSessionState(conversationId: string): {
  isActive: boolean
  thoughts: Thought[]
  spaceId?: string
} {
  const session = activeSessions.get(conversationId)
  if (!session) {
    return { isActive: false, thoughts: [] }
  }
  return {
    isActive: true,
    thoughts: [...session.thoughts],
    spaceId: session.spaceId
  }
}
