import { useEffect, useState } from 'react'
// DSH 0.2.2-rc.5, @deepseek-ai/dsh-client-ui-primitives src/index.ts.
import { FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { NoteAttachment } from '../lib/notes.js'
import { loadMedia } from './media.js'

export function NoteMedia({ attachments, t, renderFactorySlot }: PropsRenderFactories & PropsLocale<'dsh-session-caesura'>
  & { attachments: readonly NoteAttachment[] }) {
  const [urls, setUrls] = useState<readonly (string | undefined)[]>()
  useEffect(() => {
    let active = true
    let created: readonly (string | undefined)[] = []
    void loadMedia(attachments).then(files => {
      if (!active) return
      created = files.map(file => file === undefined ? undefined : URL.createObjectURL(file))
      setUrls(created)
    }).catch(() => { if (active) setUrls([]) })
    return () => {
      active = false
      for (const url of created) if (url !== undefined) URL.revokeObjectURL(url)
    }
  }, [attachments])

  return <div className="dsh-cn-media">
    {attachments.map(({ id, name, kind, type }, index) => {
      const url = urls?.[index]
      const label = name || t('attachment')
      const download = <a className="dsh-cn-file" href={url} download={name || true}>
        <FileTypeIcon path={name} size={20} aria-hidden="true" /><span>{label}</span>
      </a>
      if (url === undefined) return <div key={id} className="dsh-cn-file">
        <FileTypeIcon path={name} size={20} aria-hidden="true" /><span>{label}</span>
        {urls !== undefined && <span className="dsh-cn-status">{t('attachmentUnavailable')}</span>}
      </div>
      if (kind === 'image') return <div key={id} className="dsh-cn-image">
        {renderFactorySlot('conversation.images.content', {
          images: [{ preview: { url, name: label } }], loadImage: async () => url, align: 'end', compact: true,
        }, { fallback: <a href={url} download={name || true}><img src={url} alt={label} /></a> })}
      </div>
      return <div key={id} className="dsh-cn-media-item">
        {type.startsWith('audio/') && <audio src={url} aria-label={label} controls preload="metadata" />}
        {type.startsWith('video/') && <video src={url} aria-label={label} controls preload="metadata" />}
        {download}
      </div>
    })}
  </div>
}
