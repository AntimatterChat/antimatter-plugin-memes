// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React from 'react';

import {isFusion} from './fusion/fusion_ui';

type Props = {className?: string};

// Line icons drawn with the current color, sized by their class (am-ic under Fusion). Under Fusion,
// an icon is the symbol of Fusion's sprite (#am-i-<sprite>), so it matches the rest of the UI; the
// classic page has no sprite, so it gets the drawing here.
function Svg({className, sprite, children}: Props & {sprite: string; children: React.ReactNode}) {
    return (
        <svg
            className={className}
            viewBox='0 0 24 24'
            width='16'
            height='16'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.8'
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
            data-icon={sprite}
        >
            {isFusion() ? <use href={`#am-i-${sprite}`}/> : children}
        </svg>
    );
}

export function SearchIcon(props: Props) {
    return (
        <Svg
            {...props}
            sprite='search'
        >
            <circle
                cx='11'
                cy='11'
                r='7'
            />
            <path d='m20 20-3.5-3.5'/>
        </Svg>
    );
}

// MemeIcon is a picture with a caption bar on top and bottom; under Fusion, the sprite's picture,
// the icon Fusion gives memes in the message box's menu.
export function MemeIcon(props: Props) {
    return (
        <Svg
            {...props}
            sprite='image'
        >
            <rect
                x='3'
                y='3'
                width='18'
                height='18'
                rx='3'
            />
            <path d='M7 7.5h10M7 16.5h10'/>
            <path d='m8.5 13 2-2 2.5 2.5 1.5-1.5'/>
        </Svg>
    );
}

export function PlusIcon(props: Props) {
    return (
        <Svg
            {...props}
            sprite='plus'
        >
            <path d='M12 5v14M5 12h14'/>
        </Svg>
    );
}

export function TrashIcon(props: Props) {
    return (
        <Svg
            {...props}
            sprite='trash'
        >
            <path d='M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3'/>
        </Svg>
    );
}

// An arrow up out of a tray: choosing a file to add.
export function UploadIcon(props: Props) {
    return (
        <Svg
            {...props}
            sprite='upload'
        >
            <path d='M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4'/>
        </Svg>
    );
}
