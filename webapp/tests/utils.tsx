// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {render} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';

import type {Template} from '../src/types/memes';

// renderWithIntl renders like the host: with its Intl provider.
export function renderWithIntl(ui: React.ReactElement) {
    return render(<IntlProvider locale='en'>{ui}</IntlProvider>);
}

export const templates: Template[] = [
    {name: 'disaster-girl', title: 'Disaster girl', width: 500, height: 375, boxes: 0, example: ['my house', 'is lit']},
    {name: 'drake', title: 'Drake: no / yes', width: 500, height: 500, boxes: 2, example: ['Test in staging', 'Test in prod']},
    {name: 'the-most-interesting-man-in-the-world', title: "I don't always X, but when I do", aliases: ['i-dont-always'], width: 500, height: 300, boxes: 0},
];

// A custom template, which the user can delete.
export const custom: Template = {name: 'lab-cat', title: 'Lab cat', width: 400, height: 300, boxes: 0, captions: ['bottom'], keywords: ['office'], custom: true, can_delete: true, version: 42};

// A route answers the requests whose URL includes its path, or ends with it when exact.
type Route = {method?: string; path: string; exact?: boolean; body: unknown; status?: number};

// mockFetch answers the plugin's API from routes, and records the requests.
export function mockFetch(routes: Route[]) {
    const calls: Array<{method: string; url: string; body?: unknown}> = [];
    global.fetch = jest.fn(async (url: string, options?: {method?: string; body?: string | FormData}) => {
        const method = options?.method || 'GET';
        let body: unknown = options?.body ?? null;
        if (typeof body === 'string') {
            body = JSON.parse(body);
        }
        calls.push({method, url, body});
        const path = url.split('?')[0];
        const route = routes.find((r) => (r.method || 'GET') === method && (r.exact ? path.endsWith(r.path) : url.includes(r.path)));
        const status = route ? route.status || 200 : 404;
        return {ok: status < 300, status, statusText: 'error', json: async () => (route ? route.body : {error: 'not found'})};
    }) as unknown as typeof fetch;
    return calls;
}
