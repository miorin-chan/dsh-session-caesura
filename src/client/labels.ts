const en = {
  title: 'Closing note', save: 'Save as closing note', append: 'Append to closing note', saved: 'Closing note saved',
  saveFailed: 'Could not save the note. Your draft is still in the composer.', copy: 'Copy',
  copyFailed: 'Could not copy', copied: 'Copied', send: 'Send', rewind: 'Rewind to composer',
  rewindFailed: 'The note could not be fully moved back.', emptyDraft: 'This action needs an available, empty composer',
  sendFailed: 'Could not send the closing note.', attachment: 'Attachment', attachmentUnavailable: 'Attachment unavailable',
}

export const labels: Record<'en' | 'zh' | 'ja' | 'de' | 'es' | 'fr' | 'pt' | 'ru', typeof en> = {
  en,
  zh: {
    title: '结语笔记', save: '保存为结语笔记', append: '追加到结语笔记', saved: '已保存结语笔记',
    saveFailed: '无法保存结语笔记，原稿仍在输入框', copy: '复制', copyFailed: '复制失败',
    copied: '已复制', send: '发送', rewind: '回退到输入框',
    rewindFailed: '未能完整移回结语', emptyDraft: '输入框可用且为空时可操作',
    sendFailed: '无法发送结语笔记', attachment: '附件', attachmentUnavailable: '附件不可用',
  },
  ja: {
    title: '締めくくりメモ', save: '締めくくりメモとして保存', append: '締めくくりメモに追記', saved: '締めくくりメモを保存しました',
    saveFailed: 'メモを保存できませんでした。下書きは入力欄に残っています。', copy: 'コピー', copyFailed: 'コピーできませんでした',
    copied: 'コピーしました', send: '送信', rewind: '入力欄に戻す',
    rewindFailed: 'メモを完全に戻せませんでした', emptyDraft: '入力欄が使用可能で空の場合に操作できます',
    sendFailed: '締めくくりメモを送信できませんでした', attachment: '添付ファイル', attachmentUnavailable: '添付ファイルを利用できません',
  },
  de: {
    title: 'Abschlussnotiz', save: 'Als Abschlussnotiz speichern', append: 'An Abschlussnotiz anhängen', saved: 'Abschlussnotiz gespeichert',
    saveFailed: 'Die Notiz konnte nicht gespeichert werden. Der Entwurf steht weiterhin im Eingabefeld.', copy: 'Kopieren',
    copyFailed: 'Kopieren fehlgeschlagen', copied: 'Kopiert', send: 'Senden', rewind: 'Zurück ins Eingabefeld',
    rewindFailed: 'Die Notiz konnte nicht vollständig zurückgeholt werden.', emptyDraft: 'Das Eingabefeld muss verfügbar und leer sein',
    sendFailed: 'Die Abschlussnotiz konnte nicht gesendet werden.', attachment: 'Anhang', attachmentUnavailable: 'Anhang nicht verfügbar',
  },
  es: {
    title: 'Nota de cierre', save: 'Guardar como nota de cierre', append: 'Añadir a la nota de cierre', saved: 'Nota de cierre guardada',
    saveFailed: 'No se pudo guardar la nota. El borrador sigue en el campo de texto.', copy: 'Copiar',
    copyFailed: 'No se pudo copiar', copied: 'Copiado', send: 'Enviar', rewind: 'Volver al campo de texto',
    rewindFailed: 'No se pudo mover por completo la nota.', emptyDraft: 'El campo de texto debe estar disponible y vacío',
    sendFailed: 'No se pudo enviar la nota de cierre.', attachment: 'Adjunto', attachmentUnavailable: 'Adjunto no disponible',
  },
  fr: {
    title: 'Note de fin', save: 'Enregistrer comme note de fin', append: 'Ajouter à la note de fin', saved: 'Note de fin enregistrée',
    saveFailed: 'Impossible d’enregistrer la note. Votre brouillon est toujours dans le champ de saisie.', copy: 'Copier',
    copyFailed: 'Échec de la copie', copied: 'Copié', send: 'Envoyer', rewind: 'Renvoyer dans le champ de saisie',
    rewindFailed: 'La note n’a pas pu être déplacée entièrement.', emptyDraft: 'Le champ de saisie doit être disponible et vide',
    sendFailed: 'Impossible d’envoyer la note de fin.', attachment: 'Pièce jointe', attachmentUnavailable: 'Pièce jointe indisponible',
  },
  pt: {
    title: 'Nota de encerramento', save: 'Salvar como nota de encerramento', append: 'Acrescentar à nota de encerramento', saved: 'Nota de encerramento salva',
    saveFailed: 'Não foi possível salvar a nota. O rascunho continua no campo de texto.', copy: 'Copiar',
    copyFailed: 'Não foi possível copiar', copied: 'Copiado', send: 'Enviar', rewind: 'Voltar ao campo de texto',
    rewindFailed: 'Não foi possível mover toda a nota.', emptyDraft: 'O campo de texto deve estar disponível e vazio',
    sendFailed: 'Não foi possível enviar a nota de encerramento.', attachment: 'Anexo', attachmentUnavailable: 'Anexo indisponível',
  },
  ru: {
    title: 'Заключительная заметка', save: 'Сохранить как заключительную заметку', append: 'Дополнить заключительную заметку', saved: 'Заключительная заметка сохранена',
    saveFailed: 'Не удалось сохранить заметку. Черновик остался в поле ввода.', copy: 'Копировать',
    copyFailed: 'Не удалось скопировать', copied: 'Скопировано', send: 'Отправить', rewind: 'Вернуть в поле ввода',
    rewindFailed: 'Не удалось полностью перенести заметку.', emptyDraft: 'Поле ввода должно быть доступно и пусто',
    sendFailed: 'Не удалось отправить заключительную заметку.', attachment: 'Вложение', attachmentUnavailable: 'Вложение недоступно',
  },
}
