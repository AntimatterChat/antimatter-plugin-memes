// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {Client4} from 'mattermost-redux/client';

import manifest from './manifest';
import type {Captions, Meme, Template} from './types/memes';

export class ClientError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

function apiURL(path: string, params?: URLSearchParams) {
    const qs = params?.toString();
    return `${window.basename || ''}/plugins/${manifest.id}/api/v1${path}${qs ? '?' + qs : ''}`;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const options: {method: string; body?: string} = {method};
    if (typeof body !== 'undefined') {
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

export function getRecent() {
    return request<Meme[]>('GET', apiURL('/recent'));
}

export function thumbnailURL(name: string, width = 240) {
    return apiURL(`/templates/${encodeURIComponent(name)}/thumbnail`, new URLSearchParams({width: String(width)}));
}

// renderURL is the image of a meme: its template with its captions.
export function renderURL(name: string, captions: Captions) {
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
    return apiURL(`/templates/${encodeURIComponent(name)}/render`, params);
}

export function postMeme(channelId: string, rootId: string | undefined, template: string, captions: Captions) {
    return request('POST', apiURL('/memes'), {channel_id: channelId, root_id: rootId || '', template, ...captions});
}
