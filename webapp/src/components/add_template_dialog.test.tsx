// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {act, fireEvent, screen, waitFor, within} from '@testing-library/react';
import React from 'react';

import {custom, mockFetch, renderWithIntl, templates} from '../../tests/utils';
import {fitSize, layoutCaption} from '../preview';
import {closeAddTemplate, closeDeleteTemplate, closeDialog, loadConfig, matches, openAddTemplate, resetConfig, resetTemplates} from '../state';

import AddTemplateDialogRoot, {titleFromFile} from './add_template_dialog';
import DeleteTemplateDialogRoot from './delete_template_dialog';
import MemeDialogRoot from './meme_dialog';
import MemesTab from './memes_tab';

jest.mock('../manifest', () => ({__esModule: true, default: {id: 'memes'}}));

const config = (canAdd: boolean) => ({path: '/config', body: {can_add: canAdd, max_file_size: 5 << 20}});

function chooseFile(name: string, size = 10) {
    const file = new File(['x'.repeat(size)], name, {type: 'image/png'});
    fireEvent.change(screen.getByLabelText('Image'), {target: {files: [file]}});
    return file;
}

function tab(onSelectDone = jest.fn(), isFusion = false) {
    return (
        <>
            <MemesTab
                channelId='c1'
                rootId='r1'
                filter=''
                onFilterChange={jest.fn()}
                onSelectDone={onSelectDone}
                isFusion={isFusion}
            />
            <AddTemplateDialogRoot/>
            <DeleteTemplateDialogRoot/>
            <MemeDialogRoot/>
        </>
    );
}

beforeEach(() => {
    resetTemplates();
    resetConfig();
    delete window.antimatterWebUI;
    act(() => {
        closeAddTemplate();
        closeDeleteTemplate();
        closeDialog();
    });
    URL.createObjectURL = jest.fn(() => 'blob:template');
    URL.revokeObjectURL = jest.fn();
});

test('titleFromFile', () => {
    expect(titleFromFile('office_cat-monday.png')).toBe('Office cat monday');
    expect(titleFromFile('.png')).toBe('');
});

test('matches: finds custom templates by their keywords', () => {
    expect(matches(custom, 'OFFICE')).toBe(true);
    expect(matches(custom, 'lab')).toBe(true);
    expect(matches(custom, 'drake')).toBe(false);
});

test('layoutCaption: places the captions in their bands, as the server', () => {
    expect(fitSize(3000, 1500)).toEqual({width: 1024, height: 512});
    expect(fitSize(300, 2048)).toEqual({width: 150, height: 1024});
    expect(fitSize(500, 400)).toEqual({width: 500, height: 400});

    const top = layoutCaption('TOP TEXT', 'top', 600, 600);
    expect(top?.size).toBe(80);
    expect(top?.lines).toHaveLength(1);
    expect(top?.lines[0].x).toBe(300);
    expect(top?.lines[0].y).toBeLessThan(150);

    const bottom = layoutCaption('BOTTOM TEXT', 'bottom', 600, 600);
    expect(bottom?.lines[0].y).toBeGreaterThan(450);
    expect(bottom?.lines[0].y).toBeLessThanOrEqual(570);

    // Long captions wrap, then shrink to fit
    const long = layoutCaption('A CAPTION MUCH TOO LONG FOR ONE LINE OF THIS NARROW IMAGE', 'middle', 300, 600);
    expect(long?.lines.length).toBeGreaterThan(1);
    expect(long?.size).toBeLessThan(80);
});

test('the Memes tab has an add button for those who can add templates', async () => {
    mockFetch([config(true), {path: '/templates', body: templates}, {path: '/recent', body: []}]);
    const onSelectDone = jest.fn();
    renderWithIntl(tab(onSelectDone));
    fireEvent.click(await screen.findByRole('button', {name: 'Add a meme template'}));
    expect(onSelectDone).toHaveBeenCalled();
    expect(screen.getByRole('dialog', {name: 'Add a meme template'})).toHaveClass('ammemes-modal', 'ammemes-small', 'ammemes-add');
});

test('the Memes tab has no add button for the others', async () => {
    mockFetch([config(false), {path: '/templates', body: templates}, {path: '/recent', body: []}]);
    renderWithIntl(tab());
    expect(await screen.findByText('Disaster girl')).toBeInTheDocument();
    await act(async () => Promise.resolve());
    expect(screen.queryByRole('button', {name: 'Add a meme template'})).toBeNull();
});

