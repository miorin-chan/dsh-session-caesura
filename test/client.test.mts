import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { createNoteStore, readNote, restoreNote, saveDraftAsNote, submitNote } from '../lib/notes.js'

const require = createRequire(import.meta.url)
const NS = 'dsh-session-caesura'
const empty = { draft: '', phase: 'plain', attachmentIds: [], occurrences: [] }
const draft = { ...empty, draft: 'For tomorrow\n  second line' }
const note = { endSeq: 42, text: draft.draft }

function fakeStorage() {
  const data = new Map()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }
}

test('registers localized slots, shows the rest while Mod is held and disposes its resources', async () => {
  let registration
  globalThis.window = Object.assign(new EventTarget(), {
    __ModuleLoader__: { load: entry => { registration = entry } },
    localStorage: fakeStorage(),
  })
  const mountedStyles = new Set()
  globalThis.document = Object.assign(new EventTarget(), {
    createElement: () => ({ remove() { mountedStyles.delete(this) } }),
    head: { append: style => mountedStyles.add(style) },
  })
  try {
    await import('../client.js')
    assert.equal(registration.id, '@miorin/dsh-session-caesura')
    const effects = []
    const entries = new Map()
    const dictionaries = new Map()
    const componentEffects = []
    const state = []
    let hookIndex = 0
    const react = {
      ...require('react'),
      useCallback: <T>(callback: T) => callback,
      useContext: () => null,
      useEffect: install => { if (componentEffects.length === 0) componentEffects.push(install()) },
      useLayoutEffect: () => {},
      useRef: <T>(current: T) => ({ current }),
      useState(initial) {
        const index = hookIndex++
        state[index] ??= initial
        return [state[index], value => { state[index] = value }]
      },
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    }
    const plugin = registration.factory(id => id === 'react' ? react : require(id))
    plugin.apply({
      effect: install => effects.push(install()),
      slots: {
        inject: (_name, install) => install(),
        register: (options, component) => {
          entries.set(options.name, { options, component })
          return () => entries.delete(options.name)
        },
      },
      locale: {
        bind: name => {
          assert.equal(name, 'chat')
          return key => key
        },
        register: (name, labels) => {
          dictionaries.set(name, labels)
          return () => dictionaries.delete(name)
        },
      },
    })
    assert.deepEqual(plugin.inject, ['slots', 'locale'])
    assert.deepEqual([...entries.keys()], ['conversation.hero.frame', 'conversation.input.right', 'conversation.chat.turnTail'])
    assert.equal(entries.get('conversation.chat.turnTail').options.locale, NS)
    assert.equal(Object.keys(dictionaries.get(NS)).length, 8)
    assert.equal(mountedStyles.size, 1)

    const composer = entries.get('conversation.input.right').component
    let running = false
    let currentDraft = draft
    function renderComposer() {
      hookIndex = 0
      return composer({
        sessionId: 'session', t: key => key,
        useChat: select => select({ timeline: { turnOrder: ['turn'], turns: new Map([['turn', { end: { seq: 42 } }]]) } }),
        useSession: select => select({ openState: 'open', running, pendingSubmissions: [], subagent: null }),
        useAccess: () => true,
        useInput: select => select({ ...currentDraft, queue: [] }),
      })
    }
    function key(type, modifier) {
      const event = Object.assign(new Event(type, { cancelable: true }), { metaKey: false, ctrlKey: false }, modifier)
      assert.equal(window.dispatchEvent(event), true)
    }
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    try {
      for (const [platform, primary, secondary] of [
        ['MacIntel', 'metaKey', 'ctrlKey'], ['Win32', 'ctrlKey', 'metaKey'],
      ]) {
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { platform } })
        assert.equal(renderComposer(), null)
        key('keydown', { [secondary]: true })
        assert.equal(renderComposer(), null)
        key('keydown', { [primary]: true })
        assert.equal(renderComposer().props.children[0].props.save, true)
        for (const ineligible of [empty, { ...draft, draft: '/model' },
          { ...draft, attachmentIds: ['file'] }, { ...draft, occurrences: ['chip'] }]) {
          currentDraft = ineligible
          assert.equal(renderComposer(), null)
        }
        currentDraft = draft
        running = true
        assert.equal(renderComposer(), null)
        running = false
        key('keyup')
        assert.equal(renderComposer(), null)
        for (const [target, event] of [[window, 'blur'], [document, 'visibilitychange']]) {
          key('keydown', { [primary]: true })
          assert.ok(renderComposer())
          target.dispatchEvent(new Event(event))
          assert.equal(renderComposer(), null)
        }
        componentEffects.pop()()
        key('keydown', { [primary]: true })
        assert.equal(state[1], false)
      }
    } finally {
      if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
      else delete globalThis.navigator
    }

    const quoted = { ...note, text: '> A quote from the conversation\n\nMy next note', savedAt: 1_795_000_000_000 }
    window.localStorage.setItem('dsh.closing-note.session', JSON.stringify(quoted))
    const renderTail = entries.get('conversation.chat.turnTail').component
    const sendable = renderTail({
      turn: { end: { seq: quoted.endSeq } }, sessionId: 'session', t: key => key,
      useAccess: () => true, useInput: select => select(empty),
      useSession: select => select({ openState: 'open', pendingSubmissions: [] }),
    })
    const card = sendable.type(sendable.props)
    state.length = 0
    hookIndex = 0
    const [, bubble, actions] = card.type(card.props).props.children
    assert.equal(bubble.props.children, quoted.text)
    assert.equal(actions.props.children[0].props.savedAt, quoted.savedAt)
    componentEffects.pop()?.()

    effects.reverse().forEach(dispose => dispose())
    assert.equal(entries.size, 0)
    assert.equal(dictionaries.size, 0)
    assert.equal(mountedStyles.size, 0)
  } finally {
    delete globalThis.window
    delete globalThis.document
  }
})

