// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {fontURL} from './client';
import type {CaptionKey} from './types/memes';

// The browser's preview of a template being added lays its captions out as the server will draw
// them (server/memelibrary/compose.go and server/meme/text_slot.go), with the metrics of their
// font, Anton: its ascent and descent, and the average advance of its capitals, in ems.
const ASCENT = 1.138;
const DESCENT = 0.329;
const ADVANCE = 0.46;
const MAX_FONT_SIZE = 80;

// The largest side of a template: the server scales larger images down.
export const MAX_SIDE = 1024;

// The font of the captions, under this name once loaded.
export const CAPTION_FONT = "'AmMemes Anton', Impact, 'Arial Narrow', sans-serif";

// fitSize returns the size of a template made of an image, as the server scales it.
export function fitSize(width: number, height: number) {
    if (width <= MAX_SIDE && height <= MAX_SIDE) {
        return {width, height};
    }
    if (width >= height) {
        return {width: MAX_SIDE, height: Math.max(1, Math.floor((height * MAX_SIDE) / width))};
    }
    return {width: Math.max(1, Math.floor((width * MAX_SIDE) / height)), height: MAX_SIDE};
}

// The band of the image a caption goes in.
function band(key: CaptionKey, w: number, h: number) {
    const padding = Math.floor(h / 20);
    switch (key) {
    case 'top':
        return {x0: padding, y0: padding, x1: w - padding, y1: Math.floor(h / 4)};
    case 'middle':
        return {x0: padding, y0: Math.floor((h * 3) / 8), x1: w - padding, y1: Math.floor((h * 5) / 8)};
    default:
        return {x0: padding, y0: Math.floor((h * 3) / 4), x1: w - padding, y1: h - padding};
    }
}

// wrap breaks a text into the lines fitting a width, between words.
function wrap(text: string, size: number, width: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && next.length * ADVANCE * size > width) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) {
        lines.push(line);
    }
    return lines;
}

export type CaptionLine = {text: string; x: number; y: number};

// layoutCaption places a caption on a template of a size: its font size, and its lines'
// baselines, centred in its band.
export function layoutCaption(text: string, key: CaptionKey, w: number, h: number): {size: number; lines: CaptionLine[]} | null {
    const b = band(key, w, h);
    const bandHeight = b.y1 - b.y0;
    for (let size = MAX_FONT_SIZE; size >= 6; size -= (size + 9) / 10) {
        const lineHeight = Math.floor((ASCENT + DESCENT) * size);
        const lines = wrap(text, size, b.x1 - b.x0);
        if (lines.length > Math.floor(bandHeight / lineHeight)) {
            continue;
        }
        const total = lineHeight * lines.length;
        let y = b.y0;
        if (key === 'middle') {
            y += (bandHeight - total) / 2;
        } else if (key === 'bottom') {
            y += bandHeight - total;
        }
        return {
            size,
            lines: lines.map((line) => {
                // The server's baseline: a line's height below its top
                y += lineHeight;
                return {text: line, x: (b.x0 + b.x1) / 2, y};
            }),
        };
    }
    return null;
}

let fontLoading: Promise<unknown> | null = null;

// loadCaptionFont loads the font of the captions from the server, once.
export function loadCaptionFont() {
    if (!fontLoading && typeof FontFace !== 'undefined' && document.fonts) {
        const face = new FontFace('AmMemes Anton', `url(${fontURL()})`);
        fontLoading = face.load().then((f) => document.fonts.add(f), () => null);
    }
    return fontLoading;
}
