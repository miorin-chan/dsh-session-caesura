import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Tooltip, writeClipboard, type TooltipSide } from '@deepseek-ai/dsh-client-ui-primitives'
// Built from @deepseek-ai/dsh-client-ui-chat 0.2.2-rc.5, src/client/chat. MIT, docs/dsh-ui-MIT.txt.
import { formatMessageClock, type ClockTranslate } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/message-chrome.ts'
import { useCalendarDay } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/use-calendar-day.ts'
import { action, timeStart } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/MessageIconActions.module.css'

// The build embeds the stylesheets from the upstream CSS module imports.
declare const bundledChatStyles: string

export const styles = bundledChatStyles + `
/* The turnTail slot's display: contents anchor puts its entries in the footer's flex column.
   Move the note past the action row and use visual order for the footer's focus groups. */
@supports (reading-flow: flex-visual) {
  [data-slot="conversation.chat.node"] > :has(> [data-slot="conversation.chat.turnTail"]:not(:last-child) > .dsh-cn-note) {
    reading-flow: flex-visual;
    & > [data-slot="conversation.chat.turnTail"] > .dsh-cn-note { order: 1; }
  }
}
.dsh-cn-note { margin-block: 8px; }
.dsh-cn-note .dsh-cn-title {
  display: flex; align-items: center; gap: 4px; color: var(--dsw-alias-label-secondary);
}
/* Keep note actions visible independently of the enclosing reply and allow wrapping at narrow widths. */
.dsh-cn-note .dsh-cn-actions {
  flex-wrap: wrap; justify-content: flex-end; height: auto; max-width: 100%; opacity: 1;
}
.dsh-cn-media { display: grid; gap: 6px; justify-items: end; max-width: 100%; }
.dsh-cn-media-item { display: grid; gap: 4px; justify-items: end; max-width: 100%; min-width: 0; }
.dsh-cn-media :is(audio, video) { max-width: min(320px, 100%); }
.dsh-cn-image img { max-width: 100%; }
.dsh-cn-file {
  display: flex; align-items: center; gap: 8px; max-width: 100%; min-width: 0;
  padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-label-primary); overflow-wrap: anywhere;
}
/* The portaled rest uses the native primary action's space and follows the
   geometry in @deepseek-ai/dsh-client-ui-conversation 0.2.2-rc.5 InputBar.module.css.
   Copyright (c) 2026 DeepSeek, MIT. See docs/dsh-ui-MIT.txt. */
[data-composer-card]:has(> .dsh-cn-save[data-append]) > div > div > button[aria-busy="false"] {
  visibility: hidden;
}
[data-composer-card]:has([hidden] [data-dsh-cn-anchor]) > .dsh-cn-save:not([data-append]) {
  display: none;
}
.dsh-cn-save {
  position: absolute;
  right: 8px; bottom: 8px; z-index: 1;
  box-sizing: border-box; display: inline-grid; place-items: center;
  width: 34px; height: 34px; padding: 0; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l4);
  border-radius: 50%; corner-shape: round;
  /* Match the card behind the original outline and cover the native arrow. */
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
}
.dsh-cn-save:disabled { cursor: default; color: var(--dsw-alias-label-tertiary); }
.dsh-cn-save-error {
  box-sizing: border-box;
  position: absolute;
  right: 8px; bottom: 50px; z-index: 1;
  max-width: calc(100% - 16px);
  padding: 4px 8px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-specific-input-major);
  box-shadow: var(--dsw-elevation-soft);
  color: var(--dsw-alias-state-error-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.4;
  pointer-events: none;
}
.dsh-cn-save:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}
@media (hover: hover) {
  .dsh-cn-save:enabled:hover { color: var(--dsw-alias-label-primary); }
}
.dsh-cn-status { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
`

