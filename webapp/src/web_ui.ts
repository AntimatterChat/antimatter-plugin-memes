// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

// Antimatter ships two web UIs: the classic one and Fusion. Under Fusion, the meme picker and dialog
// use the markup and classes of the Fusion UI (its picker and dialogs). Both UIs say
// which one is running before plugins load.

export type WebUI = 'classic' | 'fusion';

// isFusionUI returns whether the Fusion web UI is running.
export function isFusionUI(): boolean {
    return window.antimatterWebUI === 'fusion' || document.documentElement.dataset.amWebUi === 'fusion';
}

// classNames returns a function prefixing class names with am- under Fusion (its own classes) and
// ammemes- under the classic UI (this plugin's styles.css).
export function classNames(fusion: boolean) {
    const prefix = fusion ? 'am-' : 'ammemes-';
    return (...names: Array<string | false | null | undefined>) => names.filter(Boolean).map((n) => prefix + n).join(' ');
}
