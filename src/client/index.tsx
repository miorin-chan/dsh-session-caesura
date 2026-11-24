import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
// DSH 0.2.2-rc.5 shares these exports from @deepseek-ai/dsh-client-ui-primitives src/index.ts.
import {
  IconCheckOutlineRegular, IconCopyOutlineRegular, IconEditOutlineRegular, IconSendOutlineRegular, UserMessageBubble,
} from '@deepseek-ai/dsh-client-ui-primitives'
// @deepseek-ai/dsh-client-ui-chat 0.2.2-rc.5, src/client/chat. MIT, docs/dsh-ui-MIT.txt.
import { referenceSummary, userRow, userStack } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/MessageItem.module.css'
import { actions, visuallyHidden } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/MessageIconActions.module.css'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { canSaveDraft, canSendNote, createNoteStore, readNote, restoreNote, saveDraftAsNote, submitNote } from '../lib/notes.js'
import type { ClosingNote } from '../lib/notes.js'
import { NoteAction, NoteTime, RestIcon, styles, useNoteCopy } from './appearance.js'
import { ComposerKeyboardFrame, primaryModifier, useComposerSaveAnchor } from './keyboard.js'
import { labels } from './labels.js'

const namespace = 'dsh-session-caesura'
const frameSlot = 'conversation.hero.frame'
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
    const chatText = ctx.locale.bind('chat')
    const unregisterFrame = ctx.slots.inject(frameSlot, () => ctx.slots.register({
      name: frameSlot, id: namespace,
    }, ComposerKeyboardFrame))
    const unregisterInput = ctx.slots.inject(inputSlot, () => ctx.slots.register({
      name: inputSlot, id: namespace, locale: namespace,
    }, SaveButton))
    const unregisterTail = ctx.slots.inject(tailSlot, () => ctx.slots.register({
      name: tailSlot, id: namespace, locale: namespace, order: 1100,
    }, NoteAtTurnEnd))
    return () => {
      unregisterTail()
      unregisterInput()
      unregisterFrame()
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
      const ready = endSeq !== undefined && idle && allowed && input.queue.length === 0
      const available = ready && canSaveDraft(input)
      const save = useCallback(() => {
        if (!available || inputActions.captureInsertion().draftRev !== input.draftRev) return
        const result = saveDraftAsNote(input, endSeq, note => notes.append(sessionId, note), inputActions)
        setFailedDraft(result === 'storage-error' ? { sessionId, revision: input.draftRev } : null)
      }, [available, endSeq, input, inputActions, sessionId])
      const anchor = useComposerSaveAnchor(available, save)
      const saveFailed = ready && failedDraft?.sessionId === sessionId && failedDraft.revision === input.draftRev
      const showRest = available && modHeld
      if (!showRest && !saveFailed && anchor === null) return null
      return (
        <>
          {showRest && <button type="button" className="dsh-cn-save" data-dsh-session-caesura-save=""
            aria-label={t('save')} title={t('save')} onMouseDown={event => event.preventDefault()} onClick={save}>
            <RestIcon size={24} />
          </button>}
          {saveFailed && <span role="alert" className="dsh-cn-save-error">{t('saveFailed')}</span>}
          {anchor !== null && <span ref={anchor} hidden />}
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
      & { note: ClosingNote; remove: () => void }) {
      const input = useInput((state: InputState) => state)
      const allowed = useAccess('session/prompt')
      const ready = useSession((state: SessionSnapshot) => state.openState === 'open' && !state.removed
        && state.pendingSubmissions.length === 0)
      const canSend = allowed && ready && canSendNote(input)
      return <NoteCard text={note.text} t={t} canSend={canSend}
        time={note.savedAt !== undefined && <NoteTime savedAt={note.savedAt} t={chatText} />}
        onRewind={() => { if (canSend && restoreNote(input, note, inputActions)) remove() }}
        onSend={() => { if (canSend) submitNote(input, note, inputActions) }} />
    }
  }, `${namespace}: composer and turn tail`)
}

function useModHeld(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const update = (event: KeyboardEvent) => setHeld(primaryModifier(event))
    const reset = () => setHeld(false)
    window.addEventListener('keydown', update, { capture: true, passive: true, signal })
    window.addEventListener('keyup', update, { capture: true, passive: true, signal })
    window.addEventListener('blur', reset, { signal })
    document.addEventListener('visibilitychange', reset, { signal })
    return () => controller.abort()
  }, [])
  return held
}

function NoteCard({ text, t, canSend, time, onRewind, onSend }: {
  text: string
  t: TailProps['t']
  canSend: boolean
  time: ReactNode
  onRewind: () => void
  onSend: () => void
}) {
  const { status, copy } = useNoteCopy(text)
  const [rewindFailed, setRewindFailed] = useState(false)
  const hint = canSend ? undefined : t('emptyDraft')
  const hasError = status === 'copyFailed' || rewindFailed
  // Keep tooltips clear of visible error feedback below the toolbar.
  const tooltipSide = hasError ? 'top' : 'bottom'
  return (
    <section className={`${userRow} dsh-cn-note`} data-dsh-session-caesura aria-label={t('title')}>
      <div className={`${referenceSummary} dsh-cn-title`}><RestIcon size={15} />{t('title')}</div>
      {/* Pass the literal draft so quote rendering cannot collapse saved paragraph breaks. */}
      <div className={userStack}><UserMessageBubble>{text}</UserMessageBubble></div>
      <div className={`${actions} dsh-cn-actions`} data-clock="start">
        {time}
        <NoteAction label={t(status === 'copied' ? 'copied' : 'copy')} tooltipSide={tooltipSide} onClick={() => { void copy() }}>
          {status === 'copied' ? <IconCheckOutlineRegular /> : <IconCopyOutlineRegular />}
        </NoteAction>
        <NoteAction label={t('rewind')} unavailableReason={hint} tooltipSide={tooltipSide} onClick={() => {
          try { onRewind() } catch { setRewindFailed(true) }
        }}><IconEditOutlineRegular /></NoteAction>
        <NoteAction label={t('send')} unavailableReason={hint} tooltipSide={tooltipSide} onClick={onSend}>
          <IconSendOutlineRegular />
        </NoteAction>
      </div>
      <span className={hasError ? 'dsh-cn-status' : visuallyHidden} role="status">
        {rewindFailed ? t('rewindFailed') : status === 'ready' ? '' : t(status)}
      </span>
    </section>
  )
}
