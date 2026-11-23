# Caesura

[简体中文](README.zh.md)

Save a private closing note at the end of a conversation to record your progress or what you learned
without continuing the conversation.

Supports DeepSeek Harness 0.2.2-rc.5.

After a turn finishes, enter a draft and hold Mod (Command on macOS, Ctrl on Windows and Linux).
For an eligible draft, the send button shows a quarter rest `𝄽`.
Click it or press Mod+Enter in the editor to save a closing note.
Release Mod to see the send arrow again. The plugin saves the latest note for that conversation
in this browser and shows it at the end of the corresponding turn.
The icons below the note are **Copy**, **Rewind**, and **Send**.
A check mark briefly replaces the copy icon on success.
When the composer is available and empty, Rewind moves the note back for editing and Send submits a copy.

Selected conversation quotes are saved as Markdown blockquotes.
Drafts with attachments, `@` reference chips or a leading slash stay in the normal composer.
Sending a note during generation queues it.
While recording, or when the rest is unavailable, Mod+Enter follows the composer’s usual behavior.
A highlighted completion and active input-method composition take keyboard priority.

To install from a source checkout, run `npm ci` there to build the plugin,
then select the directory in **Plugins** > **Add plugin**.
See the [project documentation](docs/README.md) for checks.
