import type { ComposerAttachment } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { NoteAttachment } from '../lib/notes.js'

// Store browser Files rather than object URLs or upload receipts, which expire.
const databaseName = 'dsh-session-caesura'
const storeName = 'attachments'

function resultOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const opening = indexedDB.open(databaseName, 1)
  opening.onupgradeneeded = () => opening.result.createObjectStore(storeName, { autoIncrement: true })
  const database = await resultOf(opening)
  try {
    const tx = database.transaction(storeName, mode)
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
    })
    const [result] = await Promise.all([run(tx.objectStore(storeName)), committed])
    return result
  } finally {
    database.close()
  }
}

export function storeMedia(attachments: readonly ComposerAttachment[]): Promise<readonly NoteAttachment[]> {
  if (attachments.length === 0) return Promise.resolve([])
  return transaction('readwrite', store => Promise.all(attachments.map(async ({ kind, file }) => {
    const id = Number(await resultOf(store.add(file)))
    return { id, kind, name: file.name, type: file.type }
  })))
}

export function loadMedia(attachments: readonly NoteAttachment[]): Promise<readonly (File | undefined)[]> {
  if (attachments.length === 0) return Promise.resolve([])
  return transaction('readonly', store => Promise.all(attachments.map(async attachment => {
    const file: unknown = await resultOf(store.get(attachment.id))
    return file instanceof File ? file : undefined
  })))
}

export async function removeMedia(attachments: readonly NoteAttachment[]): Promise<void> {
  if (attachments.length === 0) return
  await transaction('readwrite', store => Promise.all(attachments.map(attachment => resultOf(store.delete(attachment.id)))))
}

export async function requireMedia(attachments: readonly NoteAttachment[]): Promise<readonly File[]> {
  const files = await loadMedia(attachments)
  return files.map(file => {
    if (file === undefined) throw new Error('Closing note attachment is unavailable')
    return file
  })
}
