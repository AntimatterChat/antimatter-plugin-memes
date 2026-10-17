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

    // The captions a custom template takes, in order (all three when absent).
    captions?: CaptionKey[];

    // The search keywords of a custom template.
    keywords?: string[];

    // Whether people added the template, and whether the user can delete it (its creator or a
    // system admin).
    custom?: boolean;
    can_delete?: boolean;

    // The creation time of a custom template, for the caches of its images.
    version?: number;

    // Who added a custom template, and when (ms).
    creator_id?: string;
    create_at?: number;
};

export type CaptionKey = 'top' | 'middle' | 'bottom';

// The caption layouts of custom templates.
export type Layout = 'top-bottom' | 'top' | 'bottom' | 'top-middle-bottom';

// What the webapp needs to know of the plugin's settings.
export type Config = {
    can_add: boolean;
    max_file_size: number;

    // Whether custom templates are on, and whether the user may delete others' (a system admin).
    // Older servers leave them out: custom templates are on there.
    custom_templates?: boolean;
    can_delete_others?: boolean;
};

// A template to add.
export type NewTemplate = {
    file: File;
    title: string;
    keywords: string;
    layout: Layout;
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
