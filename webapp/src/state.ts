// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {useEffect, useState, useSyncExternalStore} from 'react';

import {getRecent, getTemplates} from './client';
import type {Captions, Meme, Template} from './types/memes';

// A request to open the meme dialog: where the meme goes, and the template (and captions) to start
// from; without a template, the dialog starts with the gallery.
export type DialogRequest = {
    channelId: string;
    rootId?: string;
    template?: string;
    captions?: Captions;
};

let dialog: DialogRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

export function openDialog(request: DialogRequest) {
    dialog = request;
    emit();
}

export function closeDialog() {
    dialog = null;
    emit();
}

export function useDialog() {
    return useSyncExternalStore((l) => {
        listeners.add(l);
        return () => listeners.delete(l);
    }, () => dialog);
}

// The templates, loaded once.
let templates: Promise<Template[]> | null = null;

export function loadTemplates(): Promise<Template[]> {
    if (!templates) {
        templates = getTemplates().catch((err) => {
            templates = null;
            throw err;
        });
    }
    return templates;
}

export function resetTemplates() {
    templates = null;
}

type Loaded<T> = {data?: T; error?: string};

export function useTemplates(): Loaded<Template[]> {
    const [state, setState] = useState<Loaded<Template[]>>({});
    useEffect(() => {
        let live = true;
        loadTemplates().then((data) => live && setState({data}), (err) => live && setState({error: err.message || String(err)}));
        return () => {
            live = false;
        };
    }, []);
    return state;
}

// useRecent loads the memes the user made last (again each time a picker or dialog opens).
export function useRecent(): Meme[] {
    const [recent, setRecent] = useState<Meme[]>([]);
    useEffect(() => {
        let live = true;
        getRecent().then((data) => live && setRecent(Array.isArray(data) ? data : []), () => null);
        return () => {
            live = false;
        };
    }, []);
    return recent;
}

// matches tells whether a template matches a search: its title, name or aliases, ignoring case
// and accents.
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function matches(t: Template, query: string): boolean {
    const q = fold(query.trim());
    if (!q) {
        return true;
    }
    return [t.title, t.name.replace(/-/g, ' '), ...(t.aliases || []).map((a) => a.replace(/-/g, ' '))].some((s) => fold(s).includes(q));
}
