// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package main

import (
	"strings"
	"testing"
)

func TestHelpText(t *testing.T) {
	text := helpText("https://chat.example.com", []string{"brace-yourself", "drake", "lab-cat"})

	for _, want := range []string{
		"Type `/meme` on its own",
		"`/meme brace-yourself \"brace yourself.\" \"memes are coming.\"`",
		"`/meme brace yourself. memes are coming.`",
		"(https://chat.example.com/plugins/memes/templates/brace-yourselves.jpg?text=brace+yourself.&text=memes+are+coming.)",
		"Templates: brace-yourself, drake, lab-cat",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("the help doesn't say %q:\n%s", want, text)
		}
	}

	// Plain words, in British spelling.
	lower := strings.ToLower(text)
	for _, casual := range []string{"meming", "culture", "awesome", "recognize", "mattermost"} {
		if strings.Contains(lower, casual) {
			t.Errorf("the help says %q:\n%s", casual, text)
		}
	}
}

func TestHelpExamplesWork(t *testing.T) {
	// The two ways the help shows resolve to the same built-in template.
	named, namedText, err := resolveMeme(`brace-yourself "brace yourself." "memes are coming."`)
	if err != nil {
		t.Fatalf("the named example doesn't resolve: %v", err)
	}
	phrased, phrasedText, err := resolveMeme("brace yourself. memes are coming.")
	if err != nil {
		t.Fatalf("the worded example doesn't resolve: %v", err)
	}
	if named.Name != phrased.Name {
		t.Errorf("the examples make different memes: %s and %s", named.Name, phrased.Name)
	}
	if len(namedText) != 2 || len(phrasedText) == 0 {
		t.Errorf("the examples' captions: %q and %q", namedText, phrasedText)
	}
}

func TestUnknownTemplateError(t *testing.T) {
	_, _, err := resolveMeme("no-such-template hello")
	if err == nil || !strings.Contains(err.Error(), `"no-such-template"`) {
		t.Errorf("an unknown template gives %v", err)
	}
}
