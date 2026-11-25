import type { DraftQuote, DraftReference, DraftSnapshot, InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'

export interface NoteAttachment {
  readonly id: number
  readonly kind: 'image' | 'file'
  readonly name: string
  readonly type: string
}

/** A browser-local note attached to the end of a completed conversation turn. */
export interface ClosingNote extends DraftSnapshot {
  readonly endSeq: number
  readonly attachments: readonly NoteAttachment[]
  readonly savedAt?: number
}

type InputDraft = Pick<InputState, 'draft' | 'phase' | 'attachmentIds'>

export function hasDraft(input: InputDraft): boolean {
  return input.draft.trim() !== '' || input.attachmentIds.length > 0
}

export function canSaveDraft(input: InputDraft): boolean {
  return (input.phase === 'plain' || input.phase === 'claimed') && hasDraft(input)
}

export function emptyComposer(input: InputDraft): boolean {
  return input.phase === 'plain' && input.draft === '' && input.attachmentIds.length === 0
}

export function sameDraft(a: InputState, b: InputState): boolean {
  return a.draftRev === b.draftRev && a.phase === b.phase && a.attachmentIds.length === b.attachmentIds.length
    && a.attachmentIds.every((id, index) => id === b.attachmentIds[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAttachment(value: unknown): value is NoteAttachment {
  return isRecord(value) && typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0
    && (value.kind === 'image' || value.kind === 'file') && typeof value.name === 'string' && typeof value.type === 'string'
}

function isSpan(value: Record<string, unknown>): boolean {
  return typeof value.offset === 'number' && Number.isSafeInteger(value.offset) && value.offset >= 0
    && typeof value.length === 'number' && Number.isSafeInteger(value.length) && value.length > 0
}

function isReference(value: unknown): value is DraftReference {
  return isRecord(value) && isSpan(value) && typeof value.source === 'string' && typeof value.ref === 'string'
    && typeof value.label === 'string' && typeof value.clipboardText === 'string'
    && (value.invalid === undefined || typeof value.invalid === 'boolean')
    && (value.appearance === undefined || value.appearance === 'session' || value.appearance === 'file' || value.appearance === 'folder')
}

function isQuote(value: unknown): value is DraftQuote {
  if (!isRecord(value) || !isSpan(value) || typeof value.text !== 'string' || value.text.trim() === '') return false
  const { summary } = value
  return summary === undefined || (isRecord(summary) && typeof summary.label === 'string' && typeof summary.title === 'string'
    && typeof summary.body === 'string' && (summary.detail === undefined || typeof summary.detail === 'string'))
}

function readDraft(value: Record<string, unknown>): DraftSnapshot | undefined {
  const { text, references = [], quotes, command } = value
  if (typeof text !== 'string' || !Array.isArray(references) || !references.every(isReference)
    || (quotes !== undefined && (!Array.isArray(quotes) || !quotes.every(isQuote)))) return undefined
  let commandEnd = 0
  let token: string | undefined
  if (command !== undefined) {
    if (!isRecord(command) || typeof command.token !== 'string') return undefined
    token = command.token
    const spelling = token.trimEnd()
    if (!/^\/\S/u.test(spelling) || !text.startsWith(spelling)) return undefined
    commandEnd = spelling.length
  }
  const spans = [
    ...references.map(span => ({ ...span, projection: span.clipboardText })),
    // DSH 0.2.2-rc.5, @deepseek-ai/dsh-client-ui-primitives, src/markdown/quote-text.ts.
    ...(quotes ?? []).map(span => ({ ...span, projection: span.text.replace(/\r\n?/gu, '\n').split('\n').map(line => `> ${line}`).join('\n') })),
  ].sort((a, b) => a.offset - b.offset)
  let end = commandEnd
  for (const span of spans) {
    if (span.offset < end || span.length !== span.projection.length) return undefined
    end = span.offset + span.length
    if (text.slice(span.offset, end) !== span.projection) return undefined
  }
  return { text, references, ...(quotes === undefined ? {} : { quotes }), ...(token === undefined ? {} : { command: { token } }) }
}

export function createNoteStore(getStorage: () => Storage, events: Window) {
  // Keep stored notes readable across plugin renames.
  const prefix = 'dsh.closing-note.'
  const listeners = new Map<string, Set<() => void>>()
  const publish = (key: string) => { listeners.get(key)?.forEach(listener => listener()) }
  const onStorage = (event: StorageEvent) => {
    if (event.key === null) listeners.forEach((_, key) => publish(key))
    else publish(event.key)
  }
  events.addEventListener('storage', onStorage)

  function decode(raw: string | null): ClosingNote | null {
    if (raw === null) return null
    try {
      const value: unknown = JSON.parse(raw)
      if (!isRecord(value)) return null
      const { endSeq, savedAt } = value
      if (typeof endSeq !== 'number' || !Number.isSafeInteger(endSeq) || endSeq < 0) return null
      const draft = readDraft(value)
      const attachments = value.attachments ?? []
      if (draft === undefined || !Array.isArray(attachments) || !attachments.every(isAttachment)
        || (draft.text.trim() === '' && attachments.length === 0)) return null
      const time = typeof savedAt === 'number' && Number.isSafeInteger(savedAt) && !Number.isNaN(new Date(savedAt).getTime())
        ? { savedAt } : {}
      return { ...draft, endSeq, attachments, ...time }
    } catch {
      return null
    }
  }

  return {
    decode,
    read(sessionId: string): string | null {
      try {
        return getStorage().getItem(prefix + sessionId)
      } catch {
        return null
      }
    },
    append(sessionId: string, note: ClosingNote): void {
      const storage = getStorage()
      const key = prefix + sessionId
      const current = decode(storage.getItem(key))
      const draft = current === null ? note : appendDraft(current, note)
      const attachments = [...current?.attachments ?? [], ...note.attachments]
      storage.setItem(key, JSON.stringify({ ...draft, endSeq: note.endSeq, attachments, savedAt: Date.now() }))
      publish(key)
    },
    remove(sessionId: string, raw: string): boolean {
      const storage = getStorage()
      const key = prefix + sessionId
      if (storage.getItem(key) !== raw) return false
      storage.removeItem(key)
      publish(key)
      return true
    },
    subscribe(sessionId: string, listener: () => void): () => void {
      const key = prefix + sessionId
      const current = listeners.get(key) ?? new Set()
      listeners.set(key, current)
      current.add(listener)
      return () => {
        current.delete(listener)
        if (current.size === 0) listeners.delete(key)
      }
    },
    dispose(): void {
      events.removeEventListener('storage', onStorage)
      listeners.clear()
    },
  }
}

export function appendDraft(previous: DraftSnapshot, next: DraftSnapshot): DraftSnapshot {
  if (previous.text.trim() === '') return next
  if (next.text.trim() === '') return previous
  // Preserve each semantic span, even when its projection ends in whitespace.
  const lastSpanEnd = [...previous.references, ...previous.quotes ?? []]
    .reduce((end, span) => Math.max(end, span.offset + span.length), 0)
  const trimmed = previous.text.replace(/(\S[^\S\r\n]*)[\r\n]\s*$/, '$1')
  const before = previous.text.slice(0, Math.max(trimmed.length, lastSpanEnd))
  const leading = next.text.match(/^(?:[^\S\r\n]*[\r\n])+/)?.[0].length ?? 0
  const dropped = [...next.references, ...next.quotes ?? []]
    .reduce((count, span) => Math.min(count, span.offset), leading)
  const after = next.text.slice(dropped)
  const shift = before.length + 2 - dropped
  const move = <T extends { readonly offset: number }>(span: T): T => ({ ...span, offset: span.offset + shift })
  return {
    text: `${before}\n\n${after}`,
    references: [...previous.references, ...next.references.map(move)],
    quotes: [...previous.quotes ?? [], ...(next.quotes ?? []).map(move)],
    ...(previous.command === undefined ? {} : { command: previous.command }),
  }
}
