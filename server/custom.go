// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"net/http"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/mattermost/mattermost/server/public/model"
	"golang.org/x/text/unicode/norm"

	"github.com/antimatterchat/antimatter-plugin-memes/server/memelibrary"
)

// Custom templates are the meme templates people add, besides the built-in ones. They're kept in
// the plugin's KV store: an index of their metadata under one key, and the image of each (a JPEG
// of at most maxTemplateSide pixels a side, so a few hundred KB) under a key of its own. The
// KV store is a Postgres bytea column without a size limit of its own, read and written whole
// over the plugin RPC (net/rpc, without gRPC's message limit), so it holds such images reliably,
// with no file store involved: it works the same with the local and S3 file stores, and on every
// node of a cluster.
const (
	customIndexKey    = "custom_templates"
	customImagePrefix = "custom_template_"

	// maxCustomTemplates bounds the custom templates, and so the index.
	maxCustomTemplates = 500
	maxTitleLength     = 60
	maxKeywordsLength  = 300
	maxKeywords        = 20
	maxNameLength      = 40
)

// The caption layouts of custom templates: which of the top, middle and bottom captions they
// take, in order (the dialog's fields, and the texts of /meme).
const defaultLayout = "top-bottom"

var layouts = map[string][]string{
	"top-bottom":        {"top", "bottom"},
	"top":               {"top"},
	"bottom":            {"bottom"},
	"top-middle-bottom": {"top", "middle", "bottom"},
}

// reservedNames can't name a custom template: they mean something else to /meme.
var reservedNames = map[string]bool{"help": true}

// CustomTemplate is a template someone added.
type CustomTemplate struct {
	Name      string   `json:"name"`
	Title     string   `json:"title"`
	Keywords  []string `json:"keywords,omitempty"`
	Layout    string   `json:"layout"`
	Width     int      `json:"width"`
	Height    int      `json:"height"`
	ImageKey  string   `json:"image_key"`
	CreatorID string   `json:"creator_id"`
	CreateAt  int64    `json:"create_at"`
}

// captions are the captions the template takes, in order.
func (t *CustomTemplate) captions() []string {
	if l, ok := layouts[t.Layout]; ok {
		return l
	}
	return layouts[defaultLayout]
}

// apply keeps the captions of the template's layout.
func (t *CustomTemplate) apply(c memelibrary.Captions) memelibrary.Captions {
	var out memelibrary.Captions
	for _, key := range t.captions() {
		switch key {
		case "top":
			out.Top = c.Top
		case "middle":
			out.Middle = c.Middle
		case "bottom":
			out.Bottom = c.Bottom
		}
	}
	return out
}

// fromText makes captions of the texts of /meme, in the order of the template's layout.
func (t *CustomTemplate) fromText(text []string) memelibrary.Captions {
	var c memelibrary.Captions
	for i, key := range t.captions() {
		if i >= len(text) {
			break
		}
		switch key {
		case "top":
			c.Top = text[i]
		case "middle":
			c.Middle = text[i]
		case "bottom":
			c.Bottom = text[i]
		}
	}
	return c
}

// slugify makes the base of a template's name of its title: "Ça, c'est 2 memes!" is
// "ca-c-est-2-memes".
func slugify(title string) string {
	var b strings.Builder
	dash := false
	for _, r := range norm.NFD.String(strings.ToLower(title)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		case unicode.Is(unicode.Mn, r):
			// Accents
		case b.Len() > 0 && !dash:
			b.WriteByte('-')
			dash = true
		}
	}
	s := strings.Trim(b.String(), "-")
	if len(s) > maxNameLength {
		s = s[:maxNameLength]
		if i := strings.LastIndexByte(s, '-'); i > maxNameLength/2 {
			s = s[:i]
		}
		s = strings.Trim(s, "-")
	}
	if s == "" {
		s = "template"
	}
	return s
}

// uniqueName returns base, or base-2, base-3... the first name that isn't taken.
func uniqueName(base string, taken func(string) bool) string {
	name := base
	for i := 2; taken(name); i++ {
		name = fmt.Sprintf("%s-%d", base, i)
	}
	return name
}

// parseKeywords reads the search keywords of a template: separated by commas, without case or
// duplicates.
func parseKeywords(s string) []string {
	var out []string
	seen := map[string]bool{}
	for k := range strings.SplitSeq(s, ",") {
		k = strings.ToLower(strings.Join(strings.Fields(k), " "))
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, k)
		if len(out) == maxKeywords {
			break
		}
	}
	return out
}

// validTitle checks a template's title.
func validTitle(title string) error {
	if title == "" {
		return &apiError{http.StatusBadRequest, "a name is required"}
	}
	if utf8.RuneCountInString(title) > maxTitleLength {
		return &apiError{http.StatusBadRequest, fmt.Sprintf("the name is longer than %d characters", maxTitleLength)}
	}
	return nil
}

// kvAPI is the part of the plugin API the custom templates use.
type kvAPI interface {
	KVGet(key string) ([]byte, *model.AppError)
	KVSetWithOptions(key string, value []byte, options model.PluginKVSetOptions) (bool, *model.AppError)
	KVDelete(key string) *model.AppError
}

