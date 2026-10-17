// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React, {useState} from 'react';
import {useIntl} from 'react-intl';

import {messages} from '../messages';
import {openDialog, useConfig, useTemplates} from '../state';
import type {EmojiPickerTabProps, PickerKit} from '../types/host';
import type {Captions, Template} from '../types/memes';
import {classNames} from '../web_ui';

import {AddButton} from './add_template_dialog';
import Gallery from './gallery';
import {SearchIcon} from './icons';
import {AddTemplateView, ManageTemplatesView, canAdd, canManage} from './picker_views';

// MemesTab is the Memes tab of the host's emoji picker (after Emoji): the meme templates, searched
// with the picker's search box. Picking one closes the picker and opens the meme dialog, which
// posts to the message box's channel or thread. Next to the search box, the users who can add
// templates have a button for it, as in the GIF and sticker tabs. In the Fusion picker (which hands
// its views' components, pickerKit), "+" adds a template and the manage button lists the custom
// ones, both inside the picker; elsewhere "+" opens the plugin's dialog.
export default function MemesTab(props: EmojiPickerTabProps) {
    const {channelId, rootId, filter, onFilterChange, onSelectDone, isFusion, pickerKit} = props;
    const intl = useIntl();
    const k = classNames(isFusion);
    if (!channelId) {
        return null;
    }
    if (isFusion && pickerKit) {
        return (
            <KitMemesTab
                kit={pickerKit}
                channelId={channelId}
                rootId={rootId}
                filter={filter}
                onFilterChange={onFilterChange}
                onSelectDone={onSelectDone}
            />
        );
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

type KitProps = {
    kit: PickerKit;
    channelId: string;
    rootId?: string;
    filter: string;
    onFilterChange: (filter: string) => void;
    onSelectDone: () => void;
};

// KitMemesTab is the tab in the Fusion picker: the gallery, or its add or manage view in its
// place. A template just added comes first in the gallery, with the focus, ready to use.
function KitMemesTab({kit, channelId, rootId, filter, onFilterChange, onSelectDone}: KitProps) {
    const intl = useIntl();
    const config = useConfig();
    const {data: templates} = useTemplates();
    const [view, open, back] = kit.usePickerView<'add' | 'manage'>();
    const [highlight, setHighlight] = useState('');

    const use = (template: Template, captions?: Captions) => {
        onSelectDone();
        openDialog({channelId, rootId, template: template.name, captions});
    };

    if (view === 'add') {
        return (
            <AddTemplateView
                kit={kit}
                onBack={back}
                onAdded={(template) => {
                    setHighlight(template.name);
                    onFilterChange('');
                    back(false);
                }}
            />
        );
    }
    if (view === 'manage') {
        return (
            <ManageTemplatesView
                kit={kit}
                onBack={back}
                onUse={(template) => use(template)}
            />
        );
    }

    const placeholder = intl.formatMessage(messages.search);
    const {PickerViewButtons} = kit;
    return (
        <>
            <div className='am-picker-search ammemes-search-row'>
                <label>
                    <SearchIcon className='am-ic am-sm'/>
                    <input
                        autoFocus={!highlight}
                        value={filter}
                        placeholder={placeholder}
                        aria-label={placeholder}
                        autoComplete='off'
                        onChange={(e) => onFilterChange(e.target.value)}
                    />
                </label>
                <PickerViewButtons
                    onAdd={canAdd(config) ? () => open('add') : undefined}
                    onManage={canManage(config, templates) ? () => open('manage') : undefined}
                    addLabel={intl.formatMessage(messages.addTemplate)}
                    manageLabel={intl.formatMessage(messages.manageTemplates)}
                />
            </div>
            <div className='am-picker-body ammemes-picker-body'>
                <Gallery
                    query={filter}
                    highlight={highlight}
                    deletable={false}
                    onPick={use}
                />
            </div>
        </>
    );
}
