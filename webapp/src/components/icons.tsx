// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React from 'react';

type Props = {className?: string};

// Line icons drawn with the current color, sized by their class (am-ic under Fusion).
function Svg({className, children}: Props & {children: React.ReactNode}) {
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
        >
            {children}
        </svg>
    );
}

export function SearchIcon(props: Props) {
    return (
        <Svg {...props}>
            <circle
                cx='11'
                cy='11'
                r='7'
            />
            <path d='m20 20-3.5-3.5'/>
        </Svg>
    );
}

// MemeIcon is a picture with a caption bar on top and bottom.
export function MemeIcon(props: Props) {
    return (
        <Svg {...props}>
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