// customStore keeps the custom templates in the KV store, and caches their images.
type customStore struct {
	kv kvAPI
	// images are the decoded images of the templates, and thumbs their encoded thumbnails, by
	// image key (a new one for each template, so they're never stale).
	images *lru[image.Image]
	thumbs *lru[[]byte]
}

func newCustomStore(kv kvAPI) *customStore {
	return &customStore{kv: kv, images: newLRU[image.Image](16), thumbs: newLRU[[]byte](512)}
}

// list returns the custom templates, oldest first, and the index they're read from.
func (s *customStore) list() ([]*CustomTemplate, []byte, error) {
	data, appErr := s.kv.KVGet(customIndexKey)
	if appErr != nil {
		return nil, nil, appErr
	}
	list := []*CustomTemplate{}
	if data != nil {
		if err := json.Unmarshal(data, &list); err != nil {
			return nil, nil, err
		}
	}
	return list, data, nil
}

// get returns a custom template by its name, or nil.
func (s *customStore) get(name string) (*CustomTemplate, error) {
	list, _, err := s.list()
	if err != nil {
		return nil, err
	}
	for _, t := range list {
		if t.Name == name {
			return t, nil
		}
	}
	return nil, nil
}

// update changes the index atomically, retrying when another request changed it meanwhile.
func (s *customStore) update(change func([]*CustomTemplate) ([]*CustomTemplate, error)) error {
	for range 5 {
		list, old, err := s.list()
		if err != nil {
			return err
		}
		list, err = change(list)
		if err != nil {
			return err
		}
		data, err := json.Marshal(list)
		if err != nil {
			return err
		}
		ok, appErr := s.kv.KVSetWithOptions(customIndexKey, data, model.PluginKVSetOptions{Atomic: true, OldValue: old})
		if appErr != nil {
			return appErr
		}
		if ok {
			return nil
		}
	}
	return &apiError{http.StatusConflict, "the templates changed meanwhile: try again"}
}

// add stores a template and its image (a JPEG), under a name of its title that no built-in or
// custom template has.
func (s *customStore) add(t *CustomTemplate, img []byte) (*CustomTemplate, error) {
	t.ImageKey = customImagePrefix + model.NewId()
	if _, appErr := s.kv.KVSetWithOptions(t.ImageKey, img, model.PluginKVSetOptions{}); appErr != nil {
		return nil, appErr
	}
	base := slugify(t.Title)
	err := s.update(func(list []*CustomTemplate) ([]*CustomTemplate, error) {
		if len(list) >= maxCustomTemplates {
			return nil, &apiError{http.StatusConflict, fmt.Sprintf("there are already %d custom templates: delete some first", maxCustomTemplates)}
		}
		names := make(map[string]bool, len(list))
		for _, c := range list {
			names[c.Name] = true
		}
		t.Name = uniqueName(base, func(name string) bool {
			return names[name] || reservedNames[name] || memelibrary.Canonical(name) != ""
		})
		return append(list, t), nil
	})
	if err != nil {
		_ = s.kv.KVDelete(t.ImageKey)
		return nil, err
	}
	return t, nil
}

// remove deletes a custom template, when allowed says so.
func (s *customStore) remove(name string, allowed func(*CustomTemplate) error) (*CustomTemplate, error) {
	var removed *CustomTemplate
	err := s.update(func(list []*CustomTemplate) ([]*CustomTemplate, error) {
		removed = nil
		out := make([]*CustomTemplate, 0, len(list))
		for _, t := range list {
			if t.Name == name && removed == nil {
				if err := allowed(t); err != nil {
					return nil, err
				}
				removed = t
				continue
			}
			out = append(out, t)
		}
		if removed == nil {
			return nil, &apiError{http.StatusNotFound, "unknown template"}
		}
		return out, nil
	})
	if err != nil {
		return nil, err
	}
	if appErr := s.kv.KVDelete(removed.ImageKey); appErr != nil {
		return removed, appErr
	}
	s.images.remove(removed.ImageKey)
	return removed, nil
}

// image returns the image of a custom template.
func (s *customStore) image(t *CustomTemplate) (image.Image, error) {
	if img, ok := s.images.get(t.ImageKey); ok {
		return img, nil
	}
	data, appErr := s.kv.KVGet(t.ImageKey)
	if appErr != nil {
		return nil, appErr
	}
	if data == nil {
		return nil, &apiError{http.StatusNotFound, "the template's image is missing"}
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	s.images.put(t.ImageKey, img)
	return img, nil
}

// thumbnail returns a custom template's image scaled to a width, as a JPEG.
func (s *customStore) thumbnail(t *CustomTemplate, width int) ([]byte, error) {
	key := fmt.Sprintf("%s@%d", t.ImageKey, width)
	if data, ok := s.thumbs.get(key); ok {
		return data, nil
	}
	img, err := s.image(t)
	if err != nil {
		return nil, err
	}
	data, err := encodeJPEG(memelibrary.Scale(img, width))
	if err != nil {
		return nil, err
	}
	s.thumbs.put(key, data)
	return data, nil
}
