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
	WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';

export interface PasswordCodeBlockSettings {
	enableReadingMask: boolean;
	enableEditMask: boolean;
	showCopyButton: boolean;
	// Backward compatibility
	revealOnHover?: boolean;
	autoHideDelay?: number;
	enablePasswordMasking?: boolean;
}

export const DEFAULT_SETTINGS: PasswordCodeBlockSettings = {
	enableReadingMask: true,
	enableEditMask: true,
	showCopyButton: true,
};

export const forceUpdateEffect = StateEffect.define<void>();
export const setEditorUnmaskEffect = StateEffect.define<number | null>();

class HoldEyeWidget extends WidgetType {
	constructor(
		readonly view: EditorView,
		readonly blockStart: number,
		readonly isHolding: boolean
	) {
		super();
	}

	eq(other: HoldEyeWidget): boolean {
		return (
			other.blockStart === this.blockStart &&
			other.isHolding === this.isHolding
		);
	}

	toDOM(): HTMLElement {
		const btn = document.createElement('button');
		btn.className = 'cm-password-hold-eye-btn';
		if (this.isHolding) {
			btn.classList.add('is-holding');
			setIcon(btn, 'eye-off');
			btn.setAttribute('aria-label', 'Release to hide password');
			btn.setAttribute('title', 'Release to hide password');
		} else {
			setIcon(btn, 'eye');
			btn.setAttribute('aria-label', 'Hold to see password');
			btn.setAttribute('title', 'Hold to see password');
		}

		let holding = this.isHolding;

		const startHold = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			if (holding) return;
			holding = true;
			this.view.dispatch({
				effects: setEditorUnmaskEffect.of(this.blockStart),
			});
		};

		const endHold = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			if (!holding) return;
			holding = false;
			this.view.dispatch({
				effects: setEditorUnmaskEffect.of(null),
			});
		};

		btn.addEventListener('pointerdown', startHold);
		btn.addEventListener('pointerup', endHold);
		btn.addEventListener('pointerleave', endHold);
		btn.addEventListener('pointercancel', endHold);

		btn.addEventListener('keydown', (e: KeyboardEvent) => {
			if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
				startHold(e);
			}
		});
		btn.addEventListener('keyup', (e: KeyboardEvent) => {
			if (e.key === ' ' || e.key === 'Enter') {
				endHold(e);
			}
		});
		btn.addEventListener('blur', endHold);
		btn.addEventListener('contextmenu', (e) => e.preventDefault());

		return btn;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

