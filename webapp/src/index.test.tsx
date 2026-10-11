// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';

import {mockFetch, renderWithIntl, templates} from '../tests/utils';

import {renderURL} from './client';
import MemeDialogRoot, {placeholders} from './components/meme_dialog';
import MemesTab from './components/memes_tab';

import {closeDialog, matches, openDialog, resetTemplates} from './state';

import {openFromCommand} from './index';

jest.mock('./manifest', () => ({__esModule: true, default: {id: 'memes'}}));

beforeEach(() => {
    resetTemplates();
    act(() => closeDialog());
});

test('matches: finds templates by title, name or alias, ignoring case and accents', () => {
    const [disaster, , interesting] = templates;
    expect(matches(disaster, 'DISASTER')).toBe(true);
    expect(matches(disaster, 'disáster g')).toBe(true);
    expect(matches(interesting, 'i dont always')).toBe(true);
    expect(matches(interesting, "don't always")).toBe(true);
    expect(matches(disaster, 'drake')).toBe(false);
    expect(matches(disaster, '  ')).toBe(true);
});

test('renderURL: sends the captions, and the boxes up to the last one written', () => {
    const url = new URL(renderURL('drake', {top: 'a b', middle: '', bottom: 'c', boxes: ['x', '', 'y', '', '']}), 'http://h');
    expect(url.pathname).toBe('/plugins/memes/api/v1/templates/drake/render');
    expect(url.searchParams.get('top')).toBe('a b');
    expect(url.searchParams.has('middle')).toBe(false);
    expect(url.searchParams.getAll('box')).toEqual(['x', '', 'y']);
});

test('placeholders: show the example as captions, or in the boxes', () => {
    expect(placeholders(templates[0])).toEqual({top: 'my house', bottom: 'is lit', boxes: []});
    expect(placeholders(templates[1]).boxes).toEqual(['Test in staging', 'Test in prod']);
});

test('openFromCommand: opens the dialog for a bare /meme, and leaves the rest to the server', () => {
    const args = {channel_id: 'c1'};
    expect(openFromCommand('/meme', args)).toEqual({});
    expect(openFromCommand('/meme doge wow', args)).toEqual({message: '/meme doge wow', args});
    act(() => closeDialog());
});

test('MemesTab: lists the templates, searched, and opens the dialog on the picked one', async () => {
    mockFetch([{path: '/templates', body: templates}, {path: '/recent', body: []}]);
    const onSelectDone = jest.fn();
    const ui = (filter: string) => (
        <IntlProvider locale='en'>
            <MemesTab
                channelId='c1'
                filter={filter}
                onFilterChange={jest.fn()}
                onSelectDone={onSelectDone}
                isFusion={true}
            />
            <MemeDialogRoot/>
        </IntlProvider>
    );
    const {rerender} = render(ui(''));
    expect(await screen.findByText('Disaster girl')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);

    rerender(ui('drake'));
    expect(screen.queryByText('Disaster girl')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Drake: no / yes'));
    expect(onSelectDone).toHaveBeenCalled();
    expect(await screen.findByRole('dialog', {name: 'Make a meme'})).toBeInTheDocument();
    expect(screen.getByLabelText('Box 2')).toHaveAttribute('placeholder', 'Test in prod');
});

test('MemeDialog: posts the meme with its captions, then closes', async () => {
    const calls = mockFetch([{path: '/templates', body: templates}, {path: '/recent', body: []}, {method: 'POST', path: '/memes', body: {id: 'p1'}, status: 201}]);
    renderWithIntl(<MemeDialogRoot/>);
    act(() => openDialog({channelId: 'c1', rootId: 'r1', template: 'disaster-girl'}));

    const post = await screen.findByRole('button', {name: 'Post meme'});
    expect(post).toBeDisabled();
    expect(screen.getByLabelText('Top text')).toHaveAttribute('placeholder', 'my house');
    expect(screen.queryByLabelText('Box 1')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Top text'), {target: {value: 'my house'}});
    fireEvent.change(screen.getByLabelText('Bottom text'), {target: {value: 'my rules'}});
    fireEvent.click(post);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const sent = calls.find((c) => c.method === 'POST');
    expect(sent?.body).toEqual({channel_id: 'c1', root_id: 'r1', template: 'disaster-girl', top: 'my house', middle: '', bottom: 'my rules', boxes: []});
});

test('MemeDialog: says why a meme could not be posted', async () => {
    mockFetch([{path: '/templates', body: templates}, {path: '/recent', body: []}, {method: 'POST', path: '/memes', body: {error: "you can't post in this channel"}, status: 403}]);
    renderWithIntl(<MemeDialogRoot/>);
    act(() => openDialog({channelId: 'c1', template: 'drake'}));
    fireEvent.change(await screen.findByLabelText('Box 1'), {target: {value: 'meetings'}});
    fireEvent.click(screen.getByRole('button', {name: 'Post meme'}));
    expect(await screen.findByRole('alert')).toHaveTextContent("you can't post in this channel");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('MemeDialog: starts with the gallery from /meme, then edits the chosen template', async () => {
    mockFetch([{path: '/templates', body: templates}, {path: '/recent', body: [{template: 'drake', top: '', middle: '', bottom: '', boxes: ['a', 'b'], create_at: 1}]}]);
    renderWithIntl(<MemeDialogRoot/>);
    act(() => openDialog({channelId: 'c1'}));
    expect(await screen.findByRole('dialog', {name: 'Choose a template'})).toBeInTheDocument();
    expect(await screen.findByText('Your last memes')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Disaster girl'));
    expect(await screen.findByRole('dialog', {name: 'Make a meme'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Other template'}));
    expect(await screen.findByRole('dialog', {name: 'Choose a template'})).toBeInTheDocument();
});
