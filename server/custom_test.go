// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/antimatterchat/antimatter-plugin-memes/server/memelibrary"
)

// fakeKV is an in-memory KV store, with the semantics of the server's.
type fakeKV struct {
	mu   sync.Mutex
	data map[string][]byte
	// beforeSet runs before each set, as another request would meanwhile.
	beforeSet func(kv *fakeKV, key string)
}

func newFakeKV() *fakeKV { return &fakeKV{data: map[string][]byte{}} }

func (kv *fakeKV) KVGet(key string) ([]byte, *model.AppError) {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	return kv.data[key], nil
}

func (kv *fakeKV) KVSetWithOptions(key string, value []byte, o model.PluginKVSetOptions) (bool, *model.AppError) {
	if hook := kv.beforeSet; hook != nil {
		kv.beforeSet = nil
		hook(kv, key)
	}
	kv.mu.Lock()
	defer kv.mu.Unlock()
	if o.Atomic {
		current, ok := kv.data[key]
		if (o.OldValue == nil && ok) || (o.OldValue != nil && !bytes.Equal(current, o.OldValue)) {
			return false, nil
		}
	}
	kv.data[key] = value
	return true, nil
}

func (kv *fakeKV) KVDelete(key string) *model.AppError {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	delete(kv.data, key)
	return nil
}

func (kv *fakeKV) keys(prefix string) []string {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	var keys []string
	for k := range kv.data {
		if strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
	}
	return keys
}

func testPNG(t *testing.T, w, h int, c color.Color) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

func TestSlugifyAndUniqueName(t *testing.T) {
	assert.Equal(t, "ca-c-est-2-memes", slugify("Ça, c'est 2 memes!"))
	assert.Equal(t, "template", slugify("猫"))
	assert.Equal(t, "template", slugify("  "))
	long := slugify(strings.Repeat("word ", 20))
	assert.LessOrEqual(t, len(long), maxNameLength)
	assert.False(t, strings.HasSuffix(long, "-"))

	taken := map[string]bool{"cat": true, "cat-2": true}
	assert.Equal(t, "cat-3", uniqueName("cat", func(n string) bool { return taken[n] }))
	assert.Equal(t, "dog", uniqueName("dog", func(n string) bool { return taken[n] }))
}

func TestParseKeywords(t *testing.T) {
	assert.Equal(t, []string{"cat", "office life", "monday"}, parseKeywords(" Cat, office   LIFE ,, monday, cat"))
	assert.Nil(t, parseKeywords(" , "))
	assert.Len(t, parseKeywords(strings.Repeat("a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,", 2)), maxKeywords)
}

func TestLayouts(t *testing.T) {
	c := memelibrary.Captions{Top: "a", Middle: "b", Bottom: "c", Boxes: []string{"d"}}
	assert.Equal(t, memelibrary.Captions{Top: "a", Bottom: "c"}, (&CustomTemplate{Layout: "top-bottom"}).apply(c))
	assert.Equal(t, memelibrary.Captions{Bottom: "c"}, (&CustomTemplate{Layout: "bottom"}).apply(c))
	assert.Equal(t, memelibrary.Captions{Top: "a", Middle: "b", Bottom: "c"}, (&CustomTemplate{Layout: "top-middle-bottom"}).apply(c))
	assert.Equal(t, []string{"top", "bottom"}, (&CustomTemplate{Layout: "unknown"}).captions())

	assert.Equal(t, memelibrary.Captions{Bottom: "only"}, (&CustomTemplate{Layout: "bottom"}).fromText([]string{"only", "ignored"}))
	assert.Equal(t, memelibrary.Captions{Top: "x", Bottom: "y"}, (&CustomTemplate{Layout: "top-bottom"}).fromText([]string{"x", "y"}))
	assert.Equal(t, memelibrary.Captions{Top: "x", Middle: "y"}, (&CustomTemplate{Layout: "top-middle-bottom"}).fromText([]string{"x", "y"}))
}

