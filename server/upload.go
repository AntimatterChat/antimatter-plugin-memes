// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/draw"
	"net/http"

	// The formats of the images people add
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	// maxUploadBytes bounds the image files people add.
	maxUploadBytes = 5 << 20
	// maxTemplateSide is the largest side of a custom template: larger images are scaled down
	// (the built-in templates are at most 1280 pixels wide).
	maxTemplateSide = 1024
	// minTemplateSide is the smallest side of a custom template, for its captions to fit.
	minTemplateSide = 64
	// maxSourcePixels bounds the images decoded, against decompression bombs.
	maxSourcePixels = 40_000_000
)

var errNotAnImage = &apiError{http.StatusBadRequest, "the file isn't a PNG, JPEG, GIF or WebP image"}

// normalizeImage turns an image file (PNG, JPEG, GIF, of which its first frame, or WebP) into a
// template's image: upright (as its EXIF orientation says), at most maxTemplateSide pixels a
// side, on white where it's transparent, as a JPEG.
func normalizeImage(data []byte) ([]byte, image.Rectangle, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, image.Rectangle{}, errNotAnImage
	}
	switch format {
	case "png", "jpeg", "gif", "webp":
	default:
		return nil, image.Rectangle{}, errNotAnImage
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > maxSourcePixels {
		return nil, image.Rectangle{}, &apiError{http.StatusBadRequest, "the image is too large"}
	}
	if cfg.Width < minTemplateSide || cfg.Height < minTemplateSide {
		return nil, image.Rectangle{}, &apiError{http.StatusBadRequest, "the image is too small: at least 64 pixels a side"}
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, image.Rectangle{}, errNotAnImage
	}

	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w > maxTemplateSide || h > maxTemplateSide {
		if w >= h {
			w, h = maxTemplateSide, max(1, h*maxTemplateSide/w)
		} else {
			w, h = max(1, w*maxTemplateSide/h), maxTemplateSide
		}
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	if w == b.Dx() && h == b.Dy() {
		draw.Draw(dst, dst.Bounds(), src, b.Min, draw.Over)
	} else {
		xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, b, xdraw.Over, nil)
	}
	var img image.Image = dst
	if format == "jpeg" {
		img = orient(dst, jpegOrientation(data))
	}
	out, err := encodeJPEG(img)
	if err != nil {
		return nil, image.Rectangle{}, err
	}
	return out, img.Bounds(), nil
}

// jpegOrientation returns the EXIF orientation of a JPEG file (1 to 8), 1 when it has none.
func jpegOrientation(data []byte) int {
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return 1
	}
	for i := 2; i+4 <= len(data); {
		if data[i] != 0xFF {
			return 1
		}
		marker := data[i+1]
		switch {
		case marker == 0xFF:
			i++
			continue
		case marker == 0x01 || (marker >= 0xD0 && marker <= 0xD8):
			i += 2
			continue
		case marker == 0xDA || marker == 0xD9:
			// The image data: no EXIF before it
			return 1
		}
		size := int(binary.BigEndian.Uint16(data[i+2:]))
		if size < 2 || i+2+size > len(data) {
			return 1
		}
		segment := data[i+4 : i+2+size]
		if marker == 0xE1 && len(segment) > 14 && string(segment[:6]) == "Exif\x00\x00" {
			return tiffOrientation(segment[6:])
		}
		i += 2 + size
	}
	return 1
}

// tiffOrientation reads the orientation tag of EXIF data (a TIFF header and its first IFD).
func tiffOrientation(t []byte) int {
	if len(t) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(t[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	offset := int64(order.Uint32(t[4:]))
	if offset < 8 || offset+2 > int64(len(t)) {
		return 1
	}
	ifd := int(offset)
	count := int(order.Uint16(t[ifd:]))
	for k := range count {
		e := ifd + 2 + k*12
		if e+12 > len(t) {
			return 1
		}
		if order.Uint16(t[e:]) == 0x0112 {
			if v := int(order.Uint16(t[e+8:])); v >= 1 && v <= 8 {
				return v
			}
			return 1
		}
	}
	return 1
}

// orient turns an image upright from its EXIF orientation.
func orient(src *image.RGBA, orientation int) *image.RGBA {
	if orientation < 2 || orientation > 8 {
		return src
	}
	w, h := src.Bounds().Dx(), src.Bounds().Dy()
	dw, dh := w, h
	if orientation >= 5 {
		dw, dh = h, w
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := range dh {
		for x := range dw {
			var sx, sy int
			switch orientation {
			case 2: // Mirrored
				sx, sy = w-1-x, y
			case 3: // Upside down
				sx, sy = w-1-x, h-1-y
			case 4: // Mirrored upside down
				sx, sy = x, h-1-y
			case 5: // Transposed
				sx, sy = y, x
			case 6: // To turn clockwise
				sx, sy = y, h-1-x
			case 7: // Transversed
				sx, sy = w-1-y, h-1-x
			case 8: // To turn counterclockwise
				sx, sy = w-1-y, x
			}
			si := src.PixOffset(sx+src.Rect.Min.X, sy+src.Rect.Min.Y)
			di := dst.PixOffset(x, y)
			copy(dst.Pix[di:di+4], src.Pix[si:si+4])
		}
	}
	return dst
}
