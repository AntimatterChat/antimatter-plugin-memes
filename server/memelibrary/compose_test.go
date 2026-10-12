// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package memelibrary

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestList(t *testing.T) {
	list := List()
	require.Len(t, list, 57)
	byName := map[string]Info{}
	for i, info := range list {
		byName[info.Name] = info
		if i > 0 {
			assert.LessOrEqual(t, list[i-1].Title, info.Title, "sorted by title")
		}
	}
	assert.Equal(t, "Disaster girl", byName["disaster-girl"].Title)
	assert.Equal(t, "X, X everywhere", byName["everywhere"].Title)
	assert.Equal(t, "I don't always X, but when I do", byName["the-most-interesting-man-in-the-world"].Title)
	assert.Equal(t, 2, byName["drake"].Boxes)
	assert.Equal(t, 0, byName["disaster-girl"].Boxes)
	assert.Positive(t, byName["disaster-girl"].Width)
}

func TestCompose(t *testing.T) {
	plain, err := Compose("disaster-girl", Captions{})
	require.NoError(t, err)
	img, err := Compose("disaster-girl", Captions{Top: "my house", Middle: "is", Bottom: "lit"})
	require.NoError(t, err)
	assert.Equal(t, plain.Bounds(), img.Bounds())
	assert.NotEqual(t, plain.At(img.Bounds().Dx()/2, img.Bounds().Dy()/8), img.At(img.Bounds().Dx()/2, img.Bounds().Dy()/8), "the top caption is drawn")

	_, err = Compose("i-dont-always", Captions{Top: "x"})
	require.NoError(t, err, "aliases name their template")

	_, err = Compose("drake", Captions{Boxes: []string{"Test in staging", "Test in prod", "ignored: drake has two boxes"}})
	require.NoError(t, err)

	_, err = Compose("nope", Captions{})
	require.Error(t, err)
	_, err = Compose("drake", Captions{Top: strings.Repeat("a", MaxCaptionLength+1)})
	require.Error(t, err)
	_, err = Compose("drake", Captions{Boxes: make([]string, MaxBoxes+1)})
	require.Error(t, err)
}

func TestThumbnail(t *testing.T) {
	img := Thumbnail("success-kid", 120)
	require.NotNil(t, img)
	assert.Equal(t, 120, img.Bounds().Dx())
	assert.Same(t, img, Thumbnail("success-kid", 120), "cached")
	assert.Nil(t, Thumbnail("nope", 120))
}

func TestCaptionsEmpty(t *testing.T) {
	assert.True(t, Captions{Boxes: []string{"", ""}}.Empty())
	assert.False(t, Captions{Boxes: []string{"", "x"}}.Empty())
	assert.True(t, Captions{Top: "  ", Boxes: []string{"\t"}}.Empty())
	assert.False(t, Captions{Middle: "x"}.Empty())
}
