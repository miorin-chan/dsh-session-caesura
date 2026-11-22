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
/* Overlay the primary action from the right slot without adding toolbar width.
   Geometry and colors follow @deepseek-ai/dsh-client-ui-conversation 0.2.2-rc.5,
   src/client/skeleton/InputBar.module.css (.card, .row, .primary, .trailing).
   Copyright (c) 2026 DeepSeek, MIT. See docs/dsh-ui-MIT.txt. */
.dsh-cn-button.dsh-cn-save {
  position: absolute;
  right: 8px; bottom: 8px; z-index: 1;
  width: 34px; height: 34px;
  border-radius: 999px; corner-shape: round;
  background: var(--dsw-alias-button-info-fill);
  color: var(--dsw-alias-label-on-color);
  transition: background-color 100ms ease;
}
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
.dsh-cn-button[aria-disabled='true'] { opacity: 0.45; cursor: default; }
.dsh-cn-button:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}
@media (hover: hover) {
  .dsh-cn-button:not(.dsh-cn-save):not([aria-disabled='true']):hover {
    color: var(--dsw-alias-label-primary);
    background: var(--dsw-alias-interactive-bg-hover);
  }
  .dsh-cn-button.dsh-cn-save:hover {
    background: var(--dsw-alias-button-info-hover);
  }
}
.dsh-cn-status { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.dsh-cn-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`

const artwork = {
  // Bravura SMuFL restQuarter (U+E4E5), scaled to the icon viewport. See docs/bravura-OFL.txt.
  rest: <path fill="currentColor" stroke="none" d="
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
  " />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  rewind: <><path d="M4 10h11a5 5 0 0 1 0 10h-3" /><path d="m9 5-5 5 5 5" /></>,
  send: <><path d="m3 10 18-7-7 18-3.4-7.6L3 10Z" /><path d="m10.6 13.4 5-5" /></>,
}

type Glyph = keyof typeof artwork

export function Icon({ name, size = 17 }: { name: Glyph; size?: number }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={1.65}
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
    data-dsh-session-caesura-save={save ? '' : undefined} aria-label={label} aria-disabled={unavailable || undefined}
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
