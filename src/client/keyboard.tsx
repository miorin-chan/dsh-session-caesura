import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PropsWithChildren } from 'react'
import { isDarwinDesktop } from '@deepseek-ai/dsh-client-ui-primitives'

interface SaveAction {
  readonly anchor: HTMLElement
  readonly append: boolean
  save(): void
}

type AttachSaveAction = (card: HTMLElement, action: SaveAction) => () => void
const ComposerSaveActions = createContext<AttachSaveAction | null>(null)

// @deepseek-ai/dsh-client-ui-conversation 0.2.2-rc.5 exposes these DOM markers
// in InputBar and ComposerContentEditable. Its keymap keeps a 10 ms IME guard.
// @deepseek-ai/dsh-client-ui-input-trigger 0.2.2-rc.5 MenuView describes
// the highlighted candidate that InputTriggerController gives Enter priority.
const composerCard = '[data-composer-card]'
const composerEditor = '[data-composer-input][contenteditable="true"]'
const highlightedCandidate = '[data-trigger-menu] [role="listbox"][aria-activedescendant]'
const hiddenRegion = '[hidden], [inert]'

export function primaryModifier(event: Pick<globalThis.KeyboardEvent, 'type' | 'key' | 'metaKey' | 'ctrlKey'>): boolean {
  const desktop = document.documentElement.dataset.platform
  const mac = desktop === undefined ? /mac|iphone|ipad/iu.test(navigator.platform) : isDarwinDesktop()
  const key = mac ? 'Meta' : 'Control'
  // The modifier's own keydown can arrive without its modifier bit set.
  return (event.type === 'keydown' && event.key === key) || (mac ? event.metaKey : event.ctrlKey)
}

export function ComposerKeyboardFrame({ children }: PropsWithChildren) {
  const [actions] = useState(() => new WeakMap<Element, SaveAction>())
  const compositionEnd = useRef<{ target: EventTarget; time: number } | null>(null)
  const attach = useCallback<AttachSaveAction>((card, action) => {
    actions.set(card, action)
    return () => { if (actions.get(card) === action) actions.delete(card) }
  }, [actions])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Enter' || (event.metaKey && event.ctrlKey)
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
    if (action === undefined || !card.contains(action.anchor) || card.closest(hiddenRegion) !== null) return
    // Recording hides the standard controls. Existing notes still own Send in that composer.
    if (!action.append && (!primaryModifier(event) || action.anchor.parentElement?.closest(hiddenRegion) != null)) return
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

/** Address both the composer keyboard frame and the card that positions the rest. */
export function useComposerSaveAnchor(append: boolean, intercept: boolean, save: () => void) {
  const attach = useContext(ComposerSaveActions)
  const anchor = useRef<HTMLSpanElement>(null)
  const [card, setCard] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => { setCard(anchor.current?.closest<HTMLElement>(composerCard) ?? null) }, [])
  useLayoutEffect(() => {
    const marker = anchor.current
    if (intercept && attach !== null && marker !== null && card !== null) return attach(card, { anchor: marker, append, save })
  }, [append, attach, card, intercept, save])
  return { anchor, card }
}
