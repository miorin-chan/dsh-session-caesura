import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { canSaveDraft, createNoteStore, emptyComposer, sameDraft } from '../lib/notes.js'

const require = createRequire(import.meta.url)
const NS = 'dsh-session-caesura'
const empty = { draft: '', phase: 'plain', attachmentIds: [], occurrences: [] }
const draft = { ...empty, draft: 'For tomorrow\n  second line' }
const note = { endSeq: 42, text: draft.draft, references: [], attachments: [] }
const keyOf = (session: string) => `dsh.closing-note.${session}`

function fakeStorage() {
  const data = new Map()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }
}

test('registers localized slots and keeps the rest active for the current saved note', async () => {
  let registration
  globalThis.window = Object.assign(new EventTarget(), {
    __ModuleLoader__: { load: entry => { registration = entry } },
    localStorage: fakeStorage(),
  })
  const mountedStyles = new Set()
  globalThis.document = Object.assign(new EventTarget(), {
    createElement: () => ({ remove() { mountedStyles.delete(this) } }),
    documentElement: { dataset: {} },
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
    const cardElement = { querySelector: () => null }
    const marker = { closest: () => cardElement }
    const react = {
      ...require('react'),
      useCallback: <T>(callback: T) => callback,
      useContext: () => null,
      useMemo: create => create(),
      useEffect: install => { if (componentEffects.length === 0) componentEffects.push(install()) },
      useLayoutEffect: install => install(),
      useRef: <T>(current: T) => ({ current: current ?? marker }),
      useState(initial) {
        const index = hookIndex++
        if (!(index in state)) state[index] = initial
        return [state[index], value => { state[index] = value }]
      },
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    }
    const publishedUi = {
      isDarwinDesktop: () => document.documentElement.dataset.platform === 'darwin',
      UserMessageBubble: () => null,
      IconCopyOutlineRegular: () => null,
      IconSendOutlineRegular: () => null,
      formatQuoteText: text => text.split('\n').map(line => `> ${line}`).join('\n'),
    }
    const plugin = registration.factory(id => {
      if (id === 'react') return react
      if (id === 'react-dom') return { createPortal: child => child }
      if (id === '@deepseek-ai/dsh-client-ui-primitives') return publishedUi
      return require(id)
    })
    const openSession = { openState: 'open', pendingSubmissions: [], subagent: null }
    const binding = { sessionId: 'session', ctx: {}, session: { getSnapshot: () => openSession } }
    const submissions = []
    let submission: Promise<{ kind: string }>
    plugin.apply({
      effect: install => effects.push(install()),
      get: () => undefined,
      sessions: { binding: () => binding },
      conversation: {
        blocks: { storeFor: () => ({ subscribe: () => {}, getSnapshot: () => undefined }) },
        input: { for: () => ({ draftSnapshot: empty, state: { getSnapshot: () => empty } }) },
        sendSession: (_session, text, attachments, mode) => {
          submissions.push({ text, attachments, mode })
          return submission
        },
        releaseDraftAttachments: () => {},
      },
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
    assert.deepEqual(plugin.inject, ['slots', 'locale', 'sessions', 'conversation'])
    assert.deepEqual([...entries.keys()], ['conversation.hero.frame', 'conversation.input.right', 'conversation.chat.turnTail'])
    assert.equal(entries.get('conversation.chat.turnTail').options.locale, NS)
    assert.equal(Object.keys(dictionaries.get(NS)).length, 8)
    assert.equal(mountedStyles.size, 1)

    const composer = entries.get('conversation.input.right').component
    let running = false
    let currentDraft = draft
    function renderComposer(sessionId = 'session') {
      const render = () => {
        hookIndex = 0
        return composer({
          sessionId, t: key => key,
          useChat: select => select({ timeline: { turnOrder: ['turn'], turns: new Map([['turn', { end: { seq: 42 } }]]) } }),
          useSession: select => select({ openState: 'open', running, pendingSubmissions: [], subagent: null }),
          useAccess: () => true,
          useProjection: () => undefined,
          useInput: select => select({ ...currentDraft, queue: [] }),
        })
      }
      render()
      return render().props.children[1].props.children[0] || null
    }
    function key(type: 'keydown' | 'keyup', init: KeyboardEventInit = {}) {
      const event = Object.assign(new Event(type, { cancelable: true }), { key: '', metaKey: false, ctrlKey: false }, init)
      assert.equal(window.dispatchEvent(event), true)
    }
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    try {
      for (const [platform, desktop, mac] of [
        ['MacIntel', undefined, true], ['Win32', undefined, false],
        ['Win32', 'darwin', true], ['MacIntel', 'win32', false],
      ] as const) {
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { platform } })
        document.documentElement.dataset.platform = desktop
        const [mod, other] = mac ? ['Meta', 'Control'] : ['Control', 'Meta']
        const [primary, secondary] = mac ? ['metaKey', 'ctrlKey'] : ['ctrlKey', 'metaKey']
        assert.equal(renderComposer(), null)
        key('keydown', { key: other, [secondary]: true })
        assert.equal(renderComposer(), null)
        key('keydown', { key: mod })
        assert.equal(renderComposer()?.props['data-dsh-session-caesura-save'], '')
        key('keyup', { key: mod })
        assert.equal(renderComposer(), null)
        key('keydown', { key: 'a', [primary]: true })
        assert.equal(renderComposer()?.props['data-dsh-session-caesura-save'], '')
        for (const ineligible of [empty, { ...draft, phase: 'sending' }]) {
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
        assert.equal(state[2], false)
      }
      window.localStorage.setItem(keyOf('session'), JSON.stringify({ endSeq: 42, text: 'Previously saved' }))
      assert.equal(renderComposer().props['aria-label'], 'append')
      assert.equal(renderComposer().props.disabled, false)
      assert.equal(renderComposer('another-session'), null)
      currentDraft = empty
      assert.equal(renderComposer().props.disabled, true)
      running = true
      assert.equal(renderComposer(), null)
      currentDraft = { ...empty, attachmentIds: ['image'] }
      assert.equal(renderComposer().props.disabled, false)
      window.localStorage.removeItem(keyOf('session'))
      assert.equal(renderComposer(), null)
    } finally {
      if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
      else delete globalThis.navigator
    }

    const quoted = { ...note, text: '> A quote from the conversation\n\nMy next note', savedAt: 1_795_000_000_000 }
    window.localStorage.setItem('dsh.closing-note.session', JSON.stringify(quoted))
    const renderTail = entries.get('conversation.chat.turnTail').component
    const tailProps = {
      turn: { end: { seq: quoted.endSeq } }, sessionId: 'session', t: key => key,
      useAccess: () => true, useInput: select => select(empty),
      useSession: select => select(openSession),
    }
    function renderCard() {
      const sendable = renderTail(tailProps)
      hookIndex = 0
      const card = sendable.type(sendable.props)
      return card.type(card.props)
    }
    state.length = 0
    const section = renderCard()
    const [, stack, actions] = section.props.children
    const bubble = stack.props.children[1]
    assert.equal(bubble.type, publishedUi.UserMessageBubble)
    assert.equal(bubble.props.children, quoted.text)
    const [time, copy, rewind, send] = actions.props.children
    assert.equal(time.props.savedAt, quoted.savedAt)
    assert.equal(copy.props.children.type, publishedUi.IconCopyOutlineRegular)
    assert.equal(send.props.children.type, publishedUi.IconSendOutlineRegular)
    const undo = rewind.props.children.type()
    assert.equal(undo.type, 'svg')
    assert.deepEqual(undo.props.children.map(path => path.props.d), ['M4 10h11a5 5 0 0 1 0 10h-3', 'm9 5-5 5 5 5'])

    let reducedMotion = false
    window.matchMedia = () => ({ matches: reducedMotion })
    const motion = Promise.withResolvers<void>()
    let animations = 0
    const element = {
      inert: false, dataset: {}, ownerDocument: { activeElement: null }, querySelectorAll: () => [],
      animate() { animations++; return { finished: motion.promise } },
    }
    const tick = () => new Promise(resolve => setImmediate(resolve))
    const result = Promise.withResolvers<{ kind: string }>()
    submission = result.promise
    section.ref.current = element
    send.props.onClick({ detail: 1 })
    send.props.onClick({ detail: 1 })
    assert.equal(element.inert, true)
    assert.equal(animations, 1)
    await tick()
    assert.deepEqual(submissions, [{ text: quoted.text, attachments: [], mode: 'queue' }])
    result.resolve({ kind: 'success' })
    await tick()
    assert.ok(window.localStorage.getItem(keyOf('session')), 'fast acceptance does not cut off the exit')
    motion.resolve()
    await tick()
    assert.equal(element.dataset.sendHidden, '')
    assert.equal(window.localStorage.getItem(keyOf('session')), null)
    assert.equal(renderTail(tailProps), null)

    const raw = JSON.stringify(quoted)
    window.localStorage.setItem(keyOf('session'), raw)
    reducedMotion = true
    const rejected = Promise.withResolvers<{ kind: string }>()
    submission = rejected.promise
    const retry = renderCard()
    retry.ref.current = element
    delete element.dataset.sendHidden
    retry.props.children[2].props.children[3].props.onClick({ detail: 1 })
    assert.equal(element.dataset.sendHidden, '')
    assert.equal(animations, 1, 'reduced motion skips animation')
    rejected.resolve({ kind: 'rejected' })
    await tick()
    assert.equal(element.inert, false)
    assert.equal(element.dataset.sendHidden, undefined)
    assert.equal(window.localStorage.getItem(keyOf('session')), raw)
    assert.equal(renderCard().props.children[3].props.children, 'sendFailed')
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

test('accepts nonempty editable native drafts and guards media changes independently of text revision', () => {
  const mediaOnly = { ...empty, draftRev: 11, attachmentIds: ['image', 'file'], queue: [] }
  for (const input of [draft, { ...draft, draft: ' /goal' }, { ...draft, phase: 'claimed' }, mediaOnly,
    { ...draft, occurrences: ['chip'] }]) assert.equal(canSaveDraft(input), true)
  for (const input of [empty, { ...draft, phase: 'adjudicating' }, { ...mediaOnly, phase: 'submitting' },
    { ...draft, phase: 'sending' }]) assert.equal(canSaveDraft(input), false)
  assert.equal(emptyComposer(empty), true)
  assert.equal(emptyComposer(mediaOnly), false)
  assert.equal(sameDraft(mediaOnly, { ...mediaOnly }), true)
  assert.equal(sameDraft(mediaOnly, { ...mediaOnly, attachmentIds: ['image'] }), false)
  assert.equal(sameDraft(mediaOnly, { ...mediaOnly, attachmentIds: ['file', 'image'] }), false)
  assert.equal(sameDraft(mediaOnly, { ...mediaOnly, draftRev: 12 }), false)
})

test('appends to a legacy note, records the latest save time and notifies readers', ({ mock }) => {
  const storage = fakeStorage()
  const events = new EventTarget()
  const store = createNoteStore(() => storage, events)
  const legacy = { endSeq: 42, text: `${note.text}\r\n \t\r\n` }
  storage.setItem(keyOf('a'), JSON.stringify(legacy))
  assert.deepEqual(store.decode(store.read('a')), { ...note, ...legacy })
  let updates = 0
  const unsubscribe = store.subscribe('a', () => { updates++ })
  let now = 1_795_000_000_000
  mock.method(Date, 'now', () => now)
  store.append('a', { ...note, text: '\n\t\n  Next note' })
  const appended = { ...note, text: `${note.text}\n\n  Next note`, quotes: [], savedAt: now }
  assert.deepEqual(store.decode(store.read('a')), appended)
  now += 60_000
  store.append('a', { ...note, endSeq: 51, text: 'After another turn' })
  assert.equal(updates, 2)
  assert.deepEqual(store.decode(store.read('a')), { ...appended, endSeq: 51, text: `${appended.text}\n\nAfter another turn`, savedAt: now })
  assert.equal(store.decode(store.read('b')), null)
  const event = new Event('storage')
  Object.defineProperty(event, 'key', { value: 'dsh.closing-note.a' })
  events.dispatchEvent(event)
  assert.equal(updates, 3)
  unsubscribe()
  store.dispose()
  events.dispatchEvent(event)
  assert.equal(updates, 3)
  for (const invalid of ['{', 'null', '{"endSeq":2,"text":" "}', '{"endSeq":-1,"text":"note"}']) {
    assert.equal(store.decode(invalid), null)
  }
  for (const savedAt of [null, '2026-11-23', 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(store.decode(JSON.stringify({ ...note, savedAt })), note)
  }
})

test('preserves attachment order, quote and reference offsets, and the leading command across appends', () => {
  const storage = fakeStorage()
  const store = createNoteStore(() => storage, new EventTarget())
  const image = { id: 1, kind: 'image', name: 'test.png', type: 'image/png' }
  const file = { id: 2, kind: 'file', name: 'test.txt', type: 'text/plain' }
  const reference = { offset: 2, length: 6, source: 'file', ref: 'a.md', label: 'a.md', appearance: 'file', clipboardText: '@a.md!' }
  const summary = { label: 'Quote', title: 'Summary', body: 'first\nsecond' }
  const quote = { offset: 10, length: '> first\n> second'.length, text: summary.body, summary }
  const leading = '/goal next\n'
  store.append('a', { ...note, text: leading, command: { token: '/goal ' }, attachments: [image] })
  const firstVersion = store.read('a')
  store.append('a', { ...note, text: '\n\n@a.md!\n\n> first\n> second', references: [reference], quotes: [quote] })
  store.append('a', { ...note, text: '', attachments: [file] })
  store.remove('a', firstVersion)
  const combined = store.decode(store.read('a'))
  assert.equal(combined.text, '/goal next\n\n@a.md!\n\n> first\n> second')
  assert.deepEqual(combined.command, { token: '/goal ' })
  assert.deepEqual(combined.references, [{ ...reference, offset: leading.length + 1 }])
  assert.deepEqual(combined.quotes, [{ ...quote, offset: leading.length + 9 }])
  assert.deepEqual(combined.attachments, [image, file])
  assert.equal(store.decode(JSON.stringify({ ...combined, references: [{ ...combined.references[0], offset: 0 }] })), null)
  assert.equal(store.decode(JSON.stringify({ ...combined, attachments: [{ ...image, id: 'runtime-only' }] })), null)
  store.remove('a', store.read('a'))
  assert.equal(store.read('a'), null)
  store.dispose()
})