func TestCustomStore(t *testing.T) {
	kv := newFakeKV()
	s := newCustomStore(kv)
	img, _, err := normalizeImage(testPNG(t, 200, 100, color.White))
	require.NoError(t, err)

	a, err := s.add(&CustomTemplate{Title: "Drake", Layout: "top", CreatorID: "u1"}, img)
	require.NoError(t, err)
	assert.Equal(t, "drake-2", a.Name, "not the name of a built-in template")
	b, err := s.add(&CustomTemplate{Title: "Drake", CreatorID: "u2"}, img)
	require.NoError(t, err)
	assert.Equal(t, "drake-3", b.Name, "nor of another custom one")
	c, err := s.add(&CustomTemplate{Title: "Help", CreatorID: "u2"}, img)
	require.NoError(t, err)
	assert.Equal(t, "help-2", c.Name, "nor a word of /meme")

	list, _, err := s.list()
	require.NoError(t, err)
	require.Len(t, list, 3)
	assert.Len(t, kv.keys(customImagePrefix), 3)

	got, err := s.get("drake-2")
	require.NoError(t, err)
	assert.Equal(t, "u1", got.CreatorID)
	decoded, err := s.image(got)
	require.NoError(t, err)
	assert.Equal(t, image.Rect(0, 0, 200, 100), decoded.Bounds())
	thumb, err := s.thumbnail(got, 50)
	require.NoError(t, err)
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(thumb))
	require.NoError(t, err)
	assert.Equal(t, 50, cfg.Width)

	_, err = s.remove("drake-2", func(*CustomTemplate) error { return &apiError{http.StatusForbidden, "no"} })
	assert.Equal(t, http.StatusForbidden, statusFor(err))
	removed, err := s.remove("drake-2", func(*CustomTemplate) error { return nil })
	require.NoError(t, err)
	assert.Equal(t, a.ImageKey, removed.ImageKey)
	assert.Len(t, kv.keys(customImagePrefix), 2, "its image is deleted too")
	_, err = s.remove("drake-2", func(*CustomTemplate) error { return nil })
	assert.Equal(t, http.StatusNotFound, statusFor(err))
	got, err = s.get("drake-2")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestCustomStoreRetriesConcurrentChanges(t *testing.T) {
	kv := newFakeKV()
	s := newCustomStore(kv)
	// Another request adds a template of the same name between the reading of the index and
	// its writing.
	kv.beforeSet = func(kv *fakeKV, key string) {
		kv.beforeSet = func(kv *fakeKV, key string) {
			require.Equal(t, customIndexKey, key)
			_, err := s.add(&CustomTemplate{Title: "Cat"}, []byte("other"))
			require.NoError(t, err)
		}
	}
	mine, err := s.add(&CustomTemplate{Title: "Cat"}, []byte("mine"))
	require.NoError(t, err)
	assert.Equal(t, "cat-2", mine.Name, "named again after the other one")
	list, _, err := s.list()
	require.NoError(t, err)
	require.Len(t, list, 2)
	assert.Equal(t, "cat", list[0].Name)
}

func TestNormalizeImage(t *testing.T) {
	data, b, err := normalizeImage(testPNG(t, 3000, 1500, color.NRGBA{0, 0, 0, 0}))
	require.NoError(t, err)
	assert.Equal(t, image.Rect(0, 0, maxTemplateSide, maxTemplateSide/2), b, "scaled down")
	img, format, err := image.Decode(bytes.NewReader(data))
	require.NoError(t, err)
	assert.Equal(t, "jpeg", format)
	r, g, bl, _ := img.At(10, 10).RGBA()
	assert.Greater(t, r+g+bl, uint32(3*0xf000), "transparency is white")

	_, _, err = normalizeImage([]byte("not an image"))
	assert.Equal(t, errNotAnImage, err)
	_, _, err = normalizeImage(testPNG(t, 20, 200, color.White))
	assert.Equal(t, http.StatusBadRequest, statusFor(err), "too small")
}

