// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package memelibrary

import (
	"fmt"
	"image"
	"image/color"
	"sort"
	"sync"
	"unicode/utf8"

	xdraw "golang.org/x/image/draw"

	"github.com/antimatterchat/antimatter-plugin-memes/server/meme"
)

const (
	// MaxCaptionLength bounds each caption and box, in characters.
	MaxCaptionLength = 200
	// MaxBoxes bounds the boxes a template may have.
	MaxBoxes = 10
)

// Captions are what someone writes on a template: captions across the whole image at its top,
// middle and bottom, as on imgflip, and the text of the template's own boxes (Drake's panels, the
// distracted boyfriend's labels...).
type Captions struct {
	Top    string   `json:"top"`
	Middle string   `json:"middle"`
	Bottom string   `json:"bottom"`
	Boxes  []string `json:"boxes,omitempty"`
}

// Validate checks the captions' lengths.
func (c Captions) Validate() error {
	for _, s := range append([]string{c.Top, c.Middle, c.Bottom}, c.Boxes...) {
		if utf8.RuneCountInString(s) > MaxCaptionLength {
			return fmt.Errorf("a caption is longer than %d characters", MaxCaptionLength)
		}
	}
	if len(c.Boxes) > MaxBoxes {
		return fmt.Errorf("at most %d boxes", MaxBoxes)
	}
	return nil
}

// Empty tells whether there's no text at all.
func (c Captions) Empty() bool {
	if c.Top != "" || c.Middle != "" || c.Bottom != "" {
		return false
	}
	for _, b := range c.Boxes {
		if b != "" {
			return false
		}
	}
	return true
}

// Info describes a template for the meme picker.
type Info struct {
	Name    string   `json:"name"`
	Title   string   `json:"title"`
	Aliases []string `json:"aliases,omitempty"`
	Width   int      `json:"width"`
	Height  int      `json:"height"`
	// Boxes is the number of the template's own boxes, written after the captions.
	Boxes int `json:"boxes"`
	// Example is the template's example text, to show as placeholders: top and bottom captions
	// when the template has no boxes, else one per box.
	Example []string `json:"example,omitempty"`
}

// List returns the templates, by title.
func List() []Info {
	list := make([]Info, 0, len(metadata))
	for name, m := range metadata {
		b := images[name].Bounds()
		title := m.Title
		if title == "" {
			title = name
		}
		list = append(list, Info{Name: name, Title: title, Aliases: m.Aliases, Width: b.Dx(), Height: b.Dy(), Boxes: len(m.Slots), Example: m.Example})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Title < list[j].Title })
	return list
}

// Canonical returns the name of a template from its name or one of its aliases, or "".
func Canonical(name string) string {
	t := templates[name]
	if t == nil {
		return ""
	}
	return t.Name
}

// Title returns a template's title.
func Title(name string) string {
	if m := metadata[Canonical(name)]; m != nil && m.Title != "" {
		return m.Title
	}
	return name
}

func captionSlot(bounds image.Rectangle, align meme.VerticalAlignment) *meme.TextSlot {
	return &meme.TextSlot{
		Bounds:            bounds,
		Font:              fonts["Anton-Regular"],
		TextColor:         color.White,
		OutlineColor:      color.Black,
		AllUppercase:      true,
		VerticalAlignment: align,
	}
}

// captionSlots are the three bands of an image the captions go in.
func captionSlots(b image.Rectangle) []*meme.TextSlot {
	w, h := b.Dx(), b.Dy()
	padding := h / 20
	return []*meme.TextSlot{
		captionSlot(image.Rect(padding, padding, w-padding, h/4), meme.Top),
		captionSlot(image.Rect(padding, h*3/8, w-padding, h*5/8), meme.Middle),
		captionSlot(image.Rect(padding, h*3/4, w-padding, h-padding), meme.Bottom),
	}
}

// Compose draws captions on a template.
func Compose(name string, c Captions) (image.Image, error) {
	name = Canonical(name)
	if name == "" {
		return nil, fmt.Errorf("unknown template")
	}
	if err := c.Validate(); err != nil {
		return nil, err
	}
	img := images[name]
	var boxes []*meme.TextSlot
	if m := metadata[name]; len(m.Slots) > 0 {
		boxes = m.TextSlots(img.Bounds())
	}
	return render(name, img, c, boxes)
}

// ComposeImage draws captions across an image that isn't one of the built-in templates (a custom
// template): its top, middle and bottom captions, as on the built-in ones.
func ComposeImage(img image.Image, c Captions) (image.Image, error) {
	if err := c.Validate(); err != nil {
		return nil, err
	}
	return render("", img, Captions{Top: c.Top, Middle: c.Middle, Bottom: c.Bottom}, nil)
}

// render draws the captions across an image, then the text of its own boxes.
func render(name string, img image.Image, c Captions, boxes []*meme.TextSlot) (image.Image, error) {
	slots := captionSlots(img.Bounds())
	text := []string{c.Top, c.Middle, c.Bottom}
	for i, slot := range boxes {
		if i < len(c.Boxes) {
			slots = append(slots, slot)
			text = append(text, c.Boxes[i])
		}
	}
	t := &meme.Template{Name: name, Image: img, TextSlots: slots}
	return t.Render(text)
}

var thumbnails sync.Map

// Thumbnail returns a template scaled to a width, for the picker (cached).
func Thumbnail(name string, width int) image.Image {
	name = Canonical(name)
	if name == "" {
		return nil
	}
	key := fmt.Sprintf("%s@%d", name, width)
	if img, ok := thumbnails.Load(key); ok {
		return img.(image.Image)
	}
	dst := Scale(images[name], width)
	thumbnails.Store(key, dst)
	return dst
}

// Scale returns an image scaled down to a width, or the image itself when it's not wider.
func Scale(src image.Image, width int) image.Image {
	b := src.Bounds()
	if width <= 0 || width >= b.Dx() {
		return src
	}
	height := max(1, b.Dy()*width/b.Dx())
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, b, xdraw.Src, nil)
	return dst
}

// Font returns the content of the font of the captions (Anton), for the clients' previews.
func Font() []byte {
	return MustAsset("fonts/Anton-Regular.ttf")
}
