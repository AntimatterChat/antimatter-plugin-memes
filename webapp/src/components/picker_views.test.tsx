// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {act, fireEvent, screen, waitFor, within} from '@testing-library/react';
import React from 'react';

import {fakeKit} from '../../tests/kit';
import {custom, mockFetch, renderWithIntl, templates} from '../../tests/utils';
import {resetCreators, setHostStore} from '../creators';
import {closeDialog, resetConfig, resetTemplates, useDialog} from '../state';
import type {PluginStore} from '../types/host';
import type {Config, Template} from '../types/memes';

import MemesTab from './memes_tab';

jest.mock('../manifest', () => ({__esModule: true, default: {id: 'memes'}}));

const config = (c: Partial<Config> = {}) => ({path: '/config', body: {can_add: true, max_file_size: 5 << 20, custom_templates: true, can_delete_others: false, ...c}});
const routes = (c: Partial<Config> = {}, list: Template[] = templates) => [config(c), {path: '/templates', body: list}, {path: '/recent', body: []}];

// The meme dialog's request, which picking a template in the picker makes.
let opened: ReturnType<typeof useDialog> = null;
function DialogSpy() {
    opened = useDialog();
    return null;
}

function tab({onSelectDone = jest.fn(), kit = true, isFusion = true} = {}) {
    return (
        <>
            <MemesTab
                channelId='c1'
                rootId='r1'
                filter=''
                onFilterChange={jest.fn()}
                onSelectDone={onSelectDone}
                isFusion={isFusion}
                pickerKit={kit ? fakeKit() : undefined}
            />
            <DialogSpy/>
        </>
    );
}

const png = (name = 'office_cat.png', size = 10, type = 'image/png') => {
    const file = new File(['x'], name, {type});
    Object.defineProperty(file, 'size', {value: size});
    return file;
};
const choose = (file: File) => fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {target: {files: [file]}});

const priya = {id: 'priya', username: 'priya', first_name: 'Priya', last_name: 'Patel', nickname: ''};
const nina = {id: 'nina', username: 'nina', first_name: '', last_name: '', nickname: ''};

beforeEach(() => {
    resetTemplates();
    resetConfig();
    resetCreators();
    setHostStore({getState: () => ({entities: {users: {profiles: {priya, nina}}, general: {config: {TeammateNameDisplay: 'full_name'}}}})} as unknown as PluginStore);
    act(() => closeDialog());
    opened = null;
    URL.createObjectURL = jest.fn(() => 'blob:template');
    URL.revokeObjectURL = jest.fn();
});

afterEach(() => setHostStore(null));

