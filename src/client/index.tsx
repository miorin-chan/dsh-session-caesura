import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
// DSH 0.2.2-rc.5 shares these exports from @deepseek-ai/dsh-client-ui-primitives src/index.ts.
import {
  IconCheckOutlineRegular, IconCopyOutlineRegular, IconSendOutlineRegular, UserMessageBubble,
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
import type { PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { canSaveDraft, createNoteStore, emptyComposer, hasDraft, sameDraft, type ClosingNote } from '../lib/notes.js'
import { NoteAction, NoteTime, RestIcon, UndoIcon, styles, useNoteCopy } from './appearance.js'
import { composerOpen, resolveComposer, restoreDraft, sendNote, withNoteLock } from './composer.js'
import { ComposerKeyboardFrame, primaryModifier, useComposerSaveAnchor } from './keyboard.js'
import { removeMedia, requireMedia, storeMedia } from './media.js'
import { NoteMedia } from './note-media.js'
import { labels } from './labels.js'

const namespace = 'dsh-session-caesura'
const frameSlot = 'conversation.hero.frame'
const inputSlot = 'conversation.input.right'
const tailSlot = 'conversation.chat.turnTail'

export const inject = ['slots', 'locale', 'sessions', 'conversation']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-session-caesura': keyof typeof labels.en
  }
}

