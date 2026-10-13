// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';

import {Client4} from 'mattermost-redux/client';

import AddTemplateDialogRoot from './components/add_template_dialog';
import DeleteTemplateDialogRoot from './components/delete_template_dialog';
import {MemeIcon} from './components/icons';
import MemeDialogRoot from './components/meme_dialog';
import MemesTab from './components/memes_tab';
import manifest from './manifest';
import {messages} from './messages';
import {closeAddTemplate, closeDeleteTemplate, closeDialog, openDialog, resetConfig, resetTemplates} from './state';
import type {PluginClass, PluginRegistry, SlashCommandArgs, SlashCommandResult} from './types/host';

import './styles.css';

// The emoji picker's own Emoji tab sits at order 10: the Memes tab comes after it, as the fourth
// tab of Fusion's picker (GIFs, Stickers, Emoji, Memes).
const TAB_ORDER = 20;

// openFromCommand opens the meme dialog for a bare "/meme"; "/meme <template> <text>" still goes
// to the server, which posts the meme right away.
export function openFromCommand(message: string, args: SlashCommandArgs): SlashCommandResult {
    if (message.trim() !== '/meme') {
        return {message, args};
    }
    openDialog({channelId: args.channel_id, rootId: args.root_id});
    return {};
}

export default class Plugin implements PluginClass {
    public initialize(registry: PluginRegistry) {
        if (window.basename) {
            Client4.setUrl(window.basename);
        }

        registry.registerRootComponent(MemeDialogRoot);
        registry.registerRootComponent(AddTemplateDialogRoot);
        registry.registerRootComponent(DeleteTemplateDialogRoot);
        registry.registerSlashCommandWillBePostedHook(openFromCommand);

        if (typeof registry.registerEmojiPickerTab === 'function') {
            registry.registerEmojiPickerTab({
                id: `${manifest.id}.memes`,
                label: <FormattedMessage {...messages.tab}/>,
                icon: <MemeIcon className='ammemes-tab-icon'/>,
                order: TAB_ORDER,
                component: MemesTab,
            });
        } else if (typeof registry.registerComposerMenuItem === 'function') {
            registry.registerComposerMenuItem({
                text: <FormattedMessage {...messages.menuItem}/>,
                icon: <MemeIcon className='ammemes-menu-icon'/>,
                fusionIcon: 'image',
                action: ({channelId, rootId}) => openDialog({channelId, rootId}),
            });
        } else {
            registry.registerChannelHeaderButtonAction(
                <MemeIcon className='ammemes-header-icon'/>,
                (channel) => openDialog({channelId: channel.id}),
                <FormattedMessage {...messages.menuItem}/>,
                <FormattedMessage {...messages.menuItem}/>,
            );
        }
    }

    public uninitialize() {
        closeDialog();
        closeAddTemplate();
        closeDeleteTemplate();
        resetTemplates();
        resetConfig();
    }
}

window.registerPlugin(manifest.id, new Plugin());
