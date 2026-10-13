// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React, {useEffect, useState} from 'react';
import ReactDOM from 'react-dom';
import {useIntl, type MessageDescriptor} from 'react-intl';

import * as client from '../client';
import {messages} from '../messages';
import {CAPTION_FONT, fitSize, layoutCaption, loadCaptionFont} from '../preview';
import {addedTemplate, closeAddTemplate, openAddTemplate, openDialog, useAddTemplate, useConfig, type AddRequest} from '../state';
import type {CaptionKey, Layout, Template} from '../types/memes';
import {classNames, isFusionUI, layerContainer} from '../web_ui';

import {PlusIcon} from './icons';

// The largest image file, unless the server says otherwise (as it does).
const MAX_BYTES = 5 << 20;

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp';

export const LAYOUTS: Array<{value: Layout; label: MessageDescriptor; captions: CaptionKey[]}> = [
    {value: 'top-bottom', label: messages.layoutTopBottom, captions: ['top', 'bottom']},
    {value: 'top', label: messages.layoutTop, captions: ['top']},
    {value: 'bottom', label: messages.layoutBottom, captions: ['bottom']},
    {value: 'top-middle-bottom', label: messages.layoutTopMiddleBottom, captions: ['top', 'middle', 'bottom']},
];

const SAMPLE: Record<CaptionKey, MessageDescriptor> = {top: messages.top, middle: messages.middle, bottom: messages.bottom};

// titleFromFile makes a name of a file name: "office_cat-monday.png" is "Office cat monday".
export function titleFromFile(name: string) {
    const words = name.replace(/\.[^.]+$/, '').split(/[-_.\s]+/).filter(Boolean).join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

// TemplatePreview shows an image with sample captions where a layout puts them, as the server
// will draw memes on it: an SVG of the template's size, once the image's size is known.
export function TemplatePreview({src, captions, label}: {src: string; captions: CaptionKey[]; label: string}) {
    const intl = useIntl();
    const [natural, setNatural] = useState<{width: number; height: number} | null>(null);

    useEffect(() => {
        loadCaptionFont();
    }, []);

    if (!natural) {
        return (
            <figure className='ammemes-add-preview ammemes-loading'>
                <img
                    src={src}
                    alt=''
                    onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth && img.naturalHeight) {
                            setNatural({width: img.naturalWidth, height: img.naturalHeight});
                        }
                    }}
                />
            </figure>
        );
    }
    const {width, height} = fitSize(natural.width, natural.height);
    return (
        <figure className='ammemes-add-preview'>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                role='img'
                aria-label={label}
            >
                <image
                    href={src}
                    width={width}
                    height={height}
                    preserveAspectRatio='none'
                />
                {captions.map((key) => {
                    const layout = layoutCaption(intl.formatMessage(SAMPLE[key]).toLocaleUpperCase(intl.locale), key, width, height);
                    if (!layout) {
                        return null;
                    }
                    return (
                        <text
                            key={key}
                            className='ammemes-caption'
                            data-caption={key}
                            fontFamily={CAPTION_FONT}
                            fontSize={layout.size}
                            strokeWidth={layout.size / 8}
                            textAnchor='middle'
                        >
                            {layout.lines.map((line) => (
                                <tspan
                                    key={line.y}
                                    x={line.x}
                                    y={line.y}
                                >
                                    {line.text}
                                </tspan>
                            ))}
                        </text>
                    );
                })}
            </svg>
        </figure>
    );
}

type Props = {
    request: AddRequest;
    fusion: boolean;
};

// AddTemplateDialog adds a meme template: an image, its name, search keywords and caption layout,
// with a preview; then offers to make a meme with it. It has the markup of the Fusion UI's dialogs
// (am-scrim, am-modal...) under Fusion, the plugin's ammemes- classes under the classic UI, as the
// dialog adding GIFs and stickers.
export function AddTemplateDialog({request, fusion}: Props) {
    const intl = useIntl();
    const k = classNames(fusion);
    const config = useConfig();
    const maxBytes = config?.max_file_size || MAX_BYTES;
    const size = Math.round(maxBytes / (1 << 20));
    const [file, setFile] = useState<File | null>(null);
    const [url, setURL] = useState('');
    const [title, setTitle] = useState('');
    const [keywords, setKeywords] = useState('');
    const [layout, setLayout] = useState<Layout>('top-bottom');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [added, setAdded] = useState<Template | null>(null);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeAddTemplate();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, []);

    useEffect(() => {
        const objectURL = file && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
        setURL(objectURL);
        return () => {
            if (objectURL) {
                URL.revokeObjectURL(objectURL);
            }
        };
    }, [file]);

    const heading = intl.formatMessage(messages.addTemplate);
    const tooLarge = Boolean(file && file.size > maxBytes);

    const onFile = (f: File | null) => {
        setError('');
        setFile(f);
        if (f && f.size > maxBytes) {
            setError(intl.formatMessage(messages.addTooLarge, {size}));
        }
        if (f && !title.trim()) {
            setTitle(titleFromFile(f.name));
        }
    };

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !title.trim() || tooLarge || busy) {
            return;
        }
        setBusy(true);
        setError('');
        try {
            const template = await client.addTemplate({file, title: title.trim(), keywords, layout});
            addedTemplate(template);
            setAdded(template);
        } catch (err) {
            setError(intl.formatMessage(messages.addFailed, {error: (err as Error).message}));
        } finally {
            setBusy(false);
        }
    };

    const onMakeMeme = () => {
        if (!added || !request.channelId) {
            return;
        }
        closeAddTemplate();
        openDialog({channelId: request.channelId, rootId: request.rootId, template: added.name});
    };

    // A field of the Fusion dialogs: its label, its control and an optional hint describing it.
    type A11y = {'aria-label': string; 'aria-describedby'?: string};
    const field = (name: string, label: string, control: (a11y: A11y) => React.ReactNode, hint?: string) => (
        <label className={k('field')}>
            <span>{label}</span>
            {control(hint ? {'aria-label': label, 'aria-describedby': `ammemes-add-${name}-hint`} : {'aria-label': label})}
            {hint && <small id={`ammemes-add-${name}-hint`}>{hint}</small>}
        </label>
    );

    const errorBox = error && (
        <div
            className='ammemes-error ammemes-add-error'
            role='alert'
        >
            {error}
        </div>
    );

    let body;
    if (added) {
        body = (
            <>
                <div className='ammemes-add-added'>
                    <img
                        src={client.thumbnailURL(added.name, 480, added.version)}
                        alt={added.title}
                    />
                </div>
                <p className={k('lead')}>{intl.formatMessage(messages.addDone, {title: added.title})}</p>
                {errorBox}
                <div className={k('modal-actions')}>
                    <button
                        type='button'
                        className={k('btn')}
                        onClick={closeAddTemplate}
                    >
                        {intl.formatMessage(messages.addClose)}
                    </button>
                    {request.channelId && (
                        <button
                            type='button'
                            className={k('btn', 'primary')}
                            onClick={onMakeMeme}
                        >
                            {intl.formatMessage(messages.addMakeMeme)}
                        </button>
                    )}
                </div>
            </>
        );
    } else {
        const captions = LAYOUTS.find((l) => l.value === layout)?.captions || ['top', 'bottom'];
        body = (
            <>
                <p className={k('lead')}>{intl.formatMessage(messages.addLead, {size})}</p>
                {field('file', intl.formatMessage(messages.addFile), (a11y) => (
                    <input
                        {...a11y}
                        type='file'
                        accept={ACCEPT}
                        onChange={(e) => onFile(e.target.files?.[0] || null)}
                    />
                ))}
                {url && !tooLarge && (
                    <TemplatePreview
                        key={url}
                        src={url}
                        captions={captions}
                        label={intl.formatMessage(messages.addPreview)}
                    />
                )}
                {field('name', intl.formatMessage(messages.addName), (a11y) => (
                    <input
                        {...a11y}
                        type='text'
                        value={title}
                        maxLength={60}
                        required={true}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                ))}
                {field('keywords', intl.formatMessage(messages.addKeywords), (a11y) => (
                    <input
                        {...a11y}
                        type='text'
                        value={keywords}
                        maxLength={300}
                        onChange={(e) => setKeywords(e.target.value)}
                    />
                ), intl.formatMessage(messages.addKeywordsHint))}
                {field('layout', intl.formatMessage(messages.addLayout), (a11y) => (
                    <select
                        {...a11y}
                        value={layout}
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
                ))}
                {errorBox}
                <div className={k('modal-actions')}>
                    <button
                        type='button'
                        className={k('btn')}
                        onClick={closeAddTemplate}
                    >
                        {intl.formatMessage(messages.cancel)}
                    </button>
                    <button
                        type='submit'
                        className={k('btn', 'primary')}
                        disabled={busy || !file || !title.trim() || tooLarge}
                    >
                        {intl.formatMessage(busy ? messages.adding : messages.addSubmit)}
                    </button>
                </div>
            </>
        );
    }

    return (
        <div
            className={k('scrim')}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) {
                    closeAddTemplate();
                }
            }}
        >
            <form
                className={k('modal', 'small') + ' ammemes-add'}
                role='dialog'
                aria-modal='true'
                aria-label={heading}
                onSubmit={onSubmit}
            >
                <div className={k('pane')}>
                    <h2>{heading}</h2>
                    {body}
                </div>
            </form>
        </div>
    );
}

// AddButton opens the dialog adding a template, after closing the picker or dialog it's in. It
// shows for the users who can add templates.
export function AddButton({request, fusion, onClose}: {request: AddRequest; fusion: boolean; onClose: () => void}) {
    const intl = useIntl();
    const config = useConfig();
    if (!config?.can_add) {
        return null;
    }
    const label = intl.formatMessage(messages.addTemplate);
    return (
        <button
            type='button'
            className={fusion ? 'am-icon-btn' : 'ammemes-add-btn'}
            title={label}
            aria-label={label}
            onClick={() => {
                onClose();
                openAddTemplate(request);
            }}
        >
            <PlusIcon className={fusion ? 'am-ic' : 'ammemes-ic'}/>
        </button>
    );
}

// AddTemplateDialogRoot shows the dialog adding a template while it's open (see openAddTemplate);
// a root component, so that it outlives the picker it's opened from.
export default function AddTemplateDialogRoot() {
    const request = useAddTemplate();
    if (!request) {
        return null;
    }
    const fusion = isFusionUI();
    const dialog = (
        <AddTemplateDialog
            key={`${request.channelId}:${request.rootId}`}
            request={request}
            fusion={fusion}
        />
    );
    return ReactDOM.createPortal(fusion ? dialog : <div className='ammemes-layer'>{dialog}</div>, layerContainer(fusion));
}
