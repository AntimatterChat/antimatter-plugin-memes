// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React, {useEffect, useState} from 'react';
import ReactDOM from 'react-dom';
import {useIntl} from 'react-intl';

import {deleteTemplate} from '../client';
import {messages} from '../messages';
import {closeDeleteTemplate, removedTemplate, useDeleteTemplate} from '../state';
import type {Template} from '../types/memes';
import {classNames, isFusionUI, layerContainer} from '../web_ui';

// DeleteTemplateDialog asks to confirm the deletion of a custom template, then deletes it.
export function DeleteTemplateDialog({template, fusion}: {template: Template; fusion: boolean}) {
    const intl = useIntl();
    const k = classNames(fusion);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeDeleteTemplate();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, []);

    const onDelete = async () => {
        setBusy(true);
        setError('');
        try {
            await deleteTemplate(template.name);
            removedTemplate(template.name);
            closeDeleteTemplate();
        } catch (err) {
            setError(intl.formatMessage(messages.deleteFailed, {error: (err as Error).message}));
            setBusy(false);
        }
    };

    const heading = intl.formatMessage(messages.deleteTitle);
    return (
        <div
            className={k('scrim')}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) {
                    closeDeleteTemplate();
                }
            }}
        >
            <div
                className={k('modal', 'small') + ' ammemes-delete'}
                role='alertdialog'
                aria-modal='true'
                aria-label={heading}
            >
                <div className={k('pane')}>
                    <h2>{heading}</h2>
                    <p className={k('lead')}>{intl.formatMessage(messages.deleteLead, {title: template.title})}</p>
                    {error && (
                        <div
                            className='ammemes-error ammemes-add-error'
                            role='alert'
                        >
                            {error}
                        </div>
                    )}
                    <div className={k('modal-actions')}>
                        <button
                            type='button'
                            className={k('btn')}
                            onClick={closeDeleteTemplate}
                            disabled={busy}
                        >
                            {intl.formatMessage(messages.cancel)}
                        </button>
                        <button
                            type='button'
                            className={k('btn', 'danger')}
                            onClick={onDelete}
                            disabled={busy}
                        >
                            {intl.formatMessage(busy ? messages.deleting : messages.deleteConfirm)}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// DeleteTemplateDialogRoot shows the confirmation while a template is to be deleted (see
// openDeleteTemplate).
export default function DeleteTemplateDialogRoot() {
    const template = useDeleteTemplate();
    if (!template) {
        return null;
    }
    const fusion = isFusionUI();
    const dialog = (
        <DeleteTemplateDialog
            key={template.name}
            template={template}
            fusion={fusion}
        />
    );
    return ReactDOM.createPortal(fusion ? dialog : <div className='ammemes-layer'>{dialog}</div>, layerContainer(fusion));
}
