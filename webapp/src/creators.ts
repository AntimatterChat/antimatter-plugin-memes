// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {useEffect, useSyncExternalStore} from 'react';

import type {GlobalState} from '@mattermost/types/store';
import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';

import type {PluginStore} from './types/host';

// The names of the people who added custom templates, for the picker's list of them: from the
// host's store when it has their profile, else fetched once.

let hostStore: PluginStore | null = null;

// setHostStore gives the host's store, from the plugin's initialize.
export function setHostStore(store: PluginStore | null) {
    hostStore = store;
}

// isGuest tells whether the current user is a guest account (system_guest). As with custom emoji,
// guests neither add nor delete templates: the server refuses them, and the picker hides its
// add and manage buttons from them.
export function isGuest(): boolean {
    const state = hostStore?.getState() as GlobalState | undefined;
    const users = state?.entities?.users;
    const me = users?.profiles?.[users.currentUserId];
    return (me?.roles || '').split(' ').includes('system_guest');
}

const fetched = new Map<string, UserProfile | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function changed() {
    version++;
    listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
};

// resetCreators forgets the fetched profiles (tests, and the plugin's uninitialize).
export function resetCreators() {
    fetched.clear();
    pending.clear();
    changed();
}

function profile(id: string): UserProfile | null {
    const state = hostStore?.getState() as GlobalState | undefined;
    return state?.entities?.users?.profiles?.[id] || fetched.get(id) || null;
}

// remember keeps the profiles fetched for ids, and null for the ids that have none.
function remember(ids: string[], users: UserProfile[]) {
    ids.forEach((id) => fetched.set(id, null));
    users.forEach((u) => fetched.set(u.id, u));
}

// fetchProfiles fetches the profiles of ids the host doesn't have, once.
function fetchProfiles(ids: string[]) {
    ids.forEach((id) => pending.add(id));
    Client4.getProfilesByIds(ids).then((users) => remember(ids, users || []), () => remember(ids, [])).finally(() => {
        ids.forEach((id) => pending.delete(id));
        changed();
    });
}

// displayName follows the host's choice of how to name people (username, nickname or full name).
export function displayName(user: UserProfile): string {
    const state = hostStore?.getState() as GlobalState | undefined;
    const setting = state?.entities?.general?.config?.TeammateNameDisplay || 'username';
    const full = [user.first_name, user.last_name].filter(Boolean).join(' ');
    if (setting === 'nickname_full_name') {
        return user.nickname || full || user.username;
    }
    if (setting === 'full_name') {
        return full || user.username;
    }
    return user.username;
}

// useCreatorNames names the people of ids, fetching the profiles the host doesn't have.
export function useCreatorNames(ids: string[]): Record<string, string> {
    useSyncExternalStore(subscribe, () => version);
    const key = [...new Set(ids)].sort().join(',');
    useEffect(() => {
        const missing = key.split(',').filter((id) => id && !profile(id) && !fetched.has(id) && !pending.has(id));
        if (!missing.length) {
            return;
        }
        fetchProfiles(missing);
    }, [key]);

    const names: Record<string, string> = {};
    for (const id of ids) {
        const user = profile(id);
        if (user) {
            names[id] = displayName(user);
        }
    }
    return names;
}
