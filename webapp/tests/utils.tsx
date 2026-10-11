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

type Route = {method?: string; path: string; body: unknown; status?: number};

// mockFetch answers the plugin's API from routes, and records the requests.
export function mockFetch(routes: Route[]) {
    const calls: Array<{method: string; url: string; body?: unknown}> = [];
    global.fetch = jest.fn(async (url: string, options?: {method?: string; body?: string}) => {
        const method = options?.method || 'GET';
        calls.push({method, url, body: options?.body ? JSON.parse(options.body) : null});
        const route = routes.find((r) => (r.method || 'GET') === method && url.includes(r.path));
        const status = route ? route.status || 200 : 404;
        return {ok: status < 300, status, statusText: 'error', json: async () => (route ? route.body : {error: 'not found'})};
    }) as unknown as typeof fetch;
    return calls;
}
