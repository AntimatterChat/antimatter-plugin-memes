// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

// A meme template, as the server lists them (server/memelibrary/compose.go).
export type Template = {
    name: string;
    title: string;
    aliases?: string[];
    width: number;
    height: number;

    // The template's own boxes (Drake's panels...), written after the captions.
    boxes: number;

    // Example text: the top and bottom captions when the template has no boxes, else one per box.
    example?: string[];
};

// What someone writes on a template.
export type Captions = {
    top: string;
    middle: string;
    bottom: string;
    boxes?: string[];
};

// A meme someone made.
export type Meme = Captions & {
    template: string;
    create_at?: number;
};
