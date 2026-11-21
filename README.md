# Caesura

[简体中文](README.zh.md)

Save a private closing note at the end of a conversation to record your progress or what you learned
without continuing the conversation.

Supports DeepSeek Harness 0.2.2-rc.5.

After a turn finishes, enter a draft and hold Mod (Command on macOS, Ctrl on Windows and Linux).
Click the quarter rest `𝄽` that appears next to Send.
Release Mod to hide the rest. The plugin saves the latest note for that conversation
in this browser and shows it at the end of the corresponding turn.
The icons below the note are **Copy**, **Rewind**, and **Send**.
A check mark briefly replaces the copy icon on success.
When the composer is available and empty, Rewind moves the note back for editing and Send submits a copy.

Selected conversation quotes are saved as Markdown blockquotes.
Drafts with attachments, `@` reference chips or a leading slash stay in the normal composer.
Sending a note during generation queues it.
Plain Enter and the built-in Send button keep their regular behavior.

Install this directory in **Plugins** > **Add plugin**.
See the [project documentation](docs/README.md) for checks.