// jpegWithOrientation makes a JPEG with an EXIF orientation.
func jpegWithOrientation(t *testing.T, w, h, orientation int, order binary.ByteOrder) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.White)
		}
	}
	// A red top left corner
	for y := range h / 4 {
		for x := range w / 4 {
			img.Set(x, y, color.RGBA{255, 0, 0, 255})
		}
	}
	var buf bytes.Buffer
	require.NoError(t, jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95}))
	raw := buf.Bytes()

	tiff := make([]byte, 8+2+12+4)
	if order == binary.LittleEndian {
		copy(tiff, "II")
	} else {
		copy(tiff, "MM")
	}
	order.PutUint16(tiff[2:], 42)
	order.PutUint32(tiff[4:], 8)
	order.PutUint16(tiff[8:], 1)
	order.PutUint16(tiff[10:], 0x0112)
	order.PutUint16(tiff[12:], 3)
	order.PutUint32(tiff[14:], 1)
	order.PutUint16(tiff[18:], uint16(orientation))
	segment := append([]byte("Exif\x00\x00"), tiff...)
	app1 := []byte{0xFF, 0xE1, 0, 0}
	binary.BigEndian.PutUint16(app1[2:], uint16(len(segment)+2))
	out := append([]byte{}, raw[:2]...)
	out = append(out, app1...)
	out = append(out, segment...)
	return append(out, raw[2:]...)
}

func TestEXIFOrientation(t *testing.T) {
	assert.Equal(t, 6, jpegOrientation(jpegWithOrientation(t, 80, 120, 6, binary.BigEndian)))
	assert.Equal(t, 8, jpegOrientation(jpegWithOrientation(t, 80, 120, 8, binary.LittleEndian)))
	assert.Equal(t, 1, jpegOrientation(testPNG(t, 80, 80, color.White)))
	assert.Equal(t, 1, jpegOrientation([]byte{0xFF, 0xD8, 0xFF, 0xE1, 0xFF}), "truncated")

	isRed := func(c color.Color) bool {
		r, g, _, _ := c.RGBA()
		return r > 0xc000 && g < 0x4000
	}
	// A picture taken with the phone turned: its top left corner is the top right one, upright.
	data, b, err := normalizeImage(jpegWithOrientation(t, 80, 120, 6, binary.BigEndian))
	require.NoError(t, err)
	assert.Equal(t, image.Rect(0, 0, 120, 80), b)
	img, _, err := image.Decode(bytes.NewReader(data))
	require.NoError(t, err)
	assert.True(t, isRed(img.At(115, 5)))
	assert.False(t, isRed(img.At(5, 5)))

	data, _, err = normalizeImage(jpegWithOrientation(t, 80, 120, 3, binary.LittleEndian))
	require.NoError(t, err)
	img, _, err = image.Decode(bytes.NewReader(data))
	require.NoError(t, err)
	assert.True(t, isRed(img.At(75, 115)), "upside down")
}

func TestLRU(t *testing.T) {
	c := newLRU[int](2)
	c.put("a", 1)
	c.put("b", 2)
	_, _ = c.get("a")
	c.put("c", 3)
	_, ok := c.get("b")
	assert.False(t, ok, "the least recently used goes")
	v, ok := c.get("a")
	assert.True(t, ok)
	assert.Equal(t, 1, v)
	c.remove("a")
	_, ok = c.get("a")
	assert.False(t, ok)
}

// upload posts a template to the API.
func upload(p *Plugin, userID string, fields map[string]string, file []byte) *httptest.ResponseRecorder {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	if file != nil {
		fw, _ := mw.CreateFormFile("file", "cat.png")
		_, _ = fw.Write(file)
	}
	_ = mw.Close()
	r := httptest.NewRequest(http.MethodPost, "/api/v1/templates", &body)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	r.Header.Set("Mattermost-User-Id", userID)
	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, r)
	return w
}

// customAPI mocks the API for the custom templates: maya is a system admin, priya and sam aren't.
func customAPI() *plugintest.API {
	api := &plugintest.API{}
	api.On("HasPermissionTo", "maya", model.PermissionManageSystem).Return(true)
	api.On("HasPermissionTo", mock.Anything, model.PermissionManageSystem).Return(false)
	api.On("KVGet", mock.MatchedBy(func(k string) bool { return strings.HasPrefix(k, "recent_") })).Return(nil, nil)
	api.On("KVSet", mock.MatchedBy(func(k string) bool { return strings.HasPrefix(k, "recent_") }), mock.Anything).Return(nil)
	api.On("RegisterCommand", mock.Anything).Return(nil)
	api.On("PublishPluginClusterEvent", mock.Anything, mock.Anything).Return(nil)
	api.On("LogInfo", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return()
	return api
}

func templatesFor(t *testing.T, p *Plugin, userID string) map[string]templateInfo {
	w := do(p, http.MethodGet, "/api/v1/templates", userID, nil)
	require.Equal(t, http.StatusOK, w.Code)
	var list []templateInfo
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &list))
	byName := map[string]templateInfo{}
	for _, info := range list {
		byName[info.Name] = info
	}
	return byName
}

