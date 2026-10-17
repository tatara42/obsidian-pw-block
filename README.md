# Obsidian Password Codeblock Plugin

A password and secret codeblock plugin for [Obsidian](https://obsidian.md).

Mask sensitive passwords and tokens inside notes, protecting against shoulder-surfing and accidental exposure during screen sharing.

---

## Features

- 🔒 **Visual Masking in Reading View**: Code blocks formatted with `pw` or `password` are masked as bullets (`••••••`).
- ✍️ **Hidden Even in Edit Mode**: Integrates with CodeMirror 6 to mask passwords in both **Live Preview** and **Source Mode**.
- 👁️ **Hover-to-Reveal**: Hover mouse over the code block or editor line to temporarily reveal the plaintext password.
- 📱 **Click / Tap to Reveal**: Toggle visibility on touch devices (iOS/Android) with an eye icon button, complete with optional auto-hide timeout.
- 📋 **1-Click Copy**: Copy the real, unmasked password directly to your clipboard.
- 🎨 **Theme-Native**: Built with Obsidian design tokens for light and dark themes.

---

## Usage

Create a code block with language identifier `pw` or `password`:

````markdown
```pw
mySuperSecretPassword123
```
````

or multiline secrets:

````markdown
```password
API_KEY=sk_test_1234567890abcdef
DATABASE_URL=postgres://user:pass@localhost:5432/db
```
````

---

## Settings

- **Mask in Reading View**: Toggle masking on/off for Reading View and rendered previews.
- **Mask in Edit View**: Toggle masking on/off for Live Preview and Source Mode.
- **Reveal on hover**: Temporarily unmask the password when hovered with the mouse.
- **Show copy button**: Show/hide the 1-click clipboard copy button.
- **Auto-hide timeout**: Set the duration in seconds before a revealed password automatically re-masks (0 to disable).

---

## Installation

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. In Obsidian, go to **Settings** > **Community plugins** and ensure community plugins are enabled.
3. Open your vault's plugins folder (`<vault>/.obsidian/plugins/`).
4. Create a folder named `obsidian-password-codeblock-plugin`.
5. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
6. In Obsidian Settings > Community plugins, click **Reload plugins** and enable **Password Codeblock**.
