const en = {
  title: 'Closing note', save: 'Save as closing note',
  saveFailed: 'Could not save the note. Your draft is still in the composer.', copy: 'Copy',
  copyFailed: 'Could not copy', copied: 'Copied', send: 'Send', rewind: 'Rewind to composer',
    rewindFailed: 'The note could not be fully moved back.', emptyDraft: 'This action needs an available, empty composer',
}

export const labels: Record<'en' | 'zh' | 'ja' | 'de' | 'es' | 'fr' | 'pt' | 'ru', typeof en> = {
  en,
  zh: {
    title: '结语笔记', save: '保存为结语笔记',
    saveFailed: '无法保存结语笔记，原稿仍在输入框', copy: '复制', copyFailed: '复制失败',
    copied: '已复制', send: '发送', rewind: '回退到输入框',
    rewindFailed: '未能完整移回结语', emptyDraft: '输入框可用且为空时可操作',
  },
  ja: {
    title: '締めくくりメモ', save: '締めくくりメモとして保存',
    saveFailed: 'メモを保存できませんでした。下書きは入力欄に残っています。', copy: 'コピー', copyFailed: 'コピーできませんでした',
    copied: 'コピーしました', send: '送信', rewind: '入力欄に戻す',
    rewindFailed: 'メモを完全に戻せませんでした', emptyDraft: '入力欄が使用可能で空の場合に操作できます',
  },
  de: {
    title: 'Abschlussnotiz', save: 'Als Abschlussnotiz speichern',
    saveFailed: 'Die Notiz konnte nicht gespeichert werden. Der Entwurf steht weiterhin im Eingabefeld.', copy: 'Kopieren', copyFailed: 'Kopieren fehlgeschlagen',
    copied: 'Kopiert', send: 'Senden', rewind: 'Zurück ins Eingabefeld',
    rewindFailed: 'Die Notiz konnte nicht vollständig zurückgeholt werden.', emptyDraft: 'Das Eingabefeld muss verfügbar und leer sein',
  },
  es: {
    title: 'Nota de cierre', save: 'Guardar como nota de cierre',
    saveFailed: 'No se pudo guardar la nota. El borrador sigue en el campo de texto.', copy: 'Copiar', copyFailed: 'No se pudo copiar',
    copied: 'Copiado', send: 'Enviar', rewind: 'Volver al campo de texto',
    rewindFailed: 'No se pudo mover por completo la nota.', emptyDraft: 'El campo de texto debe estar disponible y vacío',
  },
  fr: {
    title: 'Note de fin', save: 'Enregistrer comme note de fin',
    saveFailed: 'Impossible d’enregistrer la note. Votre brouillon est toujours dans le champ de saisie.', copy: 'Copier', copyFailed: 'Échec de la copie',
    copied: 'Copié', send: 'Envoyer', rewind: 'Renvoyer dans le champ de saisie',
    rewindFailed: 'La note n’a pas pu être déplacée entièrement.', emptyDraft: 'Le champ de saisie doit être disponible et vide',
  },
  pt: {
    title: 'Nota de encerramento', save: 'Salvar como nota de encerramento',
    saveFailed: 'Não foi possível salvar a nota. O rascunho continua no campo de texto.', copy: 'Copiar', copyFailed: 'Não foi possível copiar',
    copied: 'Copiado', send: 'Enviar', rewind: 'Voltar ao campo de texto',
    rewindFailed: 'Não foi possível mover toda a nota.', emptyDraft: 'O campo de texto deve estar disponível e vazio',
  },
  ru: {
    title: 'Заключительная заметка', save: 'Сохранить как заключительную заметку',
    saveFailed: 'Не удалось сохранить заметку. Черновик остался в поле ввода.', copy: 'Копировать', copyFailed: 'Не удалось скопировать',
    copied: 'Скопировано', send: 'Отправить', rewind: 'Вернуть в поле ввода',
    rewindFailed: 'Не удалось полностью перенести заметку.', emptyDraft: 'Поле ввода должно быть доступно и пусто',
  },
}