func TestAddListAndDeleteTemplates(t *testing.T) {
	api := customAPI()
	p := newTestPlugin(api)
	png := testPNG(t, 400, 300, color.RGBA{30, 120, 200, 255})

	w := upload(p, "priya", map[string]string{"title": "  Lab   cat ", "keywords": "cat, Lab", "layout": "bottom"}, png)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var added templateInfo
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &added))
	assert.Equal(t, "lab-cat", added.Name)
	assert.Equal(t, "Lab cat", added.Title)
	assert.Equal(t, []string{"bottom"}, added.Captions)
	assert.Equal(t, []string{"cat", "lab"}, added.Keywords)
	assert.True(t, added.Custom)
	assert.True(t, added.CanDelete)
	assert.Equal(t, 400, added.Width)
	api.AssertCalled(t, "KVSet", "recent_priya", mock.Anything)
	api.AssertCalled(t, "RegisterCommand", mock.MatchedBy(func(c *model.Command) bool {
		return strings.Contains(names(c.AutocompleteData), "lab-cat")
	}))

	// Listed with the built-in ones, which they can delete, or not
	all := templatesFor(t, p, "priya")
	assert.Len(t, all, 58)
	assert.True(t, all["lab-cat"].CanDelete, "its creator")
	assert.False(t, all["drake"].Custom)
	assert.False(t, templatesFor(t, p, "sam")["lab-cat"].CanDelete, "another user")
	assert.True(t, templatesFor(t, p, "maya")["lab-cat"].CanDelete, "a system admin")

	// Drawn as the built-in ones, with the captions of its layout
	w = do(p, http.MethodGet, "/api/v1/templates/lab-cat/render?top=ignored&bottom=meow", "sam", nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "image/jpeg", w.Header().Get("Content-Type"))
	w = do(p, http.MethodGet, "/api/v1/templates/lab-cat/thumbnail?width=100", "sam", nil)
	require.Equal(t, http.StatusOK, w.Code)
	cfg, err := jpeg.DecodeConfig(w.Body)
	require.NoError(t, err)
	assert.Equal(t, 100, cfg.Width)
	assert.Equal(t, http.StatusNotFound, do(p, http.MethodGet, "/templates/lab-cat.jpg", "", nil).Code, "no public URL")

	// Deleted by its creator or an admin only
	assert.Equal(t, http.StatusForbidden, do(p, http.MethodDelete, "/api/v1/templates/lab-cat", "sam", nil).Code)
	assert.Equal(t, http.StatusForbidden, do(p, http.MethodDelete, "/api/v1/templates/drake", "maya", nil).Code, "built-in")
	assert.Equal(t, http.StatusNotFound, do(p, http.MethodDelete, "/api/v1/templates/nope", "maya", nil).Code)
	assert.Equal(t, http.StatusOK, do(p, http.MethodDelete, "/api/v1/templates/lab-cat", "maya", nil).Code)
	assert.NotContains(t, templatesFor(t, p, "priya"), "lab-cat")
	assert.Equal(t, http.StatusNotFound, do(p, http.MethodGet, "/api/v1/templates/lab-cat/render", "priya", nil).Code)

	w = upload(p, "priya", map[string]string{"title": "Mine"}, png)
	require.Equal(t, http.StatusCreated, w.Code)
	assert.Equal(t, http.StatusOK, do(p, http.MethodDelete, "/api/v1/templates/mine", "priya", nil).Code, "by its creator")
}

func names(a *model.AutocompleteData) string {
	var out []string
	for _, sub := range a.SubCommands {
		out = append(out, sub.Trigger)
	}
	return strings.Join(out, " ")
}

