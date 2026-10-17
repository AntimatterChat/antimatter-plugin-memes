// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React, {useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';

import * as client from '../client';
import {isGuest, useCreatorNames} from '../creators';
import {messages} from '../messages';
import {addedTemplate, matches, removedTemplate, useConfig, useTemplates} from '../state';
import type {Layout, Template} from '../types/memes';
import type {PickerKit, PickerListItem} from '../types/host';

import {LAYOUTS, TemplatePreview, titleFromFile} from './add_template_dialog';

// The Memes tab's views inside the Fusion emoji picker, built with the picker's own components
// (pickerKit): adding a template, and managing the custom ones. The picker stays open; the back
// arrow, or Escape, returns to the gallery.

// The largest image file, unless the server says otherwise (as it does), and the longest name, as
// on the server (maxUploadBytes, maxTitleLength, maxKeywordsLength).
export const MAX_BYTES = 5 << 20;
export const MAX_NAME = 60;
export const MAX_KEYWORDS = 300;

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp';
const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

// isTemplateImage tells whether a file is an image the server takes: by its type, or its name when
// the browser gives no type.
export function isTemplateImage(file: File) {
    return file.type ? TYPES.includes(file.type) : EXTENSIONS.test(file.name);
}

// canManage tells whether the person gets the manage button: custom templates are on and they can
// add some, or delete some (theirs, or any as a system admin). Never a guest.
export function canManage(config: ReturnType<typeof useConfig>, templates?: Template[]) {
    if (!config || config.custom_templates === false || isGuest()) {
        return false;
    }
    return config.can_add || Boolean(config.can_delete_others) || Boolean(templates?.some((t) => t.custom && t.can_delete));
}

// canAdd tells whether the person gets the "+" button. Never a guest.
export function canAdd(config: ReturnType<typeof useConfig>) {
    return Boolean(config?.can_add && config.custom_templates !== false && !isGuest());
}

type AddProps = {
    kit: PickerKit;
    onBack: () => void;
    onAdded: (template: Template) => void;
};

// AddTemplateView adds a template: an image (chosen, dropped or pasted), with a preview of the
// captions of its layout, its name and search keywords. Problems show as the person types; the
// server's say, if any, shows inline too.
export function AddTemplateView({kit, onBack, onAdded}: AddProps) {
    const intl = useIntl();
    const config = useConfig();
    const maxBytes = config?.max_file_size || MAX_BYTES;
    const size = Math.round(maxBytes / (1 << 20));
    const [file, setFile] = useState<File | null>(null);
    const [url, setURL] = useState('');
    const [fileError, setFileError] = useState('');
    const [title, setTitle] = useState('');
    const [touched, setTouched] = useState(false);
    const [keywords, setKeywords] = useState('');
    const [layout, setLayout] = useState<Layout>('top-bottom');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const objectURL = file && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
        setURL(objectURL);
        return () => {
            if (objectURL) {
                URL.revokeObjectURL(objectURL);
            }
        };
    }, [file]);

    const onFile = (f: File) => {
        setError('');
        if (!isTemplateImage(f)) {
            setFile(null);
            setFileError(intl.formatMessage(messages.addWrongType));
            return;
        }
        if (f.size > maxBytes) {
            setFile(null);
            setFileError(intl.formatMessage(messages.addTooLarge, {size}));
            return;
        }
        setFileError('');
        setFile(f);
        if (!title.trim()) {
            setTitle(titleFromFile(f.name).slice(0, MAX_NAME));
        }
    };

    const name = title.trim().replace(/\s+/g, ' ');
    const length = [...name].length;
    let nameError = '';
    if (length > MAX_NAME) {
        nameError = intl.formatMessage(messages.addNameTooLong, {max: MAX_NAME});
    } else if (touched && !name) {
        nameError = intl.formatMessage(messages.addNameRequired);
    }

    const save = async () => {
        setTouched(true);
        if (busy) {
            return;
        }
        if (!file) {
            setFileError(fileError || intl.formatMessage(messages.addImageRequired));
            return;
        }
        if (!name || length > MAX_NAME) {
            return;
        }
        setBusy(true);
        setError('');
        try {
            const template = await client.addTemplate({file, title: name, keywords, layout});
            addedTemplate(template);
            onAdded(template);
        } catch (err) {
            setError(intl.formatMessage(messages.addFailed, {error: (err as Error).message}));
            setBusy(false);
        }
    };

    const captions = LAYOUTS.find((l) => l.value === layout)?.captions || ['top', 'bottom'];
    const {PickerViewFrame, PickerDropZone, PickerField, PickerNotice} = kit;
    return (
        <PickerViewFrame
            title={intl.formatMessage(messages.addTemplate)}
            onBack={onBack}
            onSubmit={save}
            actions={(
                <>
                    <button
                        type='button'
                        className='am-btn'
                        onClick={onBack}
                    >
                        {intl.formatMessage(messages.cancel)}
                    </button>
                    <button
                        type='submit'
                        className='am-btn am-primary'
                        disabled={busy || Boolean(fileError) || length > MAX_NAME}
                    >
                        {intl.formatMessage(busy ? messages.adding : messages.addSave)}
                    </button>
                </>
            )}
        >
            <PickerDropZone
                accept={ACCEPT}
                file={file}
                onFile={onFile}
                label={intl.formatMessage(messages.addChoose)}
                changeLabel={intl.formatMessage(messages.addChooseAnother)}
                hint={intl.formatMessage(messages.addDropHint, {size})}
                error={fileError}
                {...(url ? {
                    preview: (
                        <TemplatePreview
                            key={url}
                            src={url}
                            captions={captions}
                            label={intl.formatMessage(messages.addPreview)}
                        />
                    ),
                } : {})}
            />
            <PickerField
                label={intl.formatMessage(messages.addName)}
                hint={intl.formatMessage(messages.addNameHint)}
                error={nameError}
                aside={`${length}/${MAX_NAME}`}
            >
                {({id, describedBy, invalid}) => (
                    <input
                        id={id}
                        type='text'
                        value={title}
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        aria-required={true}
                        autoComplete='off'
                        onChange={(e) => {
                            setTitle(e.target.value);
                            setError('');
                        }}
                        onBlur={() => setTouched(true)}
                    />
                )}
            </PickerField>
            <PickerField
                label={intl.formatMessage(messages.addKeywords)}
                hint={intl.formatMessage(messages.addKeywordsHint)}
            >
                {({id, describedBy}) => (
                    <input
                        id={id}
                        type='text'
                        value={keywords}
                        maxLength={MAX_KEYWORDS}
                        aria-describedby={describedBy}
                        autoComplete='off'
                        onChange={(e) => setKeywords(e.target.value)}
                    />
                )}
            </PickerField>
            <PickerField label={intl.formatMessage(messages.addLayout)}>
                {({id, describedBy}) => (
                    <select
                        id={id}
                        value={layout}
                        aria-describedby={describedBy}
                        onChange={(e) => setLayout(e.target.value as Layout)}
                    >
                        {LAYOUTS.map((l) => (
                            <option
                                key={l.value}
                                value={l.value}
                            >
                                {intl.formatMessage(l.label)}
                            </option>
                        ))}
                    </select>
                )}
            </PickerField>
            <PickerNotice>{error}</PickerNotice>
        </PickerViewFrame>
    );
}

