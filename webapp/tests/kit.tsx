// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

// The kit's props are typed by PickerKit; prop-types adds nothing to a test double.
/* eslint-disable react/prop-types */

import React, {useState} from 'react';

import type {PickerKit, PickerListItem} from '../src/types/host';

// fakeKit stands in for the Fusion picker's views (fusion/popovers/picker_views.tsx) in the
// plugin's tests: the same API and roles, without its looks. The host's own tests cover the kit.
export function fakeKit(): PickerKit {
    function PickerManageList({items, onDelete, confirmText, deleteLabel, deletedText, empty, loading, onOpen}: React.ComponentProps<PickerKit['PickerManageList']>) {
        const [confirming, setConfirming] = useState('');
        const [message, setMessage] = useState('');
        const remove = async (item: PickerListItem) => {
            const why = await onDelete(item);
            setConfirming('');
            setMessage(why || deletedText(item));
        };
        return (
            <>
                {message && <p role='status'>{message}</p>}
                <ul>
                    {items.map((item) => (
                        <li
                            key={item.id}
                            data-testid={`row-${item.id}`}
                        >
                            <button
                                type='button'
                                onClick={() => onOpen?.(item)}
                            >
                                {item.image}
                                <span>{item.name}</span>
                                {item.by && <span>{item.by}</span>}
                                {item.at ? <span>{`at ${item.at}`}</span> : null}
                            </button>
                            {item.canDelete && confirming !== item.id && (
                                <button
                                    type='button'
                                    aria-label={deleteLabel(item)}
                                    onClick={() => setConfirming(item.id)}
                                />
                            )}
                            {confirming === item.id && (
                                <div
                                    role='group'
                                    aria-label={confirmText(item)}
                                >
                                    <button
                                        type='button'
                                        onClick={() => setConfirming('')}
                                    >
                                        {'Keep'}
                                    </button>
                                    <button
                                        type='button'
                                        onClick={() => remove(item)}
                                    >
                                        {'Delete'}
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
                {!items.length && !loading && <p>{empty}</p>}
            </>
        );
    }

    return {
        version: 1,
        usePickerView: <V extends string>() => {
            const [view, setView] = useState<V | 'grid'>('grid');
            return [view, (v: V) => setView(v), () => setView('grid')] as [V | 'grid', (next: V) => void, (restoreFocus?: unknown) => void];
        },
        useOnEscape: () => undefined,
        PickerViewButtons: ({onAdd, onManage, addLabel, manageLabel}) => (
            <>
                {onAdd && (
                    <button
                        type='button'
                        aria-label={addLabel}
                        onClick={onAdd}
                    />
                )}
                {onManage && (
                    <button
                        type='button'
                        aria-label={manageLabel}
                        onClick={onManage}
                    />
                )}
            </>
        ),
        PickerViewFrame: ({title, onBack, actions, children, onSubmit}) => {
            const body = (
                <>
                    <button
                        type='button'
                        aria-label='Back'
                        onClick={onBack}
                    />
                    <h3>{title}</h3>
                    {children}
                    {actions}
                </>
            );
            return onSubmit ? (
                <form
                    aria-label={title}
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSubmit();
                    }}
                >
                    {body}
                </form>
            ) : <section aria-label={title}>{body}</section>;
        },
        PickerNotice: ({kind = 'error', children}) => (children ? <p role={kind === 'error' ? 'alert' : 'status'}>{children}</p> : null),
        PickerField: ({label, hint, error, ok, aside, children}) => (
            <div>
                <label htmlFor={`f-${label}`}>{label}</label>
                {aside && <span>{aside}</span>}
                {children({id: `f-${label}`, describedBy: `m-${label}`, invalid: Boolean(error)})}
                <p id={`m-${label}`}>{error || ok || hint}</p>
            </div>
        ),
        PickerSearch: ({value, onChange, placeholder}) => (
            <input
                type='search'
                aria-label={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        ),
        PickerDropZone: ({accept, file, onFile, label, hint, error, preview, changeLabel}) => (
            <div
                data-testid='drop'
                onDrop={(e) => {
                    const f = e.dataTransfer?.files?.[0];
                    if (f) {
                        onFile(f);
                    }
                }}
            >
                {file && preview}
                <label>
                    {file ? changeLabel : label}
                    <input
                        type='file'
                        accept={accept}
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                                onFile(f);
                            }
                        }}
                    />
                </label>
                <p role={error ? 'alert' : undefined}>{error || hint}</p>
            </div>
        ),
        PickerManageList,
    };
}
