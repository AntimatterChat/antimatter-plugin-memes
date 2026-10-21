// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package meme

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"golang.org/x/image/math/fixed"
)

func TestToFixed(t *testing.T) {
	assert.Equal(t, fixed.Int26_6(0), toFixed(0))
	assert.Equal(t, fixed.Int26_6(640*64), toFixed(640))
	assert.Equal(t, fixed.Int26_6(-12*64), toFixed(-12))
	assert.Equal(t, fixed.Int26_6(maxFixedPixels*64), toFixed(math.MaxInt32), "too large, clamped, not wrapped")
	assert.Equal(t, fixed.Int26_6(minFixedPixels*64), toFixed(math.MinInt32), "too small, clamped")
	assert.Positive(t, toFixed(math.MaxInt))
	assert.Negative(t, toFixed(math.MinInt))
}
