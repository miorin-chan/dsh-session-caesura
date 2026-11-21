import { useEffect, useRef, useState, type ReactNode } from 'react'

export const styles = `
.dsh-cn-note { display: flex; flex-direction: column; align-items: flex-end; margin-block: 8px; }
.dsh-cn-bubble {
  box-sizing: border-box;
  max-width: min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%);
  background: var(--dsw-specific-bubble); border-radius: var(--dsw-radius-xl);
  padding: 10px 16px; color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(22px + var(--dsh-content-font-delta, 0px));
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.dsh-cn-title {
  display: flex; align-items: center; gap: 4px; margin-bottom: 3px;
  color: var(--dsw-alias-label-secondary); font-size: var(--dsh-content-font-size-secondary, 13px);
}
.dsh-cn-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.dsh-cn-button {
  box-sizing: border-box; display: inline-grid; place-items: center; flex: none;
  width: calc(28px + var(--dsh-content-font-delta, 0px)); height: calc(28px + var(--dsh-content-font-delta, 0px));
  padding: 0; border: 0; border-radius: var(--dsw-radius-sm); background: transparent;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); cursor: pointer;
}
.dsh-cn-button.dsh-cn-save { width: 34px; height: 34px; color: var(--dsw-alias-label-secondary); }
.dsh-cn-button[aria-disabled='true'] { opacity: 0.45; cursor: default; }
.dsh-cn-button:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}
@media (hover: hover) {
  .dsh-cn-button:not([aria-disabled='true']):hover {
    color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover);
  }
}
.dsh-cn-status { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.dsh-cn-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`

const artwork = {
  rest: <path d="m9.1 2.4 6.2 7-4 3.6 4 4.3c-3.8-1.1-6.1 1.1-4.1 4.3" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  rewind: <><path d="M4 10h11a5 5 0 0 1 0 10h-3" /><path d="m9 5-5 5 5 5" /></>,
  send: <><path d="m3 10 18-7-7 18-3.4-7.6L3 10Z" /><path d="m10.6 13.4 5-5" /></>,
}

type Glyph = keyof typeof artwork

export function Icon({ name, size = 17 }: { name: Glyph; size?: number }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={name === 'rest' ? 2.5 : 1.65}
    strokeLinecap="round" strokeLinejoin="round">{artwork[name]}</svg>
}

export function IconButton({ label, hint, unavailable = false, save = false, onClick, children }: {
  label: string
  hint?: string
  unavailable?: boolean
  save?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const description = hint ?? label
  return <button type="button" className={`dsh-cn-button${save ? ' dsh-cn-save' : ''}`}
    data-dsh-closing-note-save={save ? '' : undefined} aria-label={label} aria-disabled={unavailable || undefined}
    aria-description={hint} title={description}
    onMouseDown={save ? event => event.preventDefault() : undefined}
    onClick={() => { if (!unavailable) onClick() }}>{children}</button>
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
    let result: 'copied' | 'copyFailed' = 'copied'
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      result = 'copyFailed'
    } finally {
      pending.current = false
    }
    if (!active.current) return
    setStatus(result)
    timer.current = setTimeout(() => setStatus('ready'), result === 'copied' ? 1200 : 3000)
  } }
}
