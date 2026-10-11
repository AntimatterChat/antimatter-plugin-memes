// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

import {defineMessages} from 'react-intl';

export const messages = defineMessages({
    tab: {id: 'memes.tab', defaultMessage: 'Memes'},
    menuItem: {id: 'memes.menuItem', defaultMessage: 'Meme'},
    search: {id: 'memes.search', defaultMessage: 'Search memes'},
    recent: {id: 'memes.recent', defaultMessage: 'Your last memes'},
    templates: {id: 'memes.templates', defaultMessage: 'Templates'},
    noMatch: {id: 'memes.noMatch', defaultMessage: 'No meme matches “{query}”.'},
    loading: {id: 'memes.loading', defaultMessage: 'Loading memes…'},
    loadFailed: {id: 'memes.loadFailed', defaultMessage: 'Memes could not be loaded: {error}'},
    dialogTitle: {id: 'memes.dialogTitle', defaultMessage: 'Make a meme'},
    chooseTemplate: {id: 'memes.chooseTemplate', defaultMessage: 'Choose a template'},
    otherTemplate: {id: 'memes.otherTemplate', defaultMessage: 'Other template'},
    top: {id: 'memes.top', defaultMessage: 'Top text'},
    middle: {id: 'memes.middle', defaultMessage: 'Middle text'},
    bottom: {id: 'memes.bottom', defaultMessage: 'Bottom text'},
    box: {id: 'memes.box', defaultMessage: 'Box {n}'},
    boxesHelp: {id: 'memes.boxesHelp', defaultMessage: 'This template has its own boxes, numbered as on the image from left to right and top to bottom.'},
    preview: {id: 'memes.preview', defaultMessage: 'Preview of the meme'},
    post: {id: 'memes.post', defaultMessage: 'Post meme'},
    posting: {id: 'memes.posting', defaultMessage: 'Posting…'},
    cancel: {id: 'memes.cancel', defaultMessage: 'Cancel'},
    empty: {id: 'memes.empty', defaultMessage: 'Write something on the meme first.'},
    postFailed: {id: 'memes.postFailed', defaultMessage: 'The meme could not be posted: {error}'},
});