function buildPasswordDecorations(
	view: EditorView,
	plugin: PasswordCodeBlockPlugin,
	unmaskedBlockStart: number | null
): DecorationSet {
	if (!plugin.settings.enableEditMask) {
		return Decoration.none;
	}

	const doc = view.state.doc;
	const docText = doc.toString();
	const regex = /^([ \t]*(`{3,}|~{3,}))[ \t]*(?:pw|password)\b[^\r\n]*\r?\n([\s\S]*?)(^\1[ \t]*$)/gim;

	const lineDeco = Decoration.line({ class: 'cm-password-line' });
	const markDecoMasked = Decoration.mark({ class: 'cm-password-masked' });
	const markDecoUnmasked = Decoration.mark({ class: 'cm-password-unmasked' });

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

		const isBlockUnmasked = unmaskedBlockStart === contentStart;
		const openingFenceLine = doc.lineAt(fullStart);
		let widgetAdded = false;

		for (const range of view.visibleRanges) {
			if (fullEnd < range.from || fullStart > range.to) {
				continue;
			}

			if (
				!widgetAdded &&
				openingFenceLine.from <= range.to &&
				openingFenceLine.to >= range.from
			) {
				builder.add(
					openingFenceLine.to,
					openingFenceLine.to,
					Decoration.widget({
						widget: new HoldEyeWidget(
							view,
							contentStart,
							isBlockUnmasked
						),
						side: 1,
					})
				);
				widgetAdded = true;
			}

			const visibleStart = Math.max(contentStart, range.from);
			const visibleEnd = Math.min(contentEnd, range.to);

			if (visibleStart <= visibleEnd) {
				const startLine = doc.lineAt(visibleStart);
				const endLine = doc.lineAt(visibleEnd);
				const activeMark = isBlockUnmasked
					? markDecoUnmasked
					: markDecoMasked;

				for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo++) {
					if (lineNo <= lastLineDecorated) continue;
					lastLineDecorated = lineNo;

					const line = doc.line(lineNo);
					builder.add(line.from, line.from, lineDeco);
					if (line.to > line.from) {
						builder.add(line.from, line.to, activeMark);
					}
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
			unmaskedBlockStart: number | null = null;

			constructor(readonly view: EditorView) {
				this.decorations = buildPasswordDecorations(
					view,
					plugin,
					this.unmaskedBlockStart
				);
			}

			update(update: ViewUpdate) {
				let needsRebuild = update.docChanged || update.viewportChanged;

				for (const tr of update.transactions) {
					for (const effect of tr.effects) {
						if (effect.is(setEditorUnmaskEffect)) {
							this.unmaskedBlockStart = effect.value;
							needsRebuild = true;
						}
						if (effect.is(forceUpdateEffect)) {
							needsRebuild = true;
						}
					}
				}

				if (needsRebuild) {
					this.decorations = buildPasswordDecorations(
						update.view,
						plugin,
						this.unmaskedBlockStart
					);
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

		this.registerEditorExtension(createPasswordViewPlugin(this));

		const renderBlock = (source: string, el: HTMLElement) => {
			this.renderPasswordBlock(source, el);
		};

		this.registerMarkdownCodeBlockProcessor('pw', renderBlock);
		this.registerMarkdownCodeBlockProcessor('password', renderBlock);

		this.addSettingTab(new PasswordCodeBlockSettingTab(this.app, this));
	}

	onunload() {}

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

		const header = container.createDiv({ cls: 'password-codeblock-header' });

		const label = header.createDiv({ cls: 'password-codeblock-label' });
		const lockIcon = label.createSpan({ cls: 'password-codeblock-icon' });
		setIcon(lockIcon, 'lock');
		label.createSpan({ text: 'Password', cls: 'password-codeblock-title' });

		const actions = header.createDiv({ cls: 'password-codeblock-actions' });

		const pre = container.createEl('pre', { cls: 'password-codeblock-pre' });
		const code = pre.createEl('code', { cls: 'password-codeblock-code' });
		if (this.settings.enableReadingMask) {
			code.addClass('is-masked');
		}
		code.setText(source.trimEnd());

		let isHolding = false;
		let safetyTimer: number | null = null;

		const startHold = (e: Event) => {
			e.preventDefault();
			if (isHolding) return;
			isHolding = true;
			code.addClass('is-unmasked');
			revealBtn.addClass('is-holding');
			setIcon(revealBtn, 'eye-off');
			revealBtn.setAttribute('aria-label', 'Release to hide password');
			revealBtn.setAttribute('title', 'Release to hide password');

			if (safetyTimer !== null) {
				window.clearTimeout(safetyTimer);
			}
			safetyTimer = window.setTimeout(() => {
				endHold();
			}, 30000);
		};

		const endHold = (e?: Event) => {
			if (e) e.preventDefault();
			if (!isHolding) return;
			isHolding = false;
			if (safetyTimer !== null) {
				window.clearTimeout(safetyTimer);
				safetyTimer = null;
			}
			code.removeClass('is-unmasked');
			revealBtn.removeClass('is-holding');
			setIcon(revealBtn, 'eye');
			revealBtn.setAttribute('aria-label', 'Hold to see password');
			revealBtn.setAttribute('title', 'Hold to see password');
		};

		const revealBtn = actions.createEl('button', {
			cls: 'password-codeblock-btn password-reveal-btn',
			attr: {
				'aria-label': 'Hold to see password',
				title: 'Hold to see password',
			},
		});
		setIcon(revealBtn, 'eye');

		revealBtn.addEventListener('pointerdown', startHold);
		revealBtn.addEventListener('pointerup', endHold);
		revealBtn.addEventListener('pointerleave', endHold);
		revealBtn.addEventListener('pointercancel', endHold);

		revealBtn.addEventListener('keydown', (e: KeyboardEvent) => {
			if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
				startHold(e);
			}
		});
		revealBtn.addEventListener('keyup', (e: KeyboardEvent) => {
			if (e.key === ' ' || e.key === 'Enter') {
				endHold(e);
			}
		});
		revealBtn.addEventListener('blur', () => endHold());
		revealBtn.addEventListener('contextmenu', (e) => e.preventDefault());

		if (this.settings.showCopyButton) {
			const copyBtn = actions.createEl('button', {
				cls: 'password-codeblock-btn password-copy-btn',
				attr: {
					'aria-label': 'Copy password',
					title: 'Copy password',
				},
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
			.setDesc(
				'Always mask password codeblocks in Reading View and rendered previews. Hold the eye icon to see.'
			)
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
			.setDesc(
				'Always mask passwords in Edit Mode (Live Preview and Source Mode). Hold the eye icon next to ```pw to see.'
			)
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
	}
}