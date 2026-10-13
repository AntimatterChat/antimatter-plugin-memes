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

    // Adding a template
    addTemplate: {id: 'memes.add.title', defaultMessage: 'Add a meme template'},
    addLead: {id: 'memes.add.lead', defaultMessage: 'A PNG, JPEG, GIF or WebP image up to {size} MB. Everyone can make memes with it once it’s added.'},
    addFile: {id: 'memes.add.file', defaultMessage: 'Image'},
    addName: {id: 'memes.add.name', defaultMessage: 'Name'},
    addKeywords: {id: 'memes.add.keywords', defaultMessage: 'Search keywords'},
    addKeywordsHint: {id: 'memes.add.keywordsHint', defaultMessage: 'Separated by commas: they help people find it.'},
    addLayout: {id: 'memes.add.layout', defaultMessage: 'Captions'},
    layoutTopBottom: {id: 'memes.add.layout.topBottom', defaultMessage: 'Top and bottom'},
    layoutTop: {id: 'memes.add.layout.top', defaultMessage: 'Top only'},
    layoutBottom: {id: 'memes.add.layout.bottom', defaultMessage: 'Bottom only'},
    layoutTopMiddleBottom: {id: 'memes.add.layout.topMiddleBottom', defaultMessage: 'Top, middle and bottom'},
    addPreview: {id: 'memes.add.preview', defaultMessage: 'Preview of the template, with sample captions'},
    addSubmit: {id: 'memes.add.submit', defaultMessage: 'Add'},
    adding: {id: 'memes.add.adding', defaultMessage: 'Adding…'},
    addTooLarge: {id: 'memes.add.tooLarge', defaultMessage: 'The image is larger than {size} MB.'},
    addFailed: {id: 'memes.add.failed', defaultMessage: 'Couldn’t add it: {error}'},
    addDone: {id: 'memes.add.done', defaultMessage: 'Added! “{title}” is in the gallery, and first in your last memes.'},
    addMakeMeme: {id: 'memes.add.makeMeme', defaultMessage: 'Make a meme with it'},
    addClose: {id: 'memes.add.close', defaultMessage: 'Done'},

    // Deleting a custom template
    deleteTemplate: {id: 'memes.delete.button', defaultMessage: 'Delete “{title}”'},
    deleteTitle: {id: 'memes.delete.title', defaultMessage: 'Delete this meme template?'},
    deleteLead: {id: 'memes.delete.lead', defaultMessage: '“{title}” will no longer be in the gallery, for anyone. The memes already posted with it stay.'},
    deleteConfirm: {id: 'memes.delete.confirm', defaultMessage: 'Delete'},
    deleting: {id: 'memes.delete.deleting', defaultMessage: 'Deleting…'},
    deleteFailed: {id: 'memes.delete.failed', defaultMessage: 'Couldn’t delete it: {error}'},
});
