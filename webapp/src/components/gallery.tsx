// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React from 'react';
import {useIntl} from 'react-intl';

import {renderURL, thumbnailURL} from '../client';
import {messages} from '../messages';
import {matches, useRecent, useTemplates} from '../state';
import type {Captions, Template} from '../types/memes';

type Props = {
    query: string;
    onPick: (template: Template, captions?: Captions) => void;
};

// Gallery shows the meme templates, with the memes the user made last first (when there's no
// search): picking one starts a meme with it, or from the recent meme's captions.
export default function Gallery({query, onPick}: Props) {
    const intl = useIntl();
    const {data: templates, error} = useTemplates();
    const recent = useRecent();

    if (error) {
        return <div className='ammemes-empty'>{intl.formatMessage(messages.loadFailed, {error})}</div>;
    }
    if (!templates) {
        return <div className='ammemes-empty'>{intl.formatMessage(messages.loading)}</div>;
    }

    const byName = new Map(templates.map((t) => [t.name, t]));
    const shown = templates.filter((t) => matches(t, query));
    const recentShown = query.trim() ? [] : recent.flatMap((m) => {
        const t = byName.get(m.template);
        return t ? [{m, t}] : [];
    }).slice(0, 6);

    return (
        <div className='ammemes-gallery'>
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
                                    title={t.title}
                                    onClick={() => onPick(t, m)}
                                >
                                    <img
                                        src={renderURL(m.template, m)}
                                        alt={[m.top, m.middle, m.bottom, ...(m.boxes || [])].filter(Boolean).join(' / ')}
                                        loading='lazy'
                                    />
                                </button>
                            );
                        })}
                    </div>
                    <div className='ammemes-heading'>{intl.formatMessage(messages.templates)}</div>
                </>
            )}
            {shown.length === 0 && <div className='ammemes-empty'>{intl.formatMessage(messages.noMatch, {query: query.trim()})}</div>}
            <div className='ammemes-grid'>
                {shown.map((t) => (
                    <button
                        key={t.name}
                        type='button'
                        className='ammemes-tile'
                        title={t.title}
                        onClick={() => onPick(t)}
                    >
                        <img
                            src={thumbnailURL(t.name)}
                            alt=''
                            loading='lazy'
                        />
                        <span>{t.title}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
