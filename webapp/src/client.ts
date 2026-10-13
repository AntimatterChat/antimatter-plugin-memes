// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {Client4} from 'mattermost-redux/client';

import manifest from './manifest';
import type {Captions, Config, Meme, NewTemplate, Template} from './types/memes';

export class ClientError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

function pluginURL(path: string) {
    return `${window.basename || ''}/plugins/${manifest.id}${path}`;
}

function apiURL(path: string, params?: URLSearchParams) {
    const qs = params?.toString();
    return pluginURL(`/api/v1${path}${qs ? '?' + qs : ''}`);
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const options: {method: string; body?: string | FormData} = {method};
    if (body instanceof FormData) {
        // Client4 lets the browser set the multipart type and its boundary.
        options.body = body;
    } else if (typeof body !== 'undefined') {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, Client4.getOptions(options));
    if (!response.ok) {
        let message = response.statusText;
        try {
            const data = await response.json();
            message = data.error || message;
        } catch {
            // Not JSON
        }
        throw new ClientError(message, response.status);
    }
    return response.json();
}

export function getTemplates() {
    return request<Template[]>('GET', apiURL('/templates'));
}

export function getConfig() {
    return request<Config>('GET', apiURL('/config'));
}

export function addTemplate({file, title, keywords, layout}: NewTemplate) {
    const form = new FormData();
    form.append('title', title);
    form.append('keywords', keywords);
    form.append('layout', layout);
    form.append('file', file, file.name);
    return request<Template>('POST', apiURL('/templates'), form);
}

export function deleteTemplate(name: string) {
    return request<unknown>('DELETE', apiURL(`/templates/${encodeURIComponent(name)}`));
}

// fontURL is the font of the captions, for the previews drawn in the browser.
export function fontURL() {
    return pluginURL('/fonts/anton.ttf');
}

export function getRecent() {
    return request<Meme[]>('GET', apiURL('/recent'));
}

// thumbnailURL is a template's image at a width; the version of a custom template keeps the
// browser from showing a deleted template of the same name.
export function thumbnailURL(name: string, width = 240, version?: number) {
    const params = new URLSearchParams({width: String(width)});
    if (version) {
        params.set('v', String(version));
    }
    return apiURL(`/templates/${encodeURIComponent(name)}/thumbnail`, params);
}

// renderURL is the image of a meme: its template with its captions.
export function renderURL(name: string, captions: Captions, version?: number) {
    const params = new URLSearchParams();
    for (const key of ['top', 'middle', 'bottom'] as const) {
        if (captions[key]) {
            params.set(key, captions[key]);
        }
    }
    const boxes = captions.boxes || [];
    const last = boxes.reduce((n, b, i) => (b ? i + 1 : n), 0);
    for (const box of boxes.slice(0, last)) {
        params.append('box', box);
    }
    if (version) {
        params.set('v', String(version));
    }
    return apiURL(`/templates/${encodeURIComponent(name)}/render`, params);
}

export function postMeme(channelId: string, rootId: string | undefined, template: string, captions: Captions) {
    return request('POST', apiURL('/memes'), {channel_id: channelId, root_id: rootId || '', template, ...captions});
}
