import { useCallback, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { canSaveDraft, canSendNote, createNoteStore, readNote, saveDraftAsNote, submitNote } from '../lib/notes.js'
import { labels } from './labels.js'

const namespace = 'dsh-closing-note'
const inputSlot = 'conversation.input.right'
const tailSlot = 'conversation.chat.turnTail'

export const inject = ['slots', 'locale']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-closing-note': keyof typeof labels.en
  }
}

type ComposerProps = PropsRuntime<typeof inputSlot> & PropsLocale<typeof namespace>
type TailProps = PropsRuntime<typeof tailSlot> & PropsLocale<typeof namespace>

const toolbarStyle = {
  width: 30, height: 30, padding: 0, display: 'inline-grid', placeItems: 'center',
  border: 0, borderRadius: 'var(--dsw-radius-sm)', background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)', fontSize: 19, lineHeight: 1,
} as const

const actionStyle = {
  border: 0, borderRadius: 'var(--dsw-radius-sm)', padding: '4px 8px',
  background: 'transparent', color: 'var(--dsw-alias-label-secondary)', font: 'inherit',
} as const

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(namespace, labels), `${namespace}: locale`)
  ctx.effect(() => {
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
      const [failedSession, setFailedSession] = useState<string | null>(null)
      if (endSeq === undefined || !idle || !allowed || input.queue.length > 0) return null

      const canSave = canSaveDraft(input)
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <button
            type="button"
            data-dsh-closing-note-save
            aria-label={t('save')}
            title={t(canSave ? 'save' : 'plainDraft')}
            disabled={!canSave}
            style={{ ...toolbarStyle, opacity: canSave ? 1 : 0.48, cursor: canSave ? 'pointer' : 'default' }}
            onMouseDown={event => event.preventDefault()}
            onClick={() => {
              const result = saveDraftAsNote(input, endSeq, note => notes.write(sessionId, note), inputActions)
              setFailedSession(result === 'storage-error' ? sessionId : null)
            }}
          ><span aria-hidden="true">𝄽</span></button>
          {failedSession === sessionId && (
            <span role="alert" style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 12 }}>{t('saveFailed')}</span>
          )}
        </span>
      )
    }

    function NoteAtTurnEnd({ turn, sessionId, t, useInput, inputActions, useAccess, useSession }: TailProps) {
      const subscribe = useCallback((listener: () => void) => notes.subscribe(sessionId, listener), [sessionId])
      const getSnapshot = useCallback(() => notes.read(sessionId), [sessionId])
      const note = readNote(useSyncExternalStore(subscribe, getSnapshot))
      if (note === null || turn.end?.seq !== note.endSeq) return null
      return <SendableNote key={note.text} note={note} t={t} useInput={useInput}
        inputActions={inputActions} useAccess={useAccess} useSession={useSession} />
    }

    function SendableNote({ note, t, useInput, inputActions, useAccess, useSession }:
      Pick<TailProps, 't' | 'useInput' | 'inputActions' | 'useAccess' | 'useSession'>
      & { note: NonNullable<ReturnType<typeof readNote>> }) {
      const input = useInput((state: InputState) => state)
      const allowed = useAccess('session/prompt')
      const ready = useSession((state: SessionSnapshot) => state.openState === 'open' && !state.removed
        && state.pendingSubmissions.length === 0)
      const canSend = allowed && ready && canSendNote(input)
      return <NoteCard note={note} t={t} canSend={canSend}
        onSend={() => { if (canSend) submitNote(input, note, inputActions) }} />
    }
  }, `${namespace}: composer and turn tail`)
}

function NoteCard({ note, t, canSend, onSend }: {
  note: NonNullable<ReturnType<typeof readNote>>
  t: TailProps['t']
  canSend: boolean
  onSend: () => void
}) {
  const [copyStatus, setCopyStatus] = useState<'ready' | 'copied' | 'copyFailed'>('ready')
  return (
    <section data-dsh-closing-note aria-label={t('title')} style={{
      borderInlineStart: '2px solid var(--dsw-alias-border-l2)', padding: '4px 12px',
      marginBlock: '8px', color: 'var(--dsw-alias-label-primary)',
    }}>
      <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>
        <span aria-hidden="true">𝄽 </span>{t('title')}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', paddingBlock: '4px' }}>{note.text}</div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, fontSize: 12 }}>
        <button type="button" style={{ ...actionStyle, cursor: 'pointer' }} onClick={async () => {
          try {
            await navigator.clipboard.writeText(note.text)
            setCopyStatus('copied')
          } catch {
            setCopyStatus('copyFailed')
          }
        }}>{t('copy')}</button>
        <span title={canSend ? undefined : t('emptyDraft')}>
          <button type="button" disabled={!canSend} onClick={onSend}
            style={{ ...actionStyle, opacity: canSend ? 1 : 0.5, cursor: canSend ? 'pointer' : 'default' }}>
            {t('send')}
          </button>
        </span>
        <span role="status">{copyStatus === 'ready' ? '' : t(copyStatus)}</span>
      </div>
    </section>
  )
}
