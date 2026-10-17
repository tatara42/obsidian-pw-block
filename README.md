# Obsidian Password Codeblock Plugin

A password and secret codeblock plugin for [Obsidian](https://obsidian.md).

Mask sensitive passwords and tokens inside notes, protecting against shoulder-surfing and accidental exposure during screen sharing.

---

## Features

- 🔒 **Always Hidden by Default**: Code blocks formatted with `pw` or `password` are always masked as bullets (`••••••`).
- ✍️ **Hidden Even in Edit Mode**: Integrates with CodeMirror 6 to mask passwords in both **Live Preview** and **Source Mode**.
- 👁️ **Hold to Reveal**: Press and hold the eye button (`👁️`) to see the password. As soon as you release your hold, the password is immediately re-masked.
- 📱 **Mobile & Touch Friendly**: Seamlessly works on mouse clicks, touchscreens (iOS/Android), and keyboard (Space/Enter).
- 📋 **1-Click Copy**: Copy the real, unmasked password directly to your clipboard without exposing it on screen.
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

- **In Reading View & Rendered Previews**: Press and hold the eye button in the code block header to reveal the password. Releasing the hold re-masks it instantly.
- **In Edit Mode (Live Preview & Source Mode)**: Press and hold the eye button attached to the ````pw```` fence line to reveal the password while editing. Releasing re-masks it instantly.

---

## Settings

- **Mask in Reading View**: Toggle masking on/off for Reading View and rendered previews.
- **Mask in Edit View**: Toggle masking on/off for Live Preview and Source Mode.
- **Show copy button**: Show/hide the 1-click clipboard copy button.

---

## Installation

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. In Obsidian, go to **Settings** > **Community plugins** and ensure community plugins are enabled.
3. Open your vault's plugins folder (`<vault>/.obsidian/plugins/`).
4. Create a folder named `obsidian-password-codeblock-plugin`.
5. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
6. In Obsidian Settings > Community plugins, click **Reload plugins** and enable **Password Codeblock**.
