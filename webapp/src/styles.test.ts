// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const rule = (selector: string) => css.split('\n').find((l) => l.startsWith(selector + ' {')) || '';
const pixels = (line: string, prop: string) => Number(new RegExp(`(?:\\{|;)\\s*${prop}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(line)?.[1] ?? NaN);

describe('the add view fits the Fusion picker without scrolling', () => {
    // The host's drop zone gives the preview beside its button 72px.
    test('the template\'s preview stays as low as the drop zone', () => {
        expect(pixels(rule('.am-pv .ammemes-add-preview'), 'height')).toBeLessThanOrEqual(64);
        expect(pixels(rule('.am-pv .ammemes-add-preview > svg, .am-pv .ammemes-add-preview > img'), 'max-height')).toBeLessThanOrEqual(64);
    });

    test('its layout list is as low as the other fields', () => {
        expect(pixels(rule('.am-pv select'), 'height')).toBeLessThanOrEqual(32);
    });
});
