// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React from 'react';
import {useIntl} from 'react-intl';

import {messages} from '../messages';
import {openDialog} from '../state';
import type {EmojiPickerTabProps} from '../types/host';
import {classNames} from '../web_ui';

import {AddButton} from './add_template_dialog';
import Gallery from './gallery';
import {SearchIcon} from './icons';

// MemesTab is the Memes tab of the host's emoji picker (after Emoji): the meme templates, searched
// with the picker's search box. Picking one closes the picker and opens the meme dialog, which
// posts to the message box's channel or thread. Next to the search box, the users who can add
// templates have a button for it, as in the GIF and sticker tabs.
export default function MemesTab({channelId, rootId, filter, onFilterChange, onSelectDone, isFusion}: EmojiPickerTabProps) {
    const intl = useIntl();
    const k = classNames(isFusion);
    if (!channelId) {
        return null;
    }
    const placeholder = intl.formatMessage(messages.search);
    const body = (
        <>
            <div className={k('picker-search') + ' ammemes-search-row'}>
                <label>
                    <SearchIcon className={isFusion ? 'am-ic am-sm' : 'ammemes-ic'}/>
                    <input
                        autoFocus={true}
                        value={filter}
                        placeholder={placeholder}
                        aria-label={placeholder}
                        autoComplete='off'
                        onChange={(e) => onFilterChange(e.target.value)}
                    />
                </label>
                <AddButton
                    request={{channelId, rootId}}
                    fusion={isFusion}
                    onClose={onSelectDone}
                />
            </div>
            <div className={k('picker-body') + ' ammemes-picker-body'}>
                <Gallery
                    query={filter}
                    onPick={(template, captions) => {
                        onSelectDone();
                        openDialog({channelId, rootId, template: template.name, captions});
                    }}
                />
            </div>
        </>
    );
    return isFusion ? body : <div className='ammemes-tab'>{body}</div>;
}
