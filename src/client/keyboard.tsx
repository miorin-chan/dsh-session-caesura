import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PropsWithChildren } from 'react'

interface SaveAction {
  readonly anchor: HTMLElement
  save(): void
}

type AttachSaveAction = (anchor: HTMLElement, save: () => void) => (() => void) | undefined
const ComposerSaveActions = createContext<AttachSaveAction | null>(null)

// @deepseek-ai/dsh-client-ui-conversation 0.2.2-rc.5 exposes these DOM markers
// in InputBar and ComposerContentEditable. Its keymap keeps a 10 ms IME guard.
// @deepseek-ai/dsh-client-ui-input-trigger 0.2.2-rc.5 MenuView describes
// the highlighted candidate that InputTriggerController gives Enter priority.
const composerCard = '[data-composer-card]'
const composerEditor = '[data-composer-input][contenteditable="true"]'
const highlightedCandidate = '[data-trigger-menu] [role="listbox"][aria-activedescendant]'
const hiddenRegion = '[hidden], [inert]'

export function primaryModifier(event: Pick<globalThis.KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return /^Mac/i.test(navigator.platform) ? event.metaKey : event.ctrlKey
}

export function ComposerKeyboardFrame({ children }: PropsWithChildren) {
  const [actions] = useState(() => new WeakMap<Element, SaveAction>())
  const compositionEnd = useRef<{ target: EventTarget; time: number } | null>(null)
  const attach = useCallback<AttachSaveAction>((anchor, save) => {
    const card = anchor.closest(composerCard)
    if (card === null) return
    const action = { anchor, save }
    actions.set(card, action)
    return () => { if (actions.get(card) === action) actions.delete(card) }
  }, [actions])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Enter' || !primaryModifier(event) || (event.metaKey && event.ctrlKey)
      || event.altKey || event.shiftKey || event.getModifierState('AltGraph')
      || event.repeat || event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229) return
    const editor = event.target
    if (!(editor instanceof HTMLElement) || editor !== editor.ownerDocument.activeElement
      || !editor.matches(composerEditor) || !event.currentTarget.contains(editor)
      || editor.hasAttribute('data-composer-composing')) return
    const ended = compositionEnd.current
    if (ended?.target === editor && Date.now() - ended.time < 10) return
    const card = editor.closest(composerCard)
    if (card === null || card.querySelector(highlightedCandidate) !== null) return
    const action = actions.get(card)
    // The recording activity hides the controls that contain this marker.
    if (action === undefined || !card.contains(action.anchor)
      || action.anchor.parentElement?.closest(hiddenRegion) != null) return
    event.preventDefault()
    event.stopPropagation()
    action.save()
  }

  return (
    <ComposerSaveActions.Provider value={attach}>
      <div style={{ display: 'contents' }} data-dsh-session-caesura-frame
        onCompositionEndCapture={event => { compositionEnd.current = { target: event.target, time: Date.now() } }}
        onKeyDownCapture={onKeyDown}>
        {children}
      </div>
    </ComposerSaveActions.Provider>
  )
}

/** Attach the same action as the rest button to the frame that owns this composer. */
export function useComposerSaveAnchor(available: boolean, save: () => void) {
  const attach = useContext(ComposerSaveActions)
  const anchor = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const marker = anchor.current
    if (available && attach !== null && marker !== null) return attach(marker, save)
  }, [attach, available, save])
  return available && attach !== null ? anchor : null
}
