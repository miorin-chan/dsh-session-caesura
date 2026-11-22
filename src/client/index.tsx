import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { canSaveDraft, canSendNote, createNoteStore, readNote, restoreNote, saveDraftAsNote, submitNote } from '../lib/notes.js'
import { Icon, IconButton, styles, useNoteCopy } from './appearance.js'
import { labels } from './labels.js'

const namespace = 'dsh-session-caesura'
const inputSlot = 'conversation.input.right'
const tailSlot = 'conversation.chat.turnTail'

export const inject = ['slots', 'locale']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-session-caesura': keyof typeof labels.en
  }
}

type ComposerProps = PropsRuntime<typeof inputSlot> & PropsLocale<typeof namespace>
type TailProps = PropsRuntime<typeof tailSlot> & PropsLocale<typeof namespace>

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(namespace, labels), `${namespace}: locale`)
  ctx.effect(() => {
    const stylesheet = document.createElement('style')
    stylesheet.textContent = styles
    document.head.append(stylesheet)
    const notes = createNoteStore(() => window.localStorage, window)
    const unregisterInput = ctx.slots.inject(inputSlot, () => ctx.slots.register({
      name: inputSlot, id: namespace, locale: namespace,
    }, SaveButton))
    const unregisterTail = ctx.slots.inject(tailSlot, () => ctx.slots.register({
      name: tailSlot, id: namespace, locale: namespace, order: 1100,
    }, NoteAtTurnEnd))
    return () => {
      unregisterTail()
      unregisterInput()
      notes.dispose()
      stylesheet.remove()
    }

    function SaveButton({ inputActions, sessionId, t, useAccess, useChat, useInput, useSession }: ComposerProps) {
      const endSeq = useChat(({ timeline }: ChatSnapshot) => {
        const lastTurn = timeline.turnOrder.at(-1)
        return lastTurn === undefined ? undefined : timeline.turns.get(lastTurn)?.end?.seq
      })
      const idle = useSession((state: SessionSnapshot) => state.openState === 'open' && !state.running && !state.removed
        && state.pendingSubmissions.length === 0 && state.subagent === null)
      const allowed = useAccess('session/prompt')
      const input = useInput((state: InputState) => state)
      const [failedDraft, setFailedDraft] = useState<{ sessionId: string; revision: number } | null>(null)
      const modHeld = useModHeld()
      const saveFailed = failedDraft?.sessionId === sessionId && failedDraft.revision === input.draftRev
      if (endSeq === undefined || !idle || !allowed || input.queue.length > 0) return null

      const showRest = modHeld && canSaveDraft(input)
      if (!showRest && !saveFailed) return null
      return (
        <>
          {showRest && (
            <IconButton label={t('save')} save onClick={() => {
              const result = saveDraftAsNote(input, endSeq, note => notes.write(sessionId, note), inputActions)
              setFailedDraft(result === 'storage-error' ? { sessionId, revision: input.draftRev } : null)
            }}><Icon name="rest" size={24} /></IconButton>
          )}
          {saveFailed && <span role="alert" className="dsh-cn-save-error">{t('saveFailed')}</span>}
        </>
      )
    }

    function NoteAtTurnEnd({ turn, sessionId, t, useInput, inputActions, useAccess, useSession }: TailProps) {
      const subscribe = useCallback((listener: () => void) => notes.subscribe(sessionId, listener), [sessionId])
      const getSnapshot = useCallback(() => notes.read(sessionId), [sessionId])
      const note = readNote(useSyncExternalStore(subscribe, getSnapshot))
      if (note === null || turn.end?.seq !== note.endSeq) return null
      return <SendableNote key={note.text} note={note} t={t} useInput={useInput}
        inputActions={inputActions} useAccess={useAccess} useSession={useSession}
        remove={() => notes.remove(sessionId, note)} />
    }

    function SendableNote({ note, t, useInput, inputActions, useAccess, useSession, remove }:
      Pick<TailProps, 't' | 'useInput' | 'inputActions' | 'useAccess' | 'useSession'>
      & { note: NonNullable<ReturnType<typeof readNote>>; remove: () => void }) {
      const input = useInput((state: InputState) => state)
      const allowed = useAccess('session/prompt')
      const ready = useSession((state: SessionSnapshot) => state.openState === 'open' && !state.removed
        && state.pendingSubmissions.length === 0)
      const canSend = allowed && ready && canSendNote(input)
      return <NoteCard note={note} t={t} canSend={canSend}
        onRewind={() => { if (canSend && restoreNote(input, note, inputActions)) remove() }}
        onSend={() => { if (canSend) submitNote(input, note, inputActions) }} />
    }
  }, `${namespace}: composer and turn tail`)
}

function useModHeld(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const isMac = /^Mac/i.test(navigator.platform)
    const controller = new AbortController()
    const { signal } = controller
    const update = (event: KeyboardEvent) => setHeld(isMac ? event.metaKey : event.ctrlKey)
    const reset = () => setHeld(false)
    window.addEventListener('keydown', update, { capture: true, passive: true, signal })
    window.addEventListener('keyup', update, { capture: true, passive: true, signal })
    window.addEventListener('blur', reset, { signal })
    document.addEventListener('visibilitychange', reset, { signal })
    return () => controller.abort()
  }, [])
  return held
}

function NoteCard({ note, t, canSend, onRewind, onSend }: {
  note: NonNullable<ReturnType<typeof readNote>>
  t: TailProps['t']
  canSend: boolean
  onRewind: () => void
  onSend: () => void
}) {
  const { status, copy } = useNoteCopy(note.text)
  const [rewindFailed, setRewindFailed] = useState(false)
  const hint = canSend ? undefined : t('emptyDraft')
  return (
    <section className="dsh-cn-note" data-dsh-session-caesura aria-label={t('title')}>
      <div className="dsh-cn-title"><Icon name="rest" size={15} />{t('title')}</div>
      <div className="dsh-cn-bubble">{note.text}</div>
      <div className="dsh-cn-actions">
        <IconButton label={t(status === 'copied' ? 'copied' : 'copy')} onClick={() => { void copy() }}>
          <Icon name={status === 'copied' ? 'check' : 'copy'} />
        </IconButton>
        <IconButton label={t('rewind')} hint={hint} unavailable={!canSend} onClick={() => {
          try { onRewind() } catch { setRewindFailed(true) }
        }}><Icon name="rewind" /></IconButton>
        <IconButton label={t('send')} hint={hint} unavailable={!canSend} onClick={onSend}>
          <Icon name="send" />
        </IconButton>
      </div>
      <span className={status === 'copyFailed' || rewindFailed ? 'dsh-cn-status' : 'dsh-cn-sr'} role="status">
        {rewindFailed ? t('rewindFailed') : status === 'ready' ? '' : t(status)}
      </span>
    </section>
  )
}