type ComposerProps = PropsRuntime<typeof inputSlot> & PropsLocale<typeof namespace>
type TailProps = PropsRuntime<typeof tailSlot> & PropsLocale<typeof namespace> & PropsRenderFactories

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(namespace, labels), `${namespace}: locale`)
  ctx.effect(() => {
    const stylesheet = document.createElement('style')
    stylesheet.textContent = styles
    document.head.append(stylesheet)
    const notes = createNoteStore(() => window.localStorage, window)
    const lifetime = new AbortController()
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
      lifetime.abort()
      unregisterTail()
      unregisterInput()
      unregisterFrame()
      notes.dispose()
      stylesheet.remove()
    }

    function useNote(sessionId: string) {
      const subscribe = useCallback((listener: () => void) => notes.subscribe(sessionId, listener), [sessionId])
      const getSnapshot = useCallback(() => notes.read(sessionId), [sessionId])
      const raw = useSyncExternalStore(subscribe, getSnapshot)
      const note = useMemo(() => notes.decode(raw), [raw])
      return { note, raw }
    }

    function useComposerBlocked(sessionId: ComposerProps['sessionId']): boolean {
      const block = ctx.conversation.blocks.storeFor(sessionId)
      return useSyncExternalStore(block.subscribe, block.getSnapshot) !== undefined
    }

    function SaveButton({ sessionId, inputActions, t, useAccess, useChat, useInput, useProjection, useSession }: ComposerProps) {
      const endSeq = useChat(({ timeline }: ChatSnapshot) => {
        const lastTurn = timeline.turnOrder.at(-1)
        return lastTurn === undefined ? undefined : timeline.turns.get(lastTurn)?.end?.seq
      })
      const { note } = useNote(sessionId)
      const append = note !== null
      const targetSeq = endSeq ?? note?.endSeq
      const running = useSession((state: SessionSnapshot) => state.running)
      const ready = useSession((state: SessionSnapshot) => state.openState === 'open' && !state.removed
        && state.pendingSubmissions.length === 0 && state.subagent === null)
      const blocked = useComposerBlocked(sessionId)
      const allowed = useAccess('session/prompt')
      const input = useInput((state: InputState) => state)
      const canContinue = useProjection('conversationContinuation') != null
      const [saving, setSaving] = useState<string | null>(null)
      const active = useRef(false)
      const [feedback, setFeedback] = useState<{ sessionId: string; failedDraft?: InputState } | null>(null)
      const modHeld = useModHeld()
      const available = targetSeq !== undefined && ready && !blocked && allowed && canSaveDraft(input)
        && (append || (!running && input.queue.length === 0))
      const save = useCallback(() => {
        if (!available || targetSeq === undefined || active.current) return
        const composer = resolveComposer(ctx, sessionId)
        if (composer === undefined || !composerOpen(ctx, composer) || !sameDraft(input, composer.input.state.getSnapshot())) return
        const draft = composer.input.draftSnapshot
        active.current = true
        setSaving(sessionId)
        setFeedback(null)
        void (async () => {
          const attachments = composer.conversation.resolveDraftAttachments(input.attachmentIds)
          if (attachments.length !== input.attachmentIds.length) throw new Error('Closing note draft attachment is unavailable')
          const media = await storeMedia(attachments)
          let committed = false
          try {
            await withNoteLock(sessionId, () => {
              const latest = composer.input.state.getSnapshot()
              const session = composer.binding.session.getSnapshot()
              if (lifetime.signal.aborted || !composerOpen(ctx, composer) || !sameDraft(input, latest)
                || session.pendingSubmissions.length > 0) return
              const existing = notes.decode(notes.read(sessionId))
              if (existing === null && (append || session.running || latest.queue.length > 0)) return
              notes.append(sessionId, { ...draft, endSeq: Math.max(targetSeq, existing?.endSeq ?? 0), attachments: media })
              committed = true
              composer.input.setDraft('')
              inputActions.persistDraft()
              for (const attachment of attachments) composer.input.removeAttachment(attachment.id)
              composer.conversation.releaseDraftAttachments(attachments)
              setFeedback({ sessionId })
            })
          } finally {
            if (!committed) await removeMedia(media)
          }
        })().catch(() => setFeedback({ sessionId, failedDraft: input })).finally(() => {
          active.current = false
          setSaving(null)
        })
      }, [append, available, input, inputActions, sessionId, targetSeq])
      const nativeAction = running ? blocked || !hasDraft(input) : canContinue && !hasDraft(input) && input.queue.length === 0
      const showRest = append ? allowed && !nativeAction && input.phase !== 'sending' : available && modHeld
      const { anchor, card } = useComposerSaveAnchor(append, append ? showRest : available, save)
      const currentFeedback = feedback?.sessionId === sessionId ? feedback : null
      const saveFailed = currentFeedback?.failedDraft !== undefined && sameDraft(currentFeedback.failedDraft, input)
      const label = t(append ? 'append' : 'save')
      return <>
        <span ref={anchor} data-dsh-cn-anchor="" hidden />
        {card !== null && createPortal(<>
          {showRest && <button type="button" className="dsh-cn-save" data-dsh-session-caesura-save=""
            data-append={append || undefined} disabled={!available || saving === sessionId} aria-busy={saving === sessionId || undefined}
            aria-label={label} title={label} onMouseDown={event => event.preventDefault()} onClick={event => {
              if (card.querySelector('[data-composer-composing]') !== null) return
              if (event.detail === 0) card.querySelector<HTMLElement>('[data-composer-input]')?.focus()
              save()
            }}><RestIcon size={24} /></button>}
          {saveFailed && <span role="alert" className="dsh-cn-save-error">{t('saveFailed')}</span>}
          <span role="status" className={visuallyHidden}>{currentFeedback !== null && currentFeedback.failedDraft === undefined ? t('saved') : ''}</span>
        </>, card)}
      </>
    }

    function NoteAtTurnEnd(props: TailProps) {
      const { note, raw } = useNote(props.sessionId)
      if (note === null || raw === null || props.turn.end?.seq !== note.endSeq) return null
      return <SendableNote key={raw} {...props} note={note} raw={raw} />
    }

    function SendableNote({ note, raw, sessionId, inputActions, t, useInput, useAccess, useSession, renderFactorySlot }: TailProps
      & { note: ClosingNote; raw: string }) {
      const input = useInput((state: InputState) => state)
      const allowed = useAccess('session/prompt')
      const canUpload = useAccess('fileUploads/upload')
      const ready = useSession((state: SessionSnapshot) => state.openState === 'open' && !state.removed
        && state.pendingSubmissions.length === 0 && state.subagent === null)
      const blocked = useComposerBlocked(sessionId)
      const available = allowed && ready && !blocked && emptyComposer(input) && (canUpload || note.attachments.length === 0)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState<'rewindFailed' | 'sendFailed' | null>(null)
      const active = useRef(false)
      async function act(action: 'rewind' | 'send'): Promise<void> {
        if (!available || active.current) return
        const composer = resolveComposer(ctx, sessionId)
        if (composer === undefined || !composerOpen(ctx, composer)) return
        active.current = true
        setBusy(true)
        setError(null)
        try {
          const files = await requireMedia(note.attachments)
          if (lifetime.signal.aborted || !composerOpen(ctx, composer) || notes.read(sessionId) !== raw
            || !emptyComposer(composer.input.state.getSnapshot())) return
          if (action === 'send') {
            await sendNote(ctx, composer, note, files, lifetime.signal)
          } else {
            const restored = await withNoteLock(sessionId, () => {
              if (lifetime.signal.aborted || notes.read(sessionId) !== raw || !composerOpen(ctx, composer)
                || !restoreDraft(composer, note, files)) return false
              inputActions.persistDraft()
              notes.remove(sessionId, raw)
              return true
            })
            if (restored) {
              composer.input.focus()
              await removeMedia(note.attachments)
            }
          }
        } catch {
          if (!lifetime.signal.aborted) setError(action === 'send' ? 'sendFailed' : 'rewindFailed')
        } finally {
          active.current = false
          setBusy(false)
        }
      }
      return <NoteCard text={note.text} t={t} canSend={available && !busy} error={error}
        time={note.savedAt !== undefined && <NoteTime savedAt={note.savedAt} t={chatText} />}
        media={note.attachments.length > 0 && <NoteMedia attachments={note.attachments} t={t} renderFactorySlot={renderFactorySlot} />}
        onRewind={() => { void act('rewind') }} onSend={() => { void act('send') }} />
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

function NoteCard({ text, t, canSend, error, time, media, onRewind, onSend }: {
  text: string
  t: TailProps['t']
  canSend: boolean
  error: 'rewindFailed' | 'sendFailed' | null
  time: ReactNode
  media: ReactNode
  onRewind: () => void
  onSend: () => void
}) {
  const { status, copy } = useNoteCopy(text)
  const hint = canSend ? undefined : t('emptyDraft')
  const hasError = status === 'copyFailed' || error !== null
  // Keep tooltips clear of visible error feedback below the toolbar.
  const tooltipSide = hasError ? 'top' : 'bottom'
  return (
    <section className={`${userRow} dsh-cn-note`} data-dsh-session-caesura aria-label={t('title')}>
      <div className={`${referenceSummary} dsh-cn-title`}><RestIcon size={15} />{t('title')}</div>
      {/* Pass the literal draft so quote rendering cannot collapse saved paragraph breaks. */}
      <div className={userStack}>
        {media}
        {text.trim() !== '' && <UserMessageBubble>{text}</UserMessageBubble>}
      </div>
      <div className={`${actions} dsh-cn-actions`} data-clock="start">
        {time}
        {text.trim() !== '' && <NoteAction label={t(status === 'copied' ? 'copied' : 'copy')} tooltipSide={tooltipSide} onClick={() => { void copy() }}>
          {status === 'copied' ? <IconCheckOutlineRegular /> : <IconCopyOutlineRegular />}
        </NoteAction>}
        <NoteAction label={t('rewind')} unavailableReason={hint} tooltipSide={tooltipSide} onClick={onRewind}><UndoIcon /></NoteAction>
        <NoteAction label={t('send')} unavailableReason={hint} tooltipSide={tooltipSide} onClick={onSend}>
          <IconSendOutlineRegular />
        </NoteAction>
      </div>
      <span className={hasError ? 'dsh-cn-status' : visuallyHidden} role="status">
        {error !== null ? t(error) : status === 'ready' ? '' : t(status)}
      </span>
    </section>
  )
}
