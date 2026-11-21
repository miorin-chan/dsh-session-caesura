# Closing note

[简体中文](README.zh.md)

Save a private closing note at the end of an idle conversation in DeepSeek Harness 0.2.2-rc.5.

After a turn finishes, enter a draft and click the quarter rest `𝄽` next to Send. The plugin saves the
latest note for that conversation in this browser and shows it at the end of the corresponding turn.
Use **Copy** or **Send** below the note. Send submits a copy through the normal composer when it is available and empty.

Selected conversation quotes are saved as Markdown blockquotes. Drafts with attachments, `@` reference
chips or a leading slash stay in the normal composer. Sending a note during generation queues it.
Plain Enter and the built-in Send button keep their regular behavior.

Install this directory in **Plugins** > **Add plugin**. See the [project documentation](docs/README.md) for checks.