func TestAddTemplateRefused(t *testing.T) {
	p := newTestPlugin(customAPI())
	png := testPNG(t, 200, 200, color.White)

	assert.Equal(t, http.StatusBadRequest, upload(p, "priya", map[string]string{"title": " "}, png).Code, "no name")
	assert.Equal(t, http.StatusBadRequest, upload(p, "priya", map[string]string{"title": strings.Repeat("x", maxTitleLength+1)}, png).Code)
	assert.Equal(t, http.StatusBadRequest, upload(p, "priya", map[string]string{"title": "x", "layout": "sideways"}, png).Code)
	assert.Equal(t, http.StatusBadRequest, upload(p, "priya", map[string]string{"title": "x"}, nil).Code, "no file")
	w := upload(p, "priya", map[string]string{"title": "x"}, []byte("plain text, not an image"))
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "isn't a PNG, JPEG, GIF or WebP image")
	w = upload(p, "priya", map[string]string{"title": "x"}, make([]byte, maxUploadBytes+1))
	assert.Equal(t, http.StatusRequestEntityTooLarge, w.Code)

	var cfg clientConfig
	require.NoError(t, json.Unmarshal(do(p, http.MethodGet, "/api/v1/config", "priya", nil).Body.Bytes(), &cfg))
	assert.True(t, cfg.CanAdd, "everyone can add templates by default")

	// When only system admins can
	p.setConfiguration(&configuration{WhoCanAddTemplates: addTemplatesAdmins})
	require.NoError(t, json.Unmarshal(do(p, http.MethodGet, "/api/v1/config", "priya", nil).Body.Bytes(), &cfg))
	assert.False(t, cfg.CanAdd)
	assert.Equal(t, http.StatusForbidden, upload(p, "priya", map[string]string{"title": "x"}, png).Code)
	require.NoError(t, json.Unmarshal(do(p, http.MethodGet, "/api/v1/config", "maya", nil).Body.Bytes(), &cfg))
	assert.True(t, cfg.CanAdd)
	assert.Equal(t, http.StatusCreated, upload(p, "maya", map[string]string{"title": "x"}, png).Code)
}

func TestPostCustomMeme(t *testing.T) {
	api := customAPI()
	api.On("GetConfig").Return(&model.Config{})
	api.On("GetChannel", "c1").Return(&model.Channel{Id: "c1"}, nil)
	api.On("HasPermissionToChannel", "sam", "c1", model.PermissionCreatePost).Return(true)
	api.On("UploadFile", mock.Anything, "c1", "lab-cat.jpg").Return(&model.FileInfo{Id: "f1"}, nil)
	var posted []*model.Post
	api.On("CreatePost", mock.Anything).Run(func(args mock.Arguments) { posted = append(posted, args.Get(0).(*model.Post)) }).Return(&model.Post{Id: "p1", CreateAt: 1}, nil)
	p := newTestPlugin(api)
	require.Equal(t, http.StatusCreated, upload(p, "priya", map[string]string{"title": "Lab cat", "layout": "bottom"}, testPNG(t, 300, 300, color.White)).Code)

	// From the dialog: only the captions of its layout
	w := do(p, http.MethodPost, "/api/v1/memes", "sam", map[string]any{"channel_id": "c1", "template": "lab-cat", "top": "dropped", "bottom": "meow"})
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	meme := posted[0].GetProp(memeProp).(map[string]any)
	assert.Equal(t, "lab-cat", meme["template"])
	assert.Equal(t, "", meme["top"])
	assert.Equal(t, "meow", meme["bottom"])
	assert.Equal(t, http.StatusBadRequest, do(p, http.MethodPost, "/api/v1/memes", "sam", map[string]any{"channel_id": "c1", "template": "lab-cat", "top": "not in its layout"}).Code)

	// With /meme, by its name
	resp, appErr := p.ExecuteCommand(nil, &model.CommandArgs{UserId: "sam", ChannelId: "c1", Command: `/meme lab-cat "purr"`})
	require.Nil(t, appErr)
	assert.Equal(t, &model.CommandResponse{}, resp, "posted as a file, nothing else")
	require.Len(t, posted, 2)
	assert.Equal(t, "purr", posted[1].GetProp(memeProp).(map[string]any)["bottom"])

	_, appErr = p.ExecuteCommand(nil, &model.CommandArgs{UserId: "sam", ChannelId: "c1", Command: `/meme lab-cat`})
	require.NotNil(t, appErr)
	assert.Contains(t, appErr.Id, "write something on the meme")
	_, appErr = p.ExecuteCommand(nil, &model.CommandArgs{UserId: "sam", ChannelId: "c1", Command: `/meme no-such-cat "x"`})
	require.NotNil(t, appErr)
}

