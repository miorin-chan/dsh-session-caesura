# Caesura

[简体中文](README.zh.md)

Save a private closing note at the end of a conversation to record your progress or what you learned
without continuing the conversation.

Supports DeepSeek Harness 0.2.2-rc.5.

After a turn finishes, hold Mod (Command on macOS, Ctrl on Windows and Linux).
With a draft in the composer, click the quarter rest `𝄽` or press Mod+Enter to save the first closing note.
Once the conversation has a note, the rest stays in the send position.
Click it or press Enter to append.
Each append updates the save time, and text paragraphs are separated by a blank line.
The note appears at the end of the turn where it was last saved, below the reply's action row in browsers
that support CSS `reading-flow`.

The note keeps text, `@` reference chips, quotes, and files, including attachment-only drafts.
Images have previews, audio and video use browser playback, and files can be downloaded.
The note and its attachments are stored in this browser.

The note shows the last save time in your local time zone beside **Copy**, **Rewind**, and **Send**.
Copy takes the text and briefly shows a check mark.
When the composer is available and empty, Rewind moves the full note back for editing.
Send submits a copy as a message, including any leading slash text.
During generation it queues the message. Shift+Enter inserts a line break.
A highlighted completion and active input-method composition take keyboard priority.
The primary Stop and Continue actions are available when the turn needs them.

To install from a source checkout, run `npm ci` there to build the plugin,
then select the directory in **Plugins** > **Add plugin**.
See the [project documentation](docs/README.md) for checks.