// Bravura SMuFL restQuarter (U+E4E5), scaled to the icon viewport. See docs/bravura-OFL.txt.
export function RestIcon({ size }: { size: number }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24">
    <path fill="currentColor" d="
    M10.39 13.04 C10.83 13.6 11.23 14.13 11.59 14.72 C11.65 14.84 11.76 15.06 11.76 15.12 C11.76 15.14 11.76
    15.2 11.73 15.23 C11.68 15.34 11.56 15.37 11.42 15.37 C11.31 15.37 11.09 15.31 10.98 15.28 C10.83 15.28
    10.67 15.2 10.53 15.2 C9.32 15.2 8.22 16.41 8.22 17.9 C8.22 19.3 9.43 20.68 11.48 22.25 C11.71 22.42
    11.99 22.5 12.21 22.5 C12.41 22.5 12.6 22.44 12.63 22.33 C12.66 22.25 12.69 22.19 12.69 22.14 C12.69
    21.88 12.46 21.66 12.24 21.46 C11.87 21.46 11.56 20.7 11.51 20.45 C11.42 20.23 11.4 19.97 11.4 19.72
    C11.4 18.85 11.82 17.87 12.72 17.7 C12.86 17.67 13 17.67 13.17 17.67 C13.98 17.67 14.91 17.98 15.35 18.15
    C15.38 18.15 15.41 18.18 15.44 18.18 C15.52 18.2 15.58 18.2 15.64 18.2 C15.72 18.2 15.78 18.18 15.78
    18.09 C15.78 17.76 15.05 16.83 14.74 16.49 C13.67 15.2 12.8 14.16 12.8 12.59 C12.8 12.48 12.83 12.34
    12.83 12.22 C12.94 10.6 13.95 9.25 14.68 8.1 C14.77 7.96 14.79 7.82 14.79 7.68 C14.79 7.4 14.68 7.14
    14.68 7.14 C14.68 7.14 10.53 2.2 10.05 1.72 C9.91 1.58 9.71 1.5 9.54 1.5 C9.26 1.5 8.98 1.7 8.98 2.09
    C8.98 2.23 9.01 2.37 9.09 2.54 C9.21 2.85 10.81 4.28 10.81 6.3 C10.81 7.34 10.39 8.55 9.12 9.87 C8.84
    10.15 8.73 10.46 8.73 10.68 C8.73 11.07 9.01 11.35 9.01 11.35 Z
    " />
  </svg>
}

export function UndoIcon() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10h11a5 5 0 0 1 0 10h-3" />
    <path d="m9 5-5 5 5 5" />
  </svg>
}

export function NoteAction({ label, unavailableReason, tooltipSide, onClick, children }: {
  label: string
  unavailableReason?: string
  tooltipSide: TooltipSide
  onClick: () => void
  children: ReactNode
}) {
  const unavailable = unavailableReason !== undefined
  return <Tooltip label={unavailableReason ?? label} side={tooltipSide} openOnClick={unavailable}>
    <button type="button" className={action} aria-label={label} aria-disabled={unavailable || undefined}
      aria-description={unavailableReason} data-unavailable={unavailable || undefined}
      onClick={unavailable ? undefined : onClick}>{children}</button>
  </Tooltip>
}

export function NoteTime({ savedAt, t }: { savedAt: number; t: ClockTranslate }) {
  const day = useCalendarDay()
  const date = new Date(savedAt)
  const params = { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
  const full = `${t('clock.ymd', params)} ${formatMessageClock(savedAt, t, savedAt)}`
  return <time className={timeStart} dateTime={date.toISOString()} title={full}>
    {formatMessageClock(savedAt, t, day)}
  </time>
}

export function useNoteCopy(text: string) {
  const [status, setStatus] = useState<'ready' | 'copied' | 'copyFailed'>('ready')
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false; clearTimeout(timer.current) }
  }, [])

  return { status, async copy() {
    if (pending.current) return
    pending.current = true
    clearTimeout(timer.current)
    const copied = await writeClipboard(text).catch(() => false)
    pending.current = false
    const result = copied ? 'copied' : 'copyFailed'
    if (!active.current) return
    setStatus(result)
    timer.current = setTimeout(() => setStatus('ready'), result === 'copied' ? 1200 : 3000)
  } }
}
