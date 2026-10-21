package memelibrary

import (
	"image/color"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsImageAsset(t *testing.T) {
	assert.True(t, isImageAsset("all-the-things.jpg"))
	assert.False(t, isImageAsset("all-the-things.json"))
}

func TestMustLoadImage(t *testing.T) {
	assert.NotPanics(t, func() {
		img := mustLoadImage("images/all-the-things.jpg")
		assert.NotNil(t, img)
	})

	assert.Panics(t, func() {
		mustLoadImage("this-asset-does-not-exist.jpg")
	})

	assert.Panics(t, func() {
		mustLoadImage("metadata/all-the-things.yaml")
	})
}

func TestTemplate(t *testing.T) {
	assert.Nil(t, Template("not-a-template"))

	template := Template("all-the-things")
	require.NotNil(t, template)
	assert.NotNil(t, template.Image)
}

func TestPatternMatch(t *testing.T) {
	for name, metadata := range Memes() {
		for _, pattern := range metadata.Patterns {
			template, text := PatternMatch(pattern.Example)
			assert.Equal(t, Template(name), template)
			assert.NotNil(t, text)
		}
	}
}

func TestSliceToColorClampsValues(t *testing.T) {
	assert.Equal(t, color.RGBA{255, 0, 128, 255}, sliceToColor([]int{255, 0, 128}))
	assert.Equal(t, color.RGBA{255, 0, 10, 255}, sliceToColor([]int{300, -5, 10}), "out of 0–255, clamped, not wrapped")
	assert.Equal(t, color.RGBA{0, 0, 0, 255}, sliceToColor([]int{-1, -1, -1, 1000}))
	assert.Equal(t, color.RGBA{200, 200, 200, 0}, sliceToColor([]int{200, -20}))
	assert.Equal(t, color.Gray{255}, sliceToColor([]int{256}))
	assert.Nil(t, sliceToColor(nil))
	assert.Nil(t, sliceToColor([]int{1, 2, 3, 4, 5}))
}