test('saves exact draft text before clearing the composer and never submits it', () => {
  const calls = []
  const actions = {
    setDraft: text => calls.push(['draft', text]), persistDraft: () => calls.push(['persist']),
    submit: () => assert.fail('saving must not send'),
  }
  assert.equal(saveDraftAsNote(draft, 42, stored => calls.push(['save', stored]), actions), 'saved')
  assert.deepEqual(calls, [['save', note], ['draft', ''], ['persist']])
})

test('refuses drafts with attachments, reference chips, slash commands or a pending send', () => {
  const unexpected = () => assert.fail('blocked drafts must stay intact')
  const actions = { setDraft: unexpected, persistDraft: unexpected }
  for (const input of [empty, { ...draft, draft: ' /goal' }, { ...draft, phase: 'sending' },
    { ...draft, attachmentIds: ['file'] }, { ...draft, occurrences: ['chip'] }]) {
    assert.equal(saveDraftAsNote(input, 42, unexpected, actions), 'blocked')
  }
})

test('leaves the draft intact on storage failure', () => {
  const unexpected = () => assert.fail('the draft must remain intact')
  assert.equal(saveDraftAsNote(draft, 42, () => { throw new Error('no storage') }, {
    setDraft: unexpected, persistDraft: unexpected,
  }), 'storage-error')
})

test('uses ordinary submission only when the composer is empty', () => {
  const calls = []
  const actions = {
    setDraft: text => calls.push(['draft', text]), persistDraft: () => calls.push(['persist']),
    submit: () => calls.push(['submit']),
  }
  assert.equal(submitNote(draft, note, actions), false)
  assert.equal(submitNote({ ...empty, phase: 'sending' }, note, actions), false)
  assert.equal(submitNote(empty, note, actions), true)
  assert.deepEqual(calls, [['draft', note.text], ['persist'], ['submit']])
})

test('appends to a legacy note, records the latest save time and notifies readers', ({ mock }) => {
  const storage = fakeStorage()
  const events = new EventTarget()
  const store = createNoteStore(() => storage, events)
  const existing = { ...note, text: `${note.text}\r\n \t\r\n` }
  storage.setItem('dsh.closing-note.a', JSON.stringify(existing))
  assert.deepEqual(readNote(store.read('a')), existing)
  let updates = 0
  const unsubscribe = store.subscribe('a', () => { updates++ })
  let now = 1_795_000_000_000
  mock.method(Date, 'now', () => now)
  store.append('a', { endSeq: 42, text: '\n\t\n  Next note' })
  const appended = { endSeq: 42, text: `${note.text}\n\n  Next note`, savedAt: now }
  assert.deepEqual(readNote(store.read('a')), appended)
  now += 60_000
  store.append('a', { endSeq: 51, text: 'After another turn' })
  assert.equal(updates, 2)
  assert.deepEqual(readNote(store.read('a')), { endSeq: 51, text: `${appended.text}\n\nAfter another turn`, savedAt: now })
  assert.equal(readNote(store.read('b')), null)
  const event = new Event('storage')
  Object.defineProperty(event, 'key', { value: 'dsh.closing-note.a' })
  events.dispatchEvent(event)
  assert.equal(updates, 3)
  unsubscribe()
  store.dispose()
  events.dispatchEvent(event)
  assert.equal(updates, 3)
  for (const invalid of ['{', 'null', '{"endSeq":2,"text":"/command"}', '{"endSeq":-1,"text":"note"}']) {
    assert.equal(readNote(invalid), null)
  }
  for (const savedAt of [null, '2026-11-23', 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(readNote(JSON.stringify({ ...note, savedAt })), note)
  }
})

test('rewind restores the note without sending and only removes the matching saved version', ({ mock }) => {
  const storage = fakeStorage()
  const store = createNoteStore(() => storage, new EventTarget())
  const savedAt = 1_795_000_000_000
  mock.method(Date, 'now', () => savedAt)
  let current = draft.draft
  const persisted = []
  const actions = {
    setDraft: text => { current = text },
    persistDraft: () => persisted.push(current),
    submit: () => assert.fail('rewind must not send'),
  }
  store.append('a', note)
  const saved = { ...note, savedAt }
  assert.equal(restoreNote(draft, note, actions), false)
  assert.deepEqual(readNote(store.read('a')), saved)
  store.append('a', { ...note, text: 'New note' })
  store.remove('a', saved)
  const combined = { ...saved, text: `${note.text}\n\nNew note` }
  store.remove('a', { ...combined, savedAt: savedAt - 1 })
  assert.deepEqual(readNote(store.read('a')), combined)
  assert.equal(restoreNote(empty, combined, actions), true)
  assert.deepEqual(persisted, [combined.text])
  store.remove('a', combined)
  assert.equal(readNote(store.read('a')), null)
  store.dispose()
})