type ManageProps = {
    kit: PickerKit;
    onBack: () => void;

    // Making a meme with a template of the list.
    onUse: (template: Template) => void;
};

// ManageTemplatesView lists the custom templates (the built-in ones can't be deleted), with who
// added them and when; their creators and system admins can delete them, after a confirmation in
// the row. Picking one makes a meme with it.
export function ManageTemplatesView({kit, onBack, onUse}: ManageProps) {
    const intl = useIntl();
    const {data: templates, error} = useTemplates();
    const [query, setQuery] = useState('');
    const custom = useMemo(() => (templates || []).filter((t) => t.custom), [templates]);
    const shown = useMemo(() => custom.filter((t) => matches(t, query)), [custom, query]);
    const names = useCreatorNames(shown.map((t) => t.creator_id || '').filter(Boolean));
    const byName = useMemo(() => new Map(custom.map((t) => [t.name, t])), [custom]);

    const items: PickerListItem[] = shown.map((t) => ({
        id: t.name,
        name: t.title,
        image: (
            <img
                src={client.thumbnailURL(t.name, 96, t.version)}
                alt=''
                loading='lazy'
            />
        ),
        ...(t.creator_id ? {by: names[t.creator_id]} : {}),
        at: t.create_at || t.version,
        canDelete: Boolean(t.can_delete),
    }));

    const onDelete = async (item: PickerListItem) => {
        try {
            await client.deleteTemplate(item.id);
            removedTemplate(item.id);

            // No error: the picker kit only checks for a message.
            return '';
        } catch (err) {
            return intl.formatMessage(messages.deleteFailed, {error: (err as Error).message});
        }
    };

    let empty = intl.formatMessage(messages.manageEmpty);
    if (error) {
        empty = intl.formatMessage(messages.loadFailed, {error});
    } else if (query.trim()) {
        empty = intl.formatMessage(messages.manageNoMatch, {query: query.trim()});
    }

    const {PickerViewFrame, PickerSearch, PickerManageList} = kit;
    return (
        <PickerViewFrame
            title={intl.formatMessage(messages.manageTemplates)}
            onBack={onBack}
        >
            <PickerSearch
                value={query}
                onChange={setQuery}
                placeholder={intl.formatMessage(messages.manageSearch)}
            />
            <PickerManageList
                items={items}
                loading={!templates && !error}
                empty={empty}
                onDelete={onDelete}
                onOpen={(item) => {
                    const t = byName.get(item.id);
                    if (t) {
                        onUse(t);
                    }
                }}
                deleteLabel={(item) => intl.formatMessage(messages.deleteTemplate, {title: item.name})}
                confirmText={(item) => intl.formatMessage(messages.manageConfirm, {title: item.name})}
                deletedText={(item) => intl.formatMessage(messages.manageDeleted, {title: item.name})}
            />
        </PickerViewFrame>
    );
}
