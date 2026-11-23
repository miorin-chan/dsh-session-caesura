/** A browser-local note attached to the end of one completed conversation turn. */
export interface ClosingNote {
  readonly endSeq: number
  readonly text: string
}

export interface InputDraft {
  readonly draft: string
  readonly phase: string
  readonly attachmentIds: readonly unknown[]
  readonly occurrences: readonly unknown[]
}

interface DraftActions {
  setDraft(text: string): void
  persistDraft(): void
  submit(): void
}

export function isNoteText(text: string): boolean {
  return text.trim() !== '' && !text.trimStart().startsWith('/')
}

export function canSaveDraft(input: InputDraft): boolean {
  return input.phase === 'plain' && input.attachmentIds.length === 0
    && input.occurrences.length === 0 && isNoteText(input.draft)
}

export function canSendNote(input: InputDraft): boolean {
  return input.phase === 'plain' && input.draft === ''
    && input.attachmentIds.length === 0 && input.occurrences.length === 0
}

export function readNote(raw: string | null): ClosingNote | null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || !('endSeq' in value) || !('text' in value)) return null
    const { endSeq, text } = value
    return typeof endSeq === 'number' && Number.isSafeInteger(endSeq) && endSeq >= 0
      && typeof text === 'string' && isNoteText(text) ? { endSeq, text } : null
  } catch {
    return null
  }
}

export function saveDraftAsNote(
  input: InputDraft,
  endSeq: number,
  write: (note: ClosingNote) => void,
  actions: Pick<DraftActions, 'setDraft' | 'persistDraft'>,
): 'saved' | 'blocked' | 'storage-error' {
  if (!canSaveDraft(input)) return 'blocked'
  try {
    write({ endSeq, text: input.draft })
  } catch {
    return 'storage-error'
  }
  actions.setDraft('')
  actions.persistDraft()
  return 'saved'
}

export function restoreNote(input: InputDraft, note: ClosingNote, actions: Pick<DraftActions, 'setDraft' | 'persistDraft'>): boolean {
  if (!canSendNote(input) || !isNoteText(note.text)) return false
  actions.setDraft(note.text)
  actions.persistDraft()
  return true
}

export function submitNote(input: InputDraft, note: ClosingNote, actions: DraftActions): boolean {
  if (!restoreNote(input, note, actions)) return false
  actions.submit()
  return true
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
  return {
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
      const current = readNote(storage.getItem(key))
      let text = note.text
      if (current !== null) {
        // Remove blank lines at the join while preserving the text and indentation of each note.
        const previous = current.text.replace(/(\S[^\S\r\n]*)[\r\n]\s*$/, '$1')
        const next = note.text.replace(/^(?:[^\S\r\n]*[\r\n])+/, '')
        text = `${previous}\n\n${next}`
      }
      storage.setItem(key, JSON.stringify({ endSeq: note.endSeq, text }))
      publish(key)
    },
    remove(sessionId: string, note: ClosingNote): void {
      const storage = getStorage()
      const key = prefix + sessionId
      const current = readNote(storage.getItem(key))
      if (current?.endSeq !== note.endSeq || current.text !== note.text) return
      storage.removeItem(key)
      publish(key)
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
