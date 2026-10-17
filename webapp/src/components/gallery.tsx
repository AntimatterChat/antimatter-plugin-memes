// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React, {useEffect, useRef} from 'react';
import {useIntl} from 'react-intl';

import {renderURL, thumbnailURL} from '../client';
import {messages} from '../messages';
import {matches, openDeleteTemplate, useRecent, useTemplates} from '../state';
import type {Captions, Template} from '../types/memes';

import EmptyState from './fusion/empty_state';
import {iconTip, tip} from './fusion/tip';
import {MemeIcon, SearchIcon, TrashIcon} from './icons';

type Props = {
    query: string;
    onPick: (template: Template, captions?: Captions) => void;

    // A template just added: shown first, with the focus, ready to use.
    highlight?: string;

    // Whether the templates the user can delete have a delete button (not in the Fusion picker,
    // whose manage view deletes them).
    deletable?: boolean;
};

// Gallery shows the meme templates, with the memes the user made last first (when there's no
// search): picking one starts a meme with it, or from the recent meme's captions. The custom
// templates the user can delete (theirs, or any for a system admin) have a delete button.
export default function Gallery({query, onPick, highlight, deletable = true}: Props) {
    const intl = useIntl();
    const {data: templates, error} = useTemplates();
    const recent = useRecent();
    const newRef = useRef<HTMLButtonElement>(null);
    const fresh = highlight && !query.trim() ? templates?.find((t) => t.name === highlight) : undefined;

    // After the picker's view closed, which gives the focus back first.
    useEffect(() => {
        if (!fresh) {
            return undefined;
        }
        const timer = setTimeout(() => newRef.current?.focus(), 0);
        return () => clearTimeout(timer);
    }, [fresh?.name]);

    if (error) {
        return (
            <EmptyState
                tone='danger'
                icon={<MemeIcon className='am-ic'/>}
                text={intl.formatMessage(messages.loadFailed, {error})}
                classicClassName='ammemes-empty'
            />
        );
    }
    if (!templates) {
        return (
            <EmptyState
                busy={true}
                text={intl.formatMessage(messages.loading)}
                classicClassName='ammemes-empty'
            />
        );
    }

    const byName = new Map(templates.map((t) => [t.name, t]));
    const shown = templates.filter((t) => matches(t, query));
    const recentShown = query.trim() ? [] : recent.flatMap((m) => {
        const t = byName.get(m.template);
        return t ? [{m, t}] : [];
    }).slice(0, 6);

    return (
        <div className='ammemes-gallery'>
            {fresh && (
                <>
                    <div className='ammemes-heading'>{intl.formatMessage(messages.justAdded)}</div>
                    <div className='ammemes-grid'>
                        <button
                            ref={newRef}
                            type='button'
                            className='ammemes-tile ammemes-tile-new'
                            {...tip(fresh.title)}
                            onClick={() => onPick(fresh)}
                        >
                            <img
                                src={thumbnailURL(fresh.name, 240, fresh.version)}
                                alt=''
                            />
                            <span>{fresh.title}</span>
                        </button>
                    </div>
                    {recentShown.length === 0 && <div className='ammemes-heading'>{intl.formatMessage(messages.templates)}</div>}
                </>
            )}
            {recentShown.length > 0 && (
                <>
                    <div className='ammemes-heading'>{intl.formatMessage(messages.recent)}</div>
                    <div className='ammemes-grid'>
                        {recentShown.map(({m, t}, i) => {
                            return (
                                <button
                                    key={`${m.template}-${m.create_at || i}`}
                                    type='button'
                                    className='ammemes-tile'
                                    {...tip(t.title)}
                                    onClick={() => onPick(t, m)}
                                >
                                    <img
                                        src={renderURL(m.template, m, t.version)}
                                        alt={[m.top, m.middle, m.bottom, ...(m.boxes || [])].filter(Boolean).join(' / ') || t.title}
                                        loading='lazy'
                                    />
                                </button>
                            );
                        })}
                    </div>
                    <div className='ammemes-heading'>{intl.formatMessage(messages.templates)}</div>
                </>
            )}
            {shown.length === 0 && (
                <EmptyState
                    icon={<SearchIcon className='am-ic'/>}
                    text={intl.formatMessage(messages.noMatch, {query: query.trim()})}
                    classicClassName='ammemes-empty'
                />
            )}
            <div className='ammemes-grid'>
                {shown.map((t) => {
                    const tile = (
                        <button
                            key={t.name}
                            type='button'
                            className='ammemes-tile'
                            {...tip(t.title)}
                            onClick={() => onPick(t)}
                        >
                            <img
                                src={thumbnailURL(t.name, 240, t.version)}
                                alt=''
                                loading='lazy'
                            />
                            <span>{t.title}</span>
                        </button>
                    );
                    if (!t.custom || !t.can_delete || !deletable) {
                        return tile;
                    }
                    const label = intl.formatMessage(messages.deleteTemplate, {title: t.title});
                    return (
                        <div
                            key={t.name}
                            className='ammemes-tile-wrap'
                        >
                            {tile}
                            <button
                                type='button'
                                className='ammemes-tile-delete'
                                {...iconTip(label)}
                                onClick={() => openDeleteTemplate(t)}
                            >
                                <TrashIcon className='ammemes-ic'/>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
