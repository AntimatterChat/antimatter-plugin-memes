// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {act, screen} from '@testing-library/react';
import React from 'react';

import {custom, mockFetch, renderWithIntl, templates} from '../../tests/utils';
import {resetTemplates} from '../state';

import Gallery from './gallery';

jest.mock('../manifest', () => ({__esModule: true, default: {id: 'memes'}}));

const gallery = (query = '') => (
    <Gallery
        query={query}
        onPick={jest.fn()}
    />
);

beforeEach(() => {
    resetTemplates();
    delete window.antimatterWebUI;
});

describe('under Fusion', () => {
    beforeEach(() => {
        window.antimatterWebUI = 'fusion';
    });

    test('loading is Fusion\'s quiet busy line, not the app\'s own empty state', async () => {
        mockFetch([{path: '/templates', body: templates}, {path: '/recent', body: []}]);
        renderWithIntl(gallery());
        const busy = screen.getByRole('status');
        expect(busy).toHaveClass('am-empty', 'amfx-empty', 'amfx-busy');
        expect(busy).not.toHaveClass('ammemes-empty');
        expect(busy).toHaveAttribute('aria-busy', 'true');
        expect(busy).toHaveTextContent('Loading memes…');
        expect(await screen.findByText('Disaster girl')).toBeInTheDocument();
    });

    test('a search that finds nothing is Fusion\'s centred empty state, with the search icon', async () => {
        mockFetch([{path: '/templates', body: templates}, {path: '/recent', body: []}]);
        renderWithIntl(gallery('no such meme'));
        const empty = (await screen.findByText('No meme matches “no such meme”.')).closest('[data-empty-state]')!;
        expect(empty).toHaveClass('am-empty', 'amfx-empty');
        expect(empty).not.toHaveClass('ammemes-empty');
        expect(empty.querySelector('.amfx-empty-ic use')).toHaveAttribute('href', '#am-i-search');
        expect(document.querySelector('.ammemes-empty')).toBeNull();
    });

    test('a failure is the empty state in the danger tone', async () => {
        mockFetch([{path: '/templates', body: {error: 'the server is down'}, status: 500}, {path: '/recent', body: []}]);
        renderWithIntl(gallery());
        const empty = (await screen.findByText('Memes could not be loaded: the server is down')).closest('[data-empty-state]')!;
        expect(empty).toHaveClass('am-empty', 'amfx-empty', 'amfx-danger');
    });

    test('the tiles and the delete button have Fusion\'s tooltips and icons', async () => {
        mockFetch([{path: '/templates', body: [...templates, custom]}, {path: '/recent', body: []}]);
        renderWithIntl(gallery());
        const tile = (await screen.findByText('Disaster girl')).closest('button')!;
        expect(tile).toHaveAttribute('data-am-tip', 'Disaster girl');
        expect(tile).not.toHaveAttribute('title');

        const remove = screen.getByRole('button', {name: 'Delete “Lab cat”'});
        expect(remove).toHaveAttribute('data-am-tip', 'Delete “Lab cat”');
        expect(remove).not.toHaveAttribute('title');
        expect(remove.querySelector('use')).toHaveAttribute('href', '#am-i-trash');
        expect(remove.querySelector('path')).toBeNull();
        expect(document.querySelector('[title]')).toBeNull();
    });
});

describe('under the classic UI', () => {
    test('the empty states keep the app\'s own class', async () => {
        mockFetch([{path: '/templates', body: templates}, {path: '/recent', body: []}]);
        renderWithIntl(gallery('no such meme'));
        expect(screen.getByText('Loading memes…').closest('[data-empty-state]')).toHaveClass('ammemes-empty');
        const empty = (await screen.findByText('No meme matches “no such meme”.')).closest('[data-empty-state]')!;
        expect(empty).toHaveClass('ammemes-empty');
        expect(empty).not.toHaveClass('am-empty');
        expect(empty.querySelector('svg')).toBeNull();
    });

    test('the tiles and the delete button keep the browser\'s tooltips and the app\'s icons', async () => {
        mockFetch([{path: '/templates', body: [...templates, custom]}, {path: '/recent', body: []}]);
        renderWithIntl(gallery());
        const tile = (await screen.findByText('Disaster girl')).closest('button')!;
        expect(tile).toHaveAttribute('title', 'Disaster girl');
        const remove = screen.getByRole('button', {name: 'Delete “Lab cat”'});
        expect(remove).toHaveAttribute('title', 'Delete “Lab cat”');
        expect(remove.querySelector('use')).toBeNull();
        expect(remove.querySelector('path')).not.toBeNull();
        expect(document.querySelector('[data-am-tip]')).toBeNull();
        await act(async () => null);
    });
});
