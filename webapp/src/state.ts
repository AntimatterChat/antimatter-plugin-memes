// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {useEffect, useState, useSyncExternalStore} from 'react';

import {getConfig, getRecent, getTemplates} from './client';
import type {Captions, Config, Meme, Template} from './types/memes';

// Observable is a value components can follow.
class Observable<T> {
    private value: T;
    private listeners = new Set<() => void>();

    constructor(value: T) {
        this.value = value;
    }

    get = () => this.value;

    set(value: T) {
        this.value = value;
        this.listeners.forEach((l) => l());
    }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
}

function useObservable<T>(o: Observable<T>): T {
    return useSyncExternalStore(o.subscribe, o.get);
}

// A request to open the meme dialog: where the meme goes, and the template (and captions) to start
// from; without a template, the dialog starts with the gallery.
export type DialogRequest = {
    channelId: string;
    rootId?: string;
    template?: string;
    captions?: Captions;
};

const dialog = new Observable<DialogRequest | null>(null);

export function openDialog(request: DialogRequest) {
    dialog.set(request);
}

export function closeDialog() {
    dialog.set(null);
}

export function useDialog() {
    return useObservable(dialog);
}

// A request to open the dialog adding a template: where the picker was opened, to make a meme
// there with the new template.
export type AddRequest = {
    channelId?: string;
    rootId?: string;
};

const adding = new Observable<AddRequest | null>(null);

export function openAddTemplate(request: AddRequest) {
    adding.set(request);
}

export function closeAddTemplate() {
    adding.set(null);
}

export function useAddTemplate() {
    return useObservable(adding);
}

// The custom template to delete, once confirmed.
const deleting = new Observable<Template | null>(null);

export function openDeleteTemplate(template: Template) {
    deleting.set(template);
}

export function closeDeleteTemplate() {
    deleting.set(null);
}

export function useDeleteTemplate() {
    return useObservable(deleting);
}

// The templates, loaded once, then kept up to date with the ones the user adds or deletes.
const templates = new Observable<Template[] | null>(null);
let loading: Promise<Template[]> | null = null;
let generation = 0;

export function loadTemplates(): Promise<Template[]> {
    const loaded = templates.get();
    if (loaded) {
        return Promise.resolve(loaded);
    }
    if (!loading) {
        const gen = generation;
        loading = getTemplates().then((data) => {
            if (gen === generation) {
                loading = null;
                templates.set(data);
            }
            return data;
        }, (err) => {
            if (gen === generation) {
                loading = null;
            }
            throw err;
        });
    }
    return loading;
}

export function resetTemplates() {
    generation++;
    loading = null;
    templates.set(null);
}

const byTitle = (a: Template, b: Template) => {
    const x = a.title.toLowerCase();
    const y = b.title.toLowerCase();
    if (x === y) {
        return 0;
    }
    return x < y ? -1 : 1;
};

// addedTemplate shows a template the user added in the gallery, in its place by title.
export function addedTemplate(template: Template) {
    const list = templates.get();
    if (list) {
        templates.set([...list.filter((t) => t.name !== template.name), template].sort(byTitle));
    }
}

// removedTemplate takes a deleted template out of the gallery.
export function removedTemplate(name: string) {
    const list = templates.get();
    if (list) {
        templates.set(list.filter((t) => t.name !== name));
    }
}

type Loaded<T> = {data?: T; error?: string};

export function useTemplates(): Loaded<Template[]> {
    const data = useObservable(templates);
    const [error, setError] = useState<string>();
    useEffect(() => {
        let live = true;
        if (!templates.get()) {
            loadTemplates().catch((err) => live && setError(err.message || String(err)));
        }
        return () => {
            live = false;
        };
    }, []);
    return data ? {data} : {error};
}

// The settings the webapp follows, loaded once per session.
const config = new Observable<Config | null>(null);
let configLoading: Promise<void> | null = null;

export function loadConfig(): Promise<void> {
    if (!configLoading) {
        configLoading = getConfig().then((c) => config.set(c), () => {
            configLoading = null;
        });
    }
    return configLoading;
}

export function resetConfig() {
    configLoading = null;
    config.set(null);
}

export function useConfig(): Config | null {
    const c = useObservable(config);
    useEffect(() => {
        loadConfig();
    }, []);
    return c;
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

// matches tells whether a template matches a search: its title, name, aliases or keywords,
// ignoring case and accents.
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function matches(t: Template, query: string): boolean {
    const q = fold(query.trim());
    if (!q) {
        return true;
    }
    return [t.title, t.name.replace(/-/g, ' '), ...(t.aliases || []).map((a) => a.replace(/-/g, ' ')), ...(t.keywords || [])].some((s) => fold(s).includes(q));
}