test('adds a template with a preview, then makes a meme with it', async () => {
    const added = {...custom, name: 'office-cat', title: 'Office cat', keywords: ['monday']};
    const calls = mockFetch([config(true), {path: '/templates', body: templates}, {path: '/recent', body: []}, {method: 'POST', path: '/templates', body: added, status: 201}]);
    renderWithIntl(tab());
    fireEvent.click(await screen.findByRole('button', {name: 'Add a meme template'}));

    const add = screen.getByRole('button', {name: 'Add'});
    expect(add).toBeDisabled();
    const file = chooseFile('office_cat.png');
    expect(screen.getByLabelText('Name')).toHaveValue('Office cat');
    fireEvent.change(screen.getByLabelText('Search keywords'), {target: {value: 'monday, office'}});
    expect(screen.getByLabelText('Captions')).toHaveValue('top-bottom');

    // The preview shows sample captions where the layout puts them
    const img = document.querySelector('.ammemes-add-preview img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', {value: 2048});
    Object.defineProperty(img, 'naturalHeight', {value: 1024});
    fireEvent.load(img);
    const preview = screen.getByRole('img', {name: 'Preview of the template, with sample captions'});
    expect(preview).toHaveAttribute('viewBox', '0 0 1024 512');
    expect(Array.from(preview.querySelectorAll('text')).map((t) => t.textContent)).toEqual(['TOP TEXT', 'BOTTOM TEXT']);
    fireEvent.change(screen.getByLabelText('Captions'), {target: {value: 'bottom'}});
    expect(Array.from(preview.querySelectorAll('text')).map((t) => t.dataset.caption)).toEqual(['bottom']);

    fireEvent.click(add);
    expect(await screen.findByText('Added! “Office cat” is in the gallery, and first in your last memes.')).toBeInTheDocument();
    const sent = calls.find((c) => c.method === 'POST')?.body as FormData;
    expect(sent.get('title')).toBe('Office cat');
    expect(sent.get('keywords')).toBe('monday, office');
    expect(sent.get('layout')).toBe('bottom');
    expect(sent.get('file')).toBeInstanceOf(File);
    expect((sent.get('file') as File).name).toBe(file.name);

    // In the gallery right away
    expect(screen.getAllByTitle('Office cat').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', {name: 'Make a meme with it'}));
    expect(await screen.findByRole('dialog', {name: 'Make a meme'})).toBeInTheDocument();
    expect(screen.queryByRole('dialog', {name: 'Add a meme template'})).toBeNull();
    expect(screen.getByLabelText('Bottom text')).toBeInTheDocument();
    expect(screen.queryByLabelText('Top text')).toBeNull();
    expect(screen.queryByLabelText('Middle text')).toBeNull();
});

test('says why a template can’t be added', async () => {
    mockFetch([config(true), {method: 'POST', path: '/templates', body: {error: 'the file isn’t a PNG, JPEG, GIF or WebP image'}, status: 400}]);
    await act(async () => loadConfig());
    renderWithIntl(<AddTemplateDialogRoot/>);
    act(() => openAddTemplate({}));

    chooseFile('huge.png', (5 << 20) + 1);
    expect(screen.getByRole('alert')).toHaveTextContent('The image is larger than 5 MB.');
    expect(screen.getByRole('button', {name: 'Add'})).toBeDisabled();

    chooseFile('fake.png');
    fireEvent.click(screen.getByRole('button', {name: 'Add'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t add it: the file isn’t a PNG, JPEG, GIF or WebP image');

    fireEvent.keyDown(document, {key: 'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
});

test('without a channel, the added template has no meme to make', async () => {
    mockFetch([config(true), {method: 'POST', path: '/templates', body: custom, status: 201}]);
    await act(async () => loadConfig());
    renderWithIntl(<AddTemplateDialogRoot/>);
    act(() => openAddTemplate({}));
    chooseFile('lab_cat.png');
    fireEvent.click(screen.getByRole('button', {name: 'Add'}));
    expect(await screen.findByRole('button', {name: 'Done'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Make a meme with it'})).toBeNull();
});

test('uses the Fusion dialog markup in its layer', async () => {
    window.antimatterWebUI = 'fusion';
    mockFetch([config(true)]);
    await act(async () => loadConfig());
    renderWithIntl(<AddTemplateDialogRoot/>);
    act(() => openAddTemplate({channelId: 'c1'}));
    const dialog = screen.getByRole('dialog', {name: 'Add a meme template'});
    expect(dialog).toHaveClass('am-modal', 'am-small', 'ammemes-add');
    expect(dialog.parentElement).toHaveClass('am-scrim');
    expect(dialog.parentElement?.parentElement).toHaveClass('am-layer');
    expect(within(dialog).getByLabelText('Captions').tagName).toBe('SELECT');
});

test('under Fusion, the image field is a Fusion button over the browser\'s input', async () => {
    window.antimatterWebUI = 'fusion';
    mockFetch([config(true)]);
    await act(async () => loadConfig());
    renderWithIntl(<AddTemplateDialogRoot/>);
    act(() => openAddTemplate({channelId: 'c1'}));

    // The input is still the field's control, out of sight behind the button.
    const input = screen.getByLabelText('Image');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveClass('ammemes-file-input');
    const button = input.parentElement!.querySelector('.ammemes-file-btn')!;
    expect(button).toHaveClass('am-btn');
    expect(button).toHaveAttribute('aria-hidden', 'true');
    expect(button).toHaveTextContent('Choose an image');
    expect(button.querySelector('use')).toHaveAttribute('href', '#am-i-upload');

    chooseFile('office_cat.png');
    expect(button).toHaveTextContent('Choose another image');
    expect(screen.getByText('office_cat.png')).toHaveClass('ammemes-file-name');
    expect(screen.getByLabelText('Name')).toHaveValue('Office cat');
});

test('under the classic UI, the image field is the browser\'s input, as before', async () => {
    mockFetch([config(true)]);
    await act(async () => loadConfig());
    renderWithIntl(<AddTemplateDialogRoot/>);
    act(() => openAddTemplate({channelId: 'c1'}));
    expect(screen.getByLabelText('Image')).not.toHaveClass('ammemes-file-input');
    expect(document.querySelector('.ammemes-file-btn')).toBeNull();
});

test('the add button has Fusion\'s tooltip and icon under Fusion, the browser\'s under the classic UI', async () => {
    mockFetch([config(true), {path: '/templates', body: templates}, {path: '/recent', body: []}]);
    await act(async () => loadConfig());
    window.antimatterWebUI = 'fusion';
    const {unmount} = renderWithIntl(tab(jest.fn(), true));
    const add = await screen.findByRole('button', {name: 'Add a meme template'});
    expect(add).toHaveAttribute('data-am-tip', 'Add a meme template');
    expect(add).not.toHaveAttribute('title');
    expect(add.querySelector('use')).toHaveAttribute('href', '#am-i-plus');
    unmount();

    delete window.antimatterWebUI;
    renderWithIntl(tab());
    const classic = await screen.findByRole('button', {name: 'Add a meme template'});
    expect(classic).toHaveAttribute('title', 'Add a meme template');
    expect(classic.querySelector('use')).toBeNull();
});

test('deletes a custom template from the gallery, once confirmed', async () => {
    const other = {...custom, name: 'not-mine', title: 'Not mine', can_delete: false};
    const calls = mockFetch([config(true), {path: '/templates', body: [...templates, custom, other]}, {path: '/recent', body: []}, {method: 'DELETE', path: '/templates/lab-cat', body: {status: 'OK'}}]);
    renderWithIntl(tab());
    expect(await screen.findByText('Lab cat')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Delete “Not mine”'})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Delete “Disaster girl”'})).toBeNull();

    // Cancelled
    fireEvent.click(screen.getByRole('button', {name: 'Delete “Lab cat”'}));
    const confirm = screen.getByRole('alertdialog', {name: 'Delete this meme template?'});
    expect(confirm).toHaveTextContent('“Lab cat” will no longer be in the gallery');
    fireEvent.click(within(confirm).getByRole('button', {name: 'Cancel'}));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    // Confirmed
    fireEvent.click(screen.getByRole('button', {name: 'Delete “Lab cat”'}));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', {name: 'Delete'}));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/plugins/memes/api/v1/templates/lab-cat');
    expect(screen.queryByText('Lab cat')).toBeNull();
    expect(screen.getByText('Not mine')).toBeInTheDocument();
});

test('says why a template couldn’t be deleted', async () => {
    mockFetch([config(true), {path: '/templates', body: [custom]}, {path: '/recent', body: []}, {method: 'DELETE', path: '/templates/lab-cat', body: {error: 'only its creator or a system admin can delete this template'}, status: 403}]);
    renderWithIntl(tab());
    fireEvent.click(await screen.findByRole('button', {name: 'Delete “Lab cat”'}));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', {name: 'Delete'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t delete it: only its creator or a system admin can delete this template');
    expect(screen.getByText('Lab cat')).toBeInTheDocument();
});