describe('the buttons next to the search box', () => {
    test('add and manage for those who can add templates', async () => {
        mockFetch(routes());
        renderWithIntl(tab());
        expect(await screen.findByRole('button', {name: 'Add a meme template'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Custom meme templates'})).toBeInTheDocument();
    });

    test('none for those who can neither add nor delete templates', async () => {
        mockFetch(routes({can_add: false}, [...templates, {...custom, can_delete: false}]));
        renderWithIntl(tab());
        expect(await screen.findByText('Disaster girl')).toBeInTheDocument();
        await act(async () => Promise.resolve());
        expect(screen.queryByRole('button', {name: 'Add a meme template'})).toBeNull();
        expect(screen.queryByRole('button', {name: 'Custom meme templates'})).toBeNull();
    });

    test('manage only for those who can delete some but not add', async () => {
        mockFetch(routes({can_add: false}, [...templates, custom]));
        renderWithIntl(tab());
        expect(await screen.findByRole('button', {name: 'Custom meme templates'})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Add a meme template'})).toBeNull();
    });

    test('none for guests, even when the server says everyone can add', async () => {
        setHostStore({getState: () => ({entities: {users: {currentUserId: 'gina', profiles: {priya, nina, gina: {id: 'gina', username: 'gina', roles: 'system_guest'}}}, general: {config: {}}}})} as unknown as PluginStore);
        mockFetch(routes({}, [...templates, custom]));
        renderWithIntl(tab());
        expect(await screen.findByText('Lab cat')).toBeInTheDocument();
        await act(async () => Promise.resolve());
        expect(screen.queryByRole('button', {name: 'Add a meme template'})).toBeNull();
        expect(screen.queryByRole('button', {name: 'Custom meme templates'})).toBeNull();
    });

    test('none when custom templates are off, even for a system admin', async () => {
        mockFetch(routes({can_add: false, custom_templates: false, can_delete_others: true}, [...templates, custom]));
        renderWithIntl(tab());
        expect(await screen.findByText('Lab cat')).toBeInTheDocument();
        await act(async () => Promise.resolve());
        expect(screen.queryByRole('button', {name: 'Add a meme template'})).toBeNull();
        expect(screen.queryByRole('button', {name: 'Custom meme templates'})).toBeNull();
    });

    test('without the picker kit, "+" still opens the dialog and there is no manage button', async () => {
        mockFetch(routes());
        const onSelectDone = jest.fn();
        renderWithIntl(tab({onSelectDone, kit: false}));
        fireEvent.click(await screen.findByRole('button', {name: 'Add a meme template'}));
        expect(onSelectDone).toHaveBeenCalled();
        expect(screen.queryByRole('button', {name: 'Custom meme templates'})).toBeNull();
    });
});

describe('adding a template in the picker', () => {
    test('checks the image and the name as they come, saves, and shows it first in the gallery', async () => {
        const added = {...custom, name: 'office-cat', title: 'Office cat', creator_id: 'priya', create_at: 42};
        const calls = mockFetch([...routes(), {method: 'POST', path: '/templates', body: added, status: 201}]);
        const onSelectDone = jest.fn();
        renderWithIntl(tab({onSelectDone}));
        fireEvent.click(await screen.findByRole('button', {name: 'Add a meme template'}));

        // In the picker, in place of the gallery
        const view = screen.getByRole('form', {name: 'Add a meme template'});
        expect(screen.queryByRole('textbox', {name: 'Search memes'})).toBeNull();
        expect(view).toHaveTextContent('PNG, JPEG, GIF or WebP, up to 5 MB.');

        // The image: its type and size
        choose(png('notes.txt', 10, 'text/plain'));
        expect(screen.getByRole('alert')).toHaveTextContent('This file isn’t a PNG, JPEG, GIF or WebP image.');
        expect(screen.getByRole('button', {name: 'Save template'})).toBeDisabled();
        choose(png('huge.png', (5 << 20) + 1));
        expect(screen.getByRole('alert')).toHaveTextContent('The image is larger than 5 MB.');
        choose(png());
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByText('Choose another image')).toBeInTheDocument();

        // The name: from the file, required, at most 60 characters
        const name = screen.getByLabelText('Name');
        expect(name).toHaveValue('Office cat');
        expect(screen.getByText('10/60')).toBeInTheDocument();
        fireEvent.change(name, {target: {value: ' '}});
        fireEvent.blur(name);
        expect(screen.getByText('Give the template a name.')).toBeInTheDocument();
        expect(name).toHaveAttribute('aria-invalid', 'true');
        fireEvent.change(name, {target: {value: 'x'.repeat(61)}});
        expect(screen.getByText('The name can have up to 60 characters.')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Save template'})).toBeDisabled();
        fireEvent.change(name, {target: {value: '  Office   cat '}});
        fireEvent.change(screen.getByLabelText('Search keywords'), {target: {value: 'monday'}});
        fireEvent.change(screen.getByLabelText('Captions'), {target: {value: 'bottom'}});

        fireEvent.click(screen.getByRole('button', {name: 'Save template'}));

        // Back in the gallery, the new one first, with the focus
        expect(await screen.findByText('Just added')).toBeInTheDocument();
        const tile = document.querySelector('.ammemes-tile-new') as HTMLElement;
        expect(tile).toHaveAccessibleName('Office cat');
        await waitFor(() => expect(tile).toHaveFocus());
        expect(onSelectDone).not.toHaveBeenCalled();

        const sent = calls.find((c) => c.method === 'POST')?.body as FormData;
        expect(sent.get('title')).toBe('Office cat');
        expect(sent.get('keywords')).toBe('monday');
        expect(sent.get('layout')).toBe('bottom');

        // Ready to use: picking it makes a meme with it
        fireEvent.click(tile);
        expect(onSelectDone).toHaveBeenCalled();
        expect(opened).toEqual(expect.objectContaining({channelId: 'c1', rootId: 'r1', template: 'office-cat'}));
    });

    test('asks for an image, says what the server refused, and goes back without saving', async () => {
        const calls = mockFetch([...routes(), {method: 'POST', path: '/templates', body: {error: 'you can\'t add meme templates'}, status: 403}]);
        const onSelectDone = jest.fn();
        renderWithIntl(tab({onSelectDone}));
        fireEvent.click(await screen.findByRole('button', {name: 'Add a meme template'}));

        fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Cat'}});
        fireEvent.click(screen.getByRole('button', {name: 'Save template'}));
        expect(screen.getByRole('alert')).toHaveTextContent('Choose an image first.');
        expect(calls.some((c) => c.method === 'POST')).toBe(false);

        // Dropped on the zone
        fireEvent.drop(screen.getByTestId('drop'), {dataTransfer: {files: [png('cat.webp', 10, 'image/webp')]}});
        fireEvent.click(screen.getByRole('button', {name: 'Save template'}));
        expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t add it: you can\'t add meme templates');
        expect(screen.getByRole('form', {name: 'Add a meme template'})).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Back'}));
        expect(screen.getByRole('textbox', {name: 'Search memes'})).toBeInTheDocument();
        expect(screen.queryByText('Just added')).toBeNull();
        expect(onSelectDone).not.toHaveBeenCalled();
    });
});

describe('managing the custom templates in the picker', () => {
    const mine = {...custom, name: 'lab-cat', title: 'Lab cat', creator_id: 'priya', create_at: 1000, can_delete: true};
    const theirs = {...custom, name: 'office-dog', title: 'Office dog', keywords: ['monday'], creator_id: 'nina', create_at: 2000, can_delete: false};

    test('lists the custom ones with who added them and when, searchable', async () => {
        mockFetch(routes({}, [...templates, mine, theirs]));
        renderWithIntl(tab());
        fireEvent.click(await screen.findByRole('button', {name: 'Custom meme templates'}));

        const view = screen.getByRole('region', {name: 'Custom meme templates'});
        expect(within(view).queryByText('Disaster girl')).toBeNull();
        expect(within(screen.getByTestId('row-lab-cat')).getByText('Priya Patel')).toBeInTheDocument();
        expect(within(screen.getByTestId('row-lab-cat')).getByText('at 1000')).toBeInTheDocument();
        expect(within(screen.getByTestId('row-office-dog')).getByText('nina')).toBeInTheDocument();

        fireEvent.change(screen.getByRole('searchbox', {name: 'Search custom templates'}), {target: {value: 'MONDAY'}});
        expect(screen.queryByTestId('row-lab-cat')).toBeNull();
        expect(screen.getByTestId('row-office-dog')).toBeInTheDocument();
        fireEvent.change(screen.getByRole('searchbox', {name: 'Search custom templates'}), {target: {value: 'parrot'}});
        expect(screen.getByText('No custom template matches “parrot”.')).toBeInTheDocument();
    });

    test('deletes only what the person may, after a confirmation in the row', async () => {
        const calls = mockFetch([...routes({}, [...templates, mine, theirs]), {method: 'DELETE', path: '/templates/lab-cat', body: {status: 'OK'}}]);
        renderWithIntl(tab());
        fireEvent.click(await screen.findByRole('button', {name: 'Custom meme templates'}));

        expect(screen.queryByRole('button', {name: 'Delete “Office dog”'})).toBeNull();

        fireEvent.click(screen.getByRole('button', {name: 'Delete “Lab cat”'}));
        const confirm = screen.getByRole('group', {name: 'Delete “Lab cat” for everyone? Memes already posted with it stay.'});
        fireEvent.click(within(confirm).getByRole('button', {name: 'Keep'}));
        expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

        fireEvent.click(screen.getByRole('button', {name: 'Delete “Lab cat”'}));
        fireEvent.click(within(screen.getByRole('group')).getByRole('button', {name: 'Delete'}));
        expect(await screen.findByRole('status')).toHaveTextContent('“Lab cat” was deleted.');
        expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/plugins/memes/api/v1/templates/lab-cat');
        expect(screen.queryByTestId('row-lab-cat')).toBeNull();
        expect(screen.getByTestId('row-office-dog')).toBeInTheDocument();

        // Gone from the gallery too
        fireEvent.click(screen.getByRole('button', {name: 'Back'}));
        expect(screen.queryByText('Lab cat')).toBeNull();
    });

    test('says why the server refused a deletion', async () => {
        mockFetch([...routes({}, [mine]), {method: 'DELETE', path: '/templates/lab-cat', body: {error: 'only its creator or a system admin can delete this template'}, status: 403}]);
        renderWithIntl(tab());
        fireEvent.click(await screen.findByRole('button', {name: 'Custom meme templates'}));
        fireEvent.click(screen.getByRole('button', {name: 'Delete “Lab cat”'}));
        fireEvent.click(within(screen.getByRole('group')).getByRole('button', {name: 'Delete'}));
        expect(await screen.findByRole('status')).toHaveTextContent('Couldn’t delete it: only its creator or a system admin can delete this template');
        expect(screen.getByTestId('row-lab-cat')).toBeInTheDocument();
    });

    test('a row makes a meme with its template', async () => {
        mockFetch(routes({}, [mine]));
        const onSelectDone = jest.fn();
        renderWithIntl(tab({onSelectDone}));
        fireEvent.click(await screen.findByRole('button', {name: 'Custom meme templates'}));
        fireEvent.click(within(screen.getByTestId('row-lab-cat')).getAllByRole('button')[0]);
        expect(onSelectDone).toHaveBeenCalled();
        expect(opened).toEqual(expect.objectContaining({template: 'lab-cat'}));
    });
});
