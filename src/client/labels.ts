const en = {
  title: 'Closing note', save: 'Save as closing note', plainDraft: 'Enter a plain-text draft to save a note',
  saveFailed: 'Could not save the note. Your draft is still in the composer.', copy: 'Copy',
  copyFailed: 'Could not copy', copied: 'Copied', send: 'Send', emptyDraft: 'Sending requires an available, empty composer',
}

export const labels: Record<'en' | 'zh' | 'ja' | 'de' | 'es' | 'fr' | 'pt' | 'ru', typeof en> = {
  en,
  zh: {
    title: '结语笔记', save: '保存为结语笔记', plainDraft: '输入纯文本草稿后即可保存',
    saveFailed: '无法保存结语笔记，原稿仍在输入框', copy: '复制', copyFailed: '复制失败',
    copied: '已复制', send: '发送', emptyDraft: '输入框可用且为空时可以发送结语',
  },
  ja: {
    title: '締めくくりメモ', save: '締めくくりメモとして保存', plainDraft: 'テキストの下書きを入力すると保存できます',
    saveFailed: 'メモを保存できませんでした。下書きは入力欄に残っています。', copy: 'コピー', copyFailed: 'コピーできませんでした',
    copied: 'コピーしました', send: '送信', emptyDraft: '入力欄が使用可能で空の場合に送信できます',
  },
  de: {
    title: 'Abschlussnotiz', save: 'Als Abschlussnotiz speichern', plainDraft: 'Entwurf als reinen Text eingeben, um ihn zu speichern',
    saveFailed: 'Die Notiz konnte nicht gespeichert werden. Der Entwurf steht weiterhin im Eingabefeld.', copy: 'Kopieren', copyFailed: 'Kopieren fehlgeschlagen',
    copied: 'Kopiert', send: 'Senden', emptyDraft: 'Zum Senden muss das Eingabefeld verfügbar und leer sein',
  },
  es: {
    title: 'Nota de cierre', save: 'Guardar como nota de cierre', plainDraft: 'Escribe un borrador en texto plano para guardarlo',
    saveFailed: 'No se pudo guardar la nota. El borrador sigue en el campo de texto.', copy: 'Copiar', copyFailed: 'No se pudo copiar',
    copied: 'Copiado', send: 'Enviar', emptyDraft: 'Para enviar, el campo de texto debe estar disponible y vacío',
  },
  fr: {
    title: 'Note de fin', save: 'Enregistrer comme note de fin', plainDraft: 'Saisissez un brouillon en texte brut pour l’enregistrer',
    saveFailed: 'Impossible d’enregistrer la note. Votre brouillon est toujours dans le champ de saisie.', copy: 'Copier', copyFailed: 'Échec de la copie',
    copied: 'Copié', send: 'Envoyer', emptyDraft: 'Le champ de saisie doit être disponible et vide pour envoyer la note',
  },
  pt: {
    title: 'Nota de encerramento', save: 'Salvar como nota de encerramento', plainDraft: 'Digite um rascunho em texto simples para salvar',
    saveFailed: 'Não foi possível salvar a nota. O rascunho continua no campo de texto.', copy: 'Copiar', copyFailed: 'Não foi possível copiar',
    copied: 'Copiado', send: 'Enviar', emptyDraft: 'O campo de texto deve estar disponível e vazio para enviar a nota',
  },
  ru: {
    title: 'Заключительная заметка', save: 'Сохранить как заключительную заметку', plainDraft: 'Введите текст черновика, чтобы сохранить заметку',
    saveFailed: 'Не удалось сохранить заметку. Черновик остался в поле ввода.', copy: 'Копировать', copyFailed: 'Не удалось скопировать',
    copied: 'Скопировано', send: 'Отправить', emptyDraft: 'Для отправки нужно доступное и пустое поле ввода',
  },
}