// TestTemplatePermissionsByRole checks who may add and delete custom templates, as the server
// decides for every request: a member, a system admin and a guest (who counts as everyone: the
// plugin doesn't tell guests apart), with each WhoCanAddTemplates setting, custom templates off
// included.
func TestTemplatePermissionsByRole(t *testing.T) {
	png := testPNG(t, 200, 200, color.White)
	const (
		member = "priya"
		admin  = "maya"
		guest  = "gina"
	)
	configFor := func(p *Plugin, userID string) clientConfig {
		var cfg clientConfig
		require.NoError(t, json.Unmarshal(do(p, http.MethodGet, "/api/v1/config", userID, nil).Body.Bytes(), &cfg))
		return cfg
	}
	add := func(p *Plugin, userID, title string) int {
		return upload(p, userID, map[string]string{"title": title}, png).Code
	}
	del := func(p *Plugin, userID, name string) int {
		return do(p, http.MethodDelete, "/api/v1/templates/"+name, userID, nil).Code
	}

	for _, tc := range []struct {
		setting string
		canAdd  map[string]bool
		on      bool
	}{
		{"", map[string]bool{member: true, admin: true, guest: true}, true},
		{addTemplatesEveryone, map[string]bool{member: true, admin: true, guest: true}, true},
		{addTemplatesAdmins, map[string]bool{member: false, admin: true, guest: false}, true},
		{addTemplatesNobody, map[string]bool{member: false, admin: false, guest: false}, false},
	} {
		t.Run("setting "+tc.setting, func(t *testing.T) {
			p := newTestPlugin(customAPI())
			p.setConfiguration(&configuration{WhoCanAddTemplates: tc.setting})
			for _, user := range []string{member, admin, guest} {
				cfg := configFor(p, user)
				assert.Equal(t, tc.canAdd[user], cfg.CanAdd, user)
				assert.Equal(t, tc.on, cfg.CustomTemplates, user)
				assert.Equal(t, user == admin, cfg.CanDeleteOthers, user)
				want := http.StatusForbidden
				if tc.canAdd[user] {
					want = http.StatusCreated
				}
				assert.Equal(t, want, add(p, user, "By "+user), user)
			}
		})
	}

	t.Run("deleting", func(t *testing.T) {
		p := newTestPlugin(customAPI())
		for _, user := range []string{member, guest} {
			require.Equal(t, http.StatusCreated, add(p, user, "By "+user))
		}
		list := templatesFor(t, p, member)
		assert.Equal(t, member, list["by-priya"].CreatorID, "the creator, for the picker's list")
		assert.NotZero(t, list["by-priya"].CreateAt)
		assert.True(t, list["by-priya"].CanDelete)
		assert.False(t, list["by-gina"].CanDelete)
		assert.False(t, templatesFor(t, p, guest)["by-priya"].CanDelete)
		assert.True(t, templatesFor(t, p, admin)["by-gina"].CanDelete)

		assert.Equal(t, http.StatusForbidden, del(p, guest, "by-priya"), "a guest, another's")
		assert.Equal(t, http.StatusForbidden, del(p, member, "by-gina"), "a member, another's")
		assert.Equal(t, http.StatusForbidden, del(p, admin, "drake"), "built-in")
		assert.Equal(t, http.StatusOK, del(p, guest, "by-gina"), "a guest, their own")

		// Custom templates turned off: nothing new, but what's there can still be cleaned up.
		p.setConfiguration(&configuration{WhoCanAddTemplates: addTemplatesNobody})
		assert.Contains(t, templatesFor(t, p, member), "by-priya", "still usable")
		assert.Equal(t, http.StatusForbidden, del(p, guest, "by-priya"))
		assert.Equal(t, http.StatusOK, del(p, admin, "by-priya"), "a system admin, another's")
	})
}
