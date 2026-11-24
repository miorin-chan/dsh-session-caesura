import type { Context } from '@deepseek-ai/cordis'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ComposerAttachment, ConversationController, DraftInput, DraftSnapshot, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
// DSH 0.2.2-rc.5, @deepseek-ai/dsh-client-ui-conversation. Reuse the native
// reference codecs and quote formatting for the note card's explicit Send.
import { serializeDraftPrompt } from '@deepseek-ai/dsh-client-ui-conversation/src/client/input/prompt.ts'
import { emptyComposer, type ClosingNote } from '../lib/notes.js'

type SessionId = SessionSnapshot['sessionId']

// The 0.2.2-rc.5 slot props expose the clipboard projection and runtime ids.
// Read and restore the semantic document through the same SessionInputShell
// used by native workspace transfer. No editor, upload, or submission override.
interface SemanticInput extends SessionInput {
  readonly draftSnapshot: DraftSnapshot
  setDraft(draft: DraftInput): void
}

export function resolveComposer(ctx: Context, sessionId: SessionId) {
  const binding = ctx.sessions.binding(sessionId)
  if (binding === undefined) return undefined
  const conversation = ctx.conversation as ConversationController
  const input = conversation.input.for(binding.ctx)
  if (!('draftSnapshot' in input)) return undefined
  return { binding, conversation, input: input as SemanticInput }
}

type Composer = NonNullable<ReturnType<typeof resolveComposer>>

export function composerOpen(ctx: Context, { binding, conversation }: Composer): boolean {
  const { sessionId, session } = binding
  const state = session.getSnapshot()
  return ctx.sessions.binding(sessionId) === binding && state.openState === 'open' && !state.removed
    && state.subagent === null && conversation.blocks.storeFor(sessionId).getSnapshot() === undefined
}

export function withNoteLock<T>(sessionId: string, change: () => T): Promise<T> {
  return navigator.locks === undefined ? Promise.resolve().then(change) : navigator.locks.request(`dsh.closing-note.${sessionId}`, change)
}

export function restoreDraft(composer: Composer, note: ClosingNote, files: readonly File[]): boolean {
  const { binding, conversation, input } = composer
  if (!emptyComposer(input.state.getSnapshot())) return false
  const attachments = files.length === 0 ? [] : conversation.createDrafts(binding.sessionId, files, true)
  let restored = false
  try {
    if (!input.addAttachments(attachments.map(attachment => attachment.id))) return false
    input.setDraft(note)
    restored = true
    return true
  } finally {
    if (!restored) {
      for (const attachment of attachments) input.removeAttachment(attachment.id)
      conversation.releaseDraftAttachments(attachments)
    }
  }
}

interface ReferenceSerializers {
  sessionOf(scope: Context): {
    serializeReference(source: string, ref: string, signal: AbortSignal): Promise<string>
  } | undefined
}

export async function sendNote(ctx: Context, composer: Composer, note: ClosingNote, files: readonly File[], signal: AbortSignal): Promise<void> {
  const { binding, conversation } = composer
  const triggers = ctx.get('inputTriggers') as ReferenceSerializers | undefined
  const serializers = triggers?.sessionOf(binding.ctx)
  const text = await serializeDraftPrompt(note, (source, ref) => {
    if (serializers === undefined) throw new Error('Closing note reference serializer is unavailable')
    return serializers.serializeReference(source, ref, signal)
  })
  signal.throwIfAborted()
  if (!composerOpen(ctx, composer) || (text === '' && files.length === 0)) throw new Error('Closing note cannot be sent')
  const attachments = files.length === 0 ? [] : conversation.createDrafts(binding.sessionId, files, true)
  let accepted = false
  try {
    await waitForUploads(conversation, attachments, signal)
    signal.throwIfAborted()
    if (!composerOpen(ctx, composer)) throw new Error('Closing note session is unavailable')
    const result = await conversation.sendSession(binding.session, text, attachments.map(attachment => attachment.id), 'queue', signal)
    if (result.kind !== 'success') throw new Error('Closing note submission failed')
    accepted = true
  } finally {
    if (!accepted) conversation.releaseDraftAttachments(attachments)
  }
}

function waitForUploads(conversation: ConversationController, attachments: readonly ComposerAttachment[], signal: AbortSignal): Promise<void> {
  if (attachments.length === 0) return Promise.resolve()
  const uploads = conversation.fileUploads
  return new Promise((resolve, reject) => {
    const finish = () => {
      unsubscribe()
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => { finish(); reject(signal.reason) }
    const check = () => {
      const snapshot = uploads.getSnapshot()
      const states = attachments.map(attachment => snapshot[attachment.id]?.status)
      if (states.some(state => state === 'error' || state === undefined)) {
        finish()
        reject(new Error('Closing note attachment upload failed'))
      } else if (states.every(state => state === 'ready')) {
        finish()
        resolve()
      }
    }
    const unsubscribe = uploads.subscribe(check)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    else check()
  })
}
