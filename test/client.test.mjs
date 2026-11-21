import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { createNoteStore, readNote, saveDraftAsNote, submitNote } from '../lib/notes.js'

const require = createRequire(import.meta.url)
const NS = 'dsh-closing-note'
const empty = { draft: '', phase: 'plain', attachmentIds: [], occurrences: [] }
const draft = { ...empty, draft: 'For tomorrow\n  second line' }
const note = { endSeq: 42, text: draft.draft }

function fakeStorage() {
  const data = new Map()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
}

test('registers both localized slots and disposes its resources', async () => {
  let registration
  globalThis.window = Object.assign(new EventTarget(), { __ModuleLoader__: { load: entry => { registration = entry } } })
  try {
    await import('../client.js')
    assert.equal(registration.id, NS)
    const effects = []
    const entries = new Map()
    const dictionaries = new Map()
    const plugin = registration.factory(require)
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
        register: (name, labels) => {
          dictionaries.set(name, labels)
          return () => dictionaries.delete(name)
        },
      },
    })
    assert.deepEqual(plugin.inject, ['slots', 'locale'])
    assert.deepEqual([...entries.keys()], ['conversation.input.right', 'conversation.chat.turnTail'])
    assert.equal(entries.get('conversation.chat.turnTail').options.locale, NS)
    assert.equal(Object.keys(dictionaries.get(NS)).length, 8)
    effects.reverse().forEach(dispose => dispose())
    assert.equal(entries.size, 0)
    assert.equal(dictionaries.size, 0)
  } finally {
    delete globalThis.window
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

test('keeps only the latest note per session and refreshes subscribed readers', () => {
  const storage = fakeStorage()
  const events = new EventTarget()
  const store = createNoteStore(() => storage, events)
  let updates = 0
  const unsubscribe = store.subscribe('a', () => { updates++ })
  store.write('a', note)
  store.write('a', { ...note, endSeq: 51 })
  assert.equal(updates, 2)
  assert.deepEqual(readNote(store.read('a')), { ...note, endSeq: 51 })
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
})
