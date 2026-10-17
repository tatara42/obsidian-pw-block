import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	setIcon,
} from 'obsidian';
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';

export interface PasswordCodeBlockSettings {
	enableReadingMask: boolean;
	enableEditMask: boolean;
	revealOnHover: boolean;
	showCopyButton: boolean;
	autoHideDelay: number;
	// Backward compatibility with v1.0.0/1.0.1
	enablePasswordMasking?: boolean;
}

export const DEFAULT_SETTINGS: PasswordCodeBlockSettings = {
	enableReadingMask: true,
	enableEditMask: true,
	revealOnHover: true,
	showCopyButton: true,
	autoHideDelay: 5,
};

export const forceUpdateEffect = StateEffect.define<void>();

function buildPasswordDecorations(
	view: EditorView,
	plugin: PasswordCodeBlockPlugin
): DecorationSet {
	if (!plugin.settings.enableEditMask) {
		return Decoration.none;
	}

	const doc = view.state.doc;
	const docText = doc.toString();
	const regex = /^([ \t]*(`{3,}|~{3,}))[ \t]*(?:pw|password)\b[^\r\n]*\r?\n([\s\S]*?)(^\1[ \t]*$)/gim;

	const lineDeco = Decoration.line({ class: 'cm-password-line' });
	const markDeco = Decoration.mark({ class: 'cm-password-masked' });

	const builder = new RangeSetBuilder<Decoration>();
	let lastLineDecorated = -1;

	let match: RegExpExecArray | null;
	while ((match = regex.exec(docText)) !== null) {
		const fullStart = match.index;
		const fullEnd = match.index + match[0].length;

		const firstNewline = docText.indexOf('\n', fullStart);
		if (firstNewline === -1) continue;
		const contentStart = firstNewline + 1;

		const lastNewline = docText.lastIndexOf('\n', fullEnd - 1);
		if (lastNewline === -1) continue;
		let contentEnd = lastNewline;
		if (contentEnd > contentStart && docText[contentEnd - 1] === '\r') {
			contentEnd--;
		}

		if (contentEnd <= contentStart) continue;

		for (const range of view.visibleRanges) {
			if (contentEnd < range.from || contentStart > range.to) {
				continue;
			}

			const visibleStart = Math.max(contentStart, range.from);
			const visibleEnd = Math.min(contentEnd, range.to);

			const startLine = doc.lineAt(visibleStart);
			const endLine = doc.lineAt(visibleEnd);

			for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo++) {
				if (lineNo <= lastLineDecorated) continue;
				lastLineDecorated = lineNo;

				const line = doc.line(lineNo);
				builder.add(line.from, line.from, lineDeco);
				if (line.to > line.from) {
					builder.add(line.from, line.to, markDeco);
				}
			}
		}
	}

	return builder.finish();
}

function createPasswordViewPlugin(plugin: PasswordCodeBlockPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildPasswordDecorations(view, plugin);
			}

			update(update: ViewUpdate) {
				const hasForceUpdate = update.transactions.some((tr) =>
					tr.effects.some((e) => e.is(forceUpdateEffect))
				);
				if (update.docChanged || update.viewportChanged || hasForceUpdate) {
					this.decorations = buildPasswordDecorations(update.view, plugin);
				}
			}
		},
		{
			decorations: (v) => v.decorations,
		}
	);
}

export default class PasswordCodeBlockPlugin extends Plugin {
	settings: PasswordCodeBlockSettings;

	async onload() {
		await this.loadSettings();

		document.body.toggleClass('pw-reveal-on-hover', this.settings.revealOnHover);

		this.registerEditorExtension(createPasswordViewPlugin(this));

		const renderBlock = (source: string, el: HTMLElement) => {
			this.renderPasswordBlock(source, el);
		};

		this.registerMarkdownCodeBlockProcessor('pw', renderBlock);
		this.registerMarkdownCodeBlockProcessor('password', renderBlock);

		this.addSettingTab(new PasswordCodeBlockSettingTab(this.app, this));
	}

	onunload() {
		document.body.removeClass('pw-reveal-on-hover');
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

		// Backward compatibility for existing users
		if (loadedData && typeof loadedData.enablePasswordMasking === 'boolean') {
			this.settings.enableReadingMask = loadedData.enablePasswordMasking;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	applySettingsUpdate() {
		document.body.toggleClass('pw-reveal-on-hover', this.settings.revealOnHover);
		this.refreshActiveMarkdownView();
		this.refreshEditorViews();
	}

	refreshActiveMarkdownView() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			activeView.previewMode.rerender(true);
		}
	}

	refreshEditorViews() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				// @ts-ignore
				const cm = leaf.view.editor?.cm as EditorView | undefined;
				if (cm && typeof cm.dispatch === 'function') {
					cm.dispatch({
						effects: forceUpdateEffect.of(),
					});
				}
			}
		});
	}

	renderPasswordBlock(source: string, el: HTMLElement) {
		const container = el.createDiv({
			cls: 'password-codeblock-container',
		});

		if (this.settings.revealOnHover) {
			container.addClass('reveal-on-hover');
		}

		const header = container.createDiv({ cls: 'password-codeblock-header' });

		const label = header.createDiv({ cls: 'password-codeblock-label' });
		const lockIcon = label.createSpan({ cls: 'password-codeblock-icon' });
		setIcon(lockIcon, 'lock');
		label.createSpan({ text: 'Password', cls: 'password-codeblock-title' });

		const actions = header.createDiv({ cls: 'password-codeblock-actions' });

		let isExplicitlyUnmasked = false;
		let autoHideTimer: number | null = null;

		const pre = container.createEl('pre', { cls: 'password-codeblock-pre' });
		const code = pre.createEl('code', { cls: 'password-codeblock-code' });
		if (this.settings.enableReadingMask) {
			code.addClass('is-masked');
		}
		code.setText(source.trimEnd());

		const updateRevealState = (unmasked: boolean) => {
			isExplicitlyUnmasked = unmasked;
			if (autoHideTimer !== null) {
				window.clearTimeout(autoHideTimer);
				autoHideTimer = null;
			}

			if (isExplicitlyUnmasked) {
				code.addClass('is-unmasked');
				setIcon(revealBtn, 'eye-off');
				revealBtn.setAttribute('aria-label', 'Hide password');
				revealBtn.setAttribute('title', 'Hide password');

				if (this.settings.autoHideDelay > 0) {
					autoHideTimer = window.setTimeout(() => {
						updateRevealState(false);
					}, this.settings.autoHideDelay * 1000);
				}
			} else {
				code.removeClass('is-unmasked');
				setIcon(revealBtn, 'eye');
				revealBtn.setAttribute('aria-label', 'Show password');
				revealBtn.setAttribute('title', 'Show password');
			}
		};

		const revealBtn = actions.createEl('button', {
			cls: 'password-codeblock-btn password-reveal-btn',
			attr: { 'aria-label': 'Show password', 'title': 'Show password' },
		});
		setIcon(revealBtn, 'eye');
		revealBtn.addEventListener('click', (e) => {
			e.preventDefault();
			updateRevealState(!isExplicitlyUnmasked);
		});

		if (this.settings.showCopyButton) {
			const copyBtn = actions.createEl('button', {
				cls: 'password-codeblock-btn password-copy-btn',
				attr: { 'aria-label': 'Copy password', 'title': 'Copy password' },
			});
			setIcon(copyBtn, 'copy');
			copyBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				try {
					await navigator.clipboard.writeText(source.trim());
					setIcon(copyBtn, 'check');
					new Notice('Password copied to clipboard');
					window.setTimeout(() => {
						setIcon(copyBtn, 'copy');
					}, 1500);
				} catch (err) {
					new Notice('Failed to copy password');
				}
			});
		}
	}
}

class PasswordCodeBlockSettingTab extends PluginSettingTab {
	plugin: PasswordCodeBlockPlugin;

	constructor(app: App, plugin: PasswordCodeBlockPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Mask in Reading View')
			.setDesc('Mask password codeblocks in Reading View and rendered previews.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableReadingMask)
					.onChange(async (value) => {
						this.plugin.settings.enableReadingMask = value;
						await this.plugin.saveSettings();
						this.plugin.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName('Mask in Edit View')
			.setDesc('Mask passwords in Edit Mode (Live Preview and Source Mode).')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableEditMask)
					.onChange(async (value) => {
						this.plugin.settings.enableEditMask = value;
						await this.plugin.saveSettings();
						this.plugin.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName('Reveal on hover')
			.setDesc('Temporarily unmask the password when the mouse hovers over it.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.revealOnHover)
					.onChange(async (value) => {
						this.plugin.settings.revealOnHover = value;
						await this.plugin.saveSettings();
						this.plugin.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName('Show copy button')
			.setDesc('Display a 1-click copy button on rendered password blocks.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCopyButton)
					.onChange(async (value) => {
						this.plugin.settings.showCopyButton = value;
						await this.plugin.saveSettings();
						this.plugin.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName('Auto-hide timeout')
			.setDesc(
				'Automatically re-mask the password after this many seconds when toggled visible (0 to disable).'
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 30, 1)
					.setValue(this.plugin.settings.autoHideDelay)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.autoHideDelay = value;
						await this.plugin.saveSettings();
					})
			);
	}
}