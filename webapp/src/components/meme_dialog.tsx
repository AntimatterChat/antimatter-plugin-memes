// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React, {useEffect, useMemo, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import {useIntl} from 'react-intl';

import {postMeme, renderURL} from '../client';
import {messages} from '../messages';
import {closeDialog, useDialog, useTemplates, type DialogRequest} from '../state';
import type {Captions, Template} from '../types/memes';
import {classNames, isFusionUI} from '../web_ui';

import Gallery from './gallery';
import {SearchIcon} from './icons';

const PREVIEW_DELAY = 250;

function useDebounced<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

const EMPTY: Captions = {top: '', middle: '', bottom: '', boxes: []};

// placeholders are a template's example text: its top and bottom captions, or its boxes.
export function placeholders(t: Template) {
    const ex = t.example || [];
    return t.boxes > 0 ? {top: '', bottom: '', boxes: ex} : {top: ex[0] || '', bottom: ex[1] || '', boxes: []};
}

type EditorProps = {
    fusion: boolean;
    request: DialogRequest;
    template: Template;
    onOtherTemplate: () => void;
};

// Editor writes the captions of a meme, as on imgflip: top, middle and bottom captions across the
// image, and the template's own boxes; the preview is drawn by the server, as the meme will be.
function Editor({fusion, request, template, onOtherTemplate}: EditorProps) {
    const intl = useIntl();
    const k = classNames(fusion);
    const [captions, setCaptions] = useState<Captions>(() => ({...EMPTY, ...request.captions, boxes: [...(request.captions?.boxes || [])]}));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const first = useRef<HTMLInputElement>(null);
    const hints = placeholders(template);

    const preview = useDebounced(renderURL(template.name, captions), PREVIEW_DELAY);
    const [loaded, setLoaded] = useState('');

    useEffect(() => {
        first.current?.focus();
    }, [template.name]);

    const empty = ![captions.top, captions.middle, captions.bottom, ...(captions.boxes || [])].some((s) => s.trim());

    const set = (key: 'top' | 'middle' | 'bottom', value: string) => setCaptions((c) => ({...c, [key]: value}));
    const setBox = (i: number, value: string) => setCaptions((c) => {
        const boxes = [...(c.boxes || [])];
        while (boxes.length <= i) {
            boxes.push('');
        }
        boxes[i] = value;
        return {...c, boxes};
    });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) {
            return;
        }
        if (empty) {
            setError(intl.formatMessage(messages.empty));
            return;
        }
        setBusy(true);
        setError('');
        try {
            await postMeme(request.channelId, request.rootId, template.name, {...captions, boxes: (captions.boxes || []).slice(0, template.boxes)});
            closeDialog();
        } catch (err) {
            setError(intl.formatMessage(messages.postFailed, {error: (err as Error).message}));
            setBusy(false);
        }
    };

    const field = (key: 'top' | 'middle' | 'bottom', label: string, ref?: React.Ref<HTMLInputElement>) => (
        <label className={k('field')}>
            <span>{label}</span>
            <input
                ref={ref}
                value={captions[key]}
                placeholder={hints[key as 'top' | 'bottom'] || ''}
                maxLength={200}
                autoComplete='off'
                onChange={(e) => set(key, e.target.value)}
            />
        </label>
    );

    return (
        <form
            className='ammemes-editor-form'
            onSubmit={submit}
        >
            <div className='ammemes-editor'>
                <figure className={'ammemes-preview' + (loaded === preview ? '' : ' ammemes-loading')}>
                    <img
                        src={preview}
                        alt={intl.formatMessage(messages.preview)}
                        onLoad={() => setLoaded(preview)}
                        onError={() => setLoaded(preview)}
                    />
                </figure>
                <div className='ammemes-fields'>
                    <div className='ammemes-template-name'>
                        <b>{template.title}</b>
                        <button
                            type='button'
                            className='ammemes-link'
                            onClick={onOtherTemplate}
                            disabled={busy}
                        >
                            {intl.formatMessage(messages.otherTemplate)}
                        </button>
                    </div>
                    {field('top', intl.formatMessage(messages.top), first)}
                    {field('middle', intl.formatMessage(messages.middle))}
                    {field('bottom', intl.formatMessage(messages.bottom))}
                    {template.boxes > 0 && <p className='ammemes-help'>{intl.formatMessage(messages.boxesHelp)}</p>}
                    {Array.from({length: template.boxes}, (_, i) => (
                        <label
                            key={i}
                            className={k('field')}
                        >
                            <span>{intl.formatMessage(messages.box, {n: i + 1})}</span>
                            <input
                                value={captions.boxes?.[i] || ''}
                                placeholder={hints.boxes[i] || ''}
                                maxLength={200}
                                autoComplete='off'
                                onChange={(e) => setBox(i, e.target.value)}
                            />
                        </label>
                    ))}
                </div>
            </div>
            {error && (
                <div
                    className='ammemes-error'
                    role='alert'
                >
                    {error}
                </div>
            )}
            <div className={k('modal-actions')}>
                <button
                    type='button'
                    className={k('btn')}
                    onClick={closeDialog}
                    disabled={busy}
                >
                    {intl.formatMessage(messages.cancel)}
                </button>
                <button
                    type='submit'
                    className={k('btn', 'primary')}
                    disabled={busy || empty}
                >
                    {intl.formatMessage(busy ? messages.posting : messages.post)}
                </button>
            </div>
        </form>
    );
}

function Chooser({fusion, onPick}: {fusion: boolean; onPick: (t: Template, c?: Captions) => void}) {
    const intl = useIntl();
    const k = classNames(fusion);
    const [query, setQuery] = useState('');
    const placeholder = intl.formatMessage(messages.search);
    return (
        <div className='ammemes-chooser'>
            <div className={k('picker-search') + ' ammemes-search-row'}>
                <label>
                    <SearchIcon className={fusion ? 'am-ic am-sm' : 'ammemes-ic'}/>
                    <input
                        autoFocus={true}
                        value={query}
                        placeholder={placeholder}
                        aria-label={placeholder}
                        autoComplete='off'
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </label>
            </div>
            <div className='ammemes-chooser-body'>
                <Gallery
                    query={query}
                    onPick={onPick}
                />
            </div>
        </div>
    );
}

// MemeDialog makes a meme: it starts from a template (or chooses one first), then posts it.
export function MemeDialog({request, fusion}: {request: DialogRequest; fusion: boolean}) {
    const intl = useIntl();
    const k = classNames(fusion);
    const {data: templates} = useTemplates();
    const [choice, setChoice] = useState<{name?: string; captions?: Captions}>({name: request.template, captions: request.captions});
    const template = useMemo(() => templates?.find((t) => t.name === choice.name), [templates, choice.name]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeDialog();
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, []);

    const heading = intl.formatMessage(template ? messages.dialogTitle : messages.chooseTemplate);
    return (
        <div
            className={k('scrim')}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                    closeDialog();
                }
            }}
        >
            <div
                className={k('modal') + ' ammemes-dialog'}
                role='dialog'
                aria-modal='true'
                aria-label={heading}
            >
                <div className={k('pane')}>
                    <h2>{heading}</h2>
                    {template ? (
                        <Editor
                            key={template.name}
                            fusion={fusion}
                            request={{...request, captions: choice.captions}}
                            template={template}
                            onOtherTemplate={() => setChoice({})}
                        />
                    ) : (
                        <Chooser
                            fusion={fusion}
                            onPick={(t, captions) => setChoice({name: t.name, captions})}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// layerContainer is where dialogs go: Fusion's layer, else the page.
function layerContainer(fusion: boolean): HTMLElement {
    if (!fusion) {
        return document.body;
    }
    const layer = document.getElementById('am-layer');
    if (layer) {
        return layer;
    }
    let own = document.getElementById('ammemes-layer');
    if (!own) {
        own = document.createElement('div');
        own.id = 'ammemes-layer';
        own.className = 'am-layer';
        document.body.appendChild(own);
    }
    return own;
}

// MemeDialogRoot shows the meme dialog while it's open (see openDialog); a root component, so that
// it outlives the picker it's opened from.
export default function MemeDialogRoot() {
    const request = useDialog();
    if (!request) {
        return null;
    }
    const fusion = isFusionUI();
    const dialog = (
        <MemeDialog
            key={`${request.channelId}:${request.rootId}:${request.template}`}
            request={request}
            fusion={fusion}
        />
    );
    return ReactDOM.createPortal(fusion ? dialog : <div className='ammemes-layer'>{dialog}</div>, layerContainer(fusion));
}
