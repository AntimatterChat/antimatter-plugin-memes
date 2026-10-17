// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"

	"github.com/antimatterchat/antimatter-plugin-memes/server/memelibrary"
)

// The prop of a meme's post: its template and captions, so that it can be made again.
const memeProp = "am_meme"

// recentLimit is how many memes the picker remembers for each person.
const recentLimit = 12

// apiError is an error with the HTTP status to answer.
type apiError struct {
	status int
	msg    string
}

func (e *apiError) Error() string { return e.msg }

func statusFor(err error) int {
	var a *apiError
	if errors.As(err, &a) {
		return a.status
	}
	var appErr *model.AppError
	if errors.As(err, &appErr) && appErr.StatusCode != 0 {
		return appErr.StatusCode
	}
	return http.StatusInternalServerError
}

func (p *Plugin) initRouter() {
	r := mux.NewRouter()
	// The image of a meme made with /meme (and the legacy links of its posts).
	r.HandleFunc("/templates/{name}.jpg", serveCommandMeme).Methods(http.MethodGet)
	// The font of the captions, for the previews of the dialog adding a template.
	r.HandleFunc("/fonts/anton.ttf", serveFont).Methods(http.MethodGet)

	api := r.PathPrefix("/api/v1").Subrouter()
	api.Use(requireUser)
	api.HandleFunc("/config", p.handleConfig).Methods(http.MethodGet)
	api.HandleFunc("/templates", p.handleTemplates).Methods(http.MethodGet)
	api.HandleFunc("/templates", p.handleAddTemplate).Methods(http.MethodPost)
	api.HandleFunc("/templates/{name}", p.handleDeleteTemplate).Methods(http.MethodDelete)
	api.HandleFunc("/templates/{name}/thumbnail", p.handleThumbnail).Methods(http.MethodGet)
	api.HandleFunc("/templates/{name}/render", p.handleRender).Methods(http.MethodGet)
	api.HandleFunc("/memes", p.handlePost).Methods(http.MethodPost)
	api.HandleFunc("/recent", p.handleRecent).Methods(http.MethodGet)
	p.router = r
}

func requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Mattermost-User-Id") == "" {
			http.Error(w, "not authorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, err error) {
	writeJSON(w, statusFor(err), map[string]string{"error": err.Error()})
}

func encodeJPEG(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func writeJPEG(w http.ResponseWriter, img image.Image, cache string) {
	data, err := encodeJPEG(img)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", cache)
	_, _ = w.Write(data)
}

func writeImageError(w http.ResponseWriter, r *http.Request, err error) {
	if statusFor(err) == http.StatusNotFound {
		http.NotFound(w, r)
		return
	}
	http.Error(w, err.Error(), statusFor(err))
}

// templateInfo describes a template for the meme picker: a built-in one or a custom one.
type templateInfo struct {
	memelibrary.Info
	// Captions are the captions a custom template takes, in order (top, middle and bottom when
	// empty).
	Captions []string `json:"captions,omitempty"`
	// Keywords are the search keywords of a custom template.
	Keywords []string `json:"keywords,omitempty"`
	Custom   bool     `json:"custom,omitempty"`
	// CanDelete tells whether the user can delete the custom template.
	CanDelete bool `json:"can_delete,omitempty"`
	// Version is the creation time of a custom template, for the browsers' caches of its images:
	// another template can get the name of a deleted one.
	Version int64 `json:"version,omitempty"`
	// CreatorID and CreateAt are who added a custom template and when (ms), for the picker's
	// list of custom templates.
	CreatorID string `json:"creator_id,omitempty"`
	CreateAt  int64  `json:"create_at,omitempty"`
}

func customInfo(t *CustomTemplate, canDelete bool) templateInfo {
	return templateInfo{
		Info:      memelibrary.Info{Name: t.Name, Title: t.Title, Width: t.Width, Height: t.Height},
		Captions:  t.captions(),
		Keywords:  t.Keywords,
		Custom:    true,
		CanDelete: canDelete,
		Version:   t.CreateAt,
		CreatorID: t.CreatorID,
		CreateAt:  t.CreateAt,
	}
}

func (p *Plugin) isAdmin(userID string) bool {
	return p.API.HasPermissionTo(userID, model.PermissionManageSystem)
}

// isGuest tells whether a user is a guest account. When the account can't be read, the user
// counts as one: nothing is allowed that wouldn't be for a guest.
func (p *Plugin) isGuest(userID string) bool {
	user, appErr := p.API.GetUser(userID)
	if appErr != nil || user == nil {
		if appErr != nil {
			p.API.LogWarn("Could not get the user to check their role", "user_id", userID, "error", appErr.Error())
		}
		return true
	}
	return user.IsGuest()
}

// canAdd tells whether someone can add custom templates: everyone but guests (as with custom
// emoji), system admins only, or nobody when custom templates are turned off.
func (p *Plugin) canAdd(userID string) bool {
	c := p.getConfiguration()
	if !c.customTemplatesOn() {
		return false
	}
	if p.isAdmin(userID) {
		return true
	}
	return c.everyoneCanAdd() && !p.isGuest(userID)
}

// canDelete tells whether someone can delete a custom template: its creator unless a guest (as
// with custom emoji, guests delete none, not even their own), or a system admin.
func canDelete(userID string, t *CustomTemplate, admin, guest bool) bool {
	return admin || (!guest && t.CreatorID == userID)
}

// clientConfig is what the webapp needs to know of the settings.
type clientConfig struct {
	// CanAdd tells whether the user can add templates.
	CanAdd bool `json:"can_add"`
	// MaxFileSize is the largest image file of a template, in bytes.
	MaxFileSize int `json:"max_file_size"`
	// CustomTemplates tells whether custom templates are on (people may add some).
	CustomTemplates bool `json:"custom_templates"`
	// CanDeleteOthers tells whether the user can delete the templates of others (a system admin).
	CanDeleteOthers bool `json:"can_delete_others"`
}

func (p *Plugin) handleConfig(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	writeJSON(w, http.StatusOK, clientConfig{
		CanAdd:          p.canAdd(userID),
		MaxFileSize:     maxUploadBytes,
		CustomTemplates: p.getConfiguration().customTemplatesOn(),
		CanDeleteOthers: p.isAdmin(userID),
	})
}

// handleTemplates lists the built-in and custom templates, by title.
func (p *Plugin) handleTemplates(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	builtin := memelibrary.List()
	custom, _, err := p.store.list()
	if err != nil {
		p.API.LogWarn("Could not list the custom meme templates", "error", err.Error())
	}
	list := make([]templateInfo, 0, len(builtin)+len(custom))
	for _, info := range builtin {
		list = append(list, templateInfo{Info: info})
	}
	admin := len(custom) > 0 && p.isAdmin(userID)
	guest := len(custom) > 0 && !admin && p.isGuest(userID)
	for _, t := range custom {
		// A built-in template of a later version of the plugin may take the name of a custom one.
		if memelibrary.Canonical(t.Name) != "" {
			continue
		}
		list = append(list, customInfo(t, canDelete(userID, t, admin, guest)))
	}
	sort.SliceStable(list, func(i, j int) bool { return strings.ToLower(list[i].Title) < strings.ToLower(list[j].Title) })
	writeJSON(w, http.StatusOK, list)
}

// lookup finds a template by its name: a built-in one (or an alias of it), else a custom one.
func (p *Plugin) lookup(name string) (string, *CustomTemplate, error) {
	if c := memelibrary.Canonical(name); c != "" {
		return c, nil, nil
	}
	t, err := p.store.get(name)
	if err != nil {
		return "", nil, err
	}
	if t == nil {
		return "", nil, &apiError{http.StatusNotFound, "unknown template"}
	}
	return t.Name, t, nil
}

// compose draws captions on a built-in or custom template; those of a custom one are the ones
// of its layout.
func (p *Plugin) compose(name string, custom *CustomTemplate, c memelibrary.Captions) (image.Image, error) {
	if custom == nil {
		return memelibrary.Compose(name, c)
	}
	img, err := p.store.image(custom)
	if err != nil {
		return nil, err
	}
	return memelibrary.ComposeImage(img, custom.apply(c))
}

func (p *Plugin) handleThumbnail(w http.ResponseWriter, r *http.Request) {
	width, _ := strconv.Atoi(r.URL.Query().Get("width"))
	if width <= 0 || width > 640 {
		width = 240
	}
	name, custom, err := p.lookup(mux.Vars(r)["name"])
	if err != nil {
		writeImageError(w, r, err)
		return
	}
	if custom == nil {
		writeJPEG(w, memelibrary.Thumbnail(name, width), "private, max-age=86400")
		return
	}
	data, err := p.store.thumbnail(custom, width)
	if err != nil {
		writeImageError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "private, max-age=86400")
	_, _ = w.Write(data)
}

func serveFont(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "font/ttf")
	w.Header().Set("Cache-Control", "public, max-age=604800")
	_, _ = w.Write(memelibrary.Font())
}

// captionsFromQuery reads ?top=&middle=&bottom=&box=&box=...
func captionsFromQuery(r *http.Request) memelibrary.Captions {
	q := r.URL.Query()
	return memelibrary.Captions{Top: q.Get("top"), Middle: q.Get("middle"), Bottom: q.Get("bottom"), Boxes: q["box"]}
}

// handleRender draws a meme for the creation dialog's preview.
func (p *Plugin) handleRender(w http.ResponseWriter, r *http.Request) {
	name, custom, err := p.lookup(mux.Vars(r)["name"])
	if err != nil {
		writeImageError(w, r, err)
		return
	}
	img, err := p.compose(name, custom, captionsFromQuery(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJPEG(w, img, "private, max-age=3600")
}

// serveCommandMeme draws the meme of a /meme post: its captions are its template's own slots.
func serveCommandMeme(w http.ResponseWriter, r *http.Request) {
	template := memelibrary.Template(mux.Vars(r)["name"])
	if template == nil {
		http.NotFound(w, r)
		return
	}
	text := r.URL.Query()["text"]
	if len(text) > memelibrary.MaxBoxes {
		text = text[:memelibrary.MaxBoxes]
	}
	img, err := template.Render(text)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJPEG(w, img, "public, max-age=604800")
}

type postRequest struct {
	ChannelID string `json:"channel_id"`
	RootID    string `json:"root_id"`
	Template  string `json:"template"`
	memelibrary.Captions
}

// Meme is a meme someone made: its template and captions.
type Meme struct {
	Template string `json:"template"`
	memelibrary.Captions
	CreateAt int64 `json:"create_at,omitempty"`
}

// props is the meme as a post prop.
func (m Meme) props() map[string]any {
	boxes := make([]any, 0, len(m.Boxes))
	for _, b := range m.Boxes {
		boxes = append(boxes, b)
	}
	return map[string]any{"template": m.Template, "top": m.Top, "middle": m.Middle, "bottom": m.Bottom, "boxes": boxes}
}

func (p *Plugin) handlePost(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	var req postRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&req); err != nil {
		writeError(w, &apiError{http.StatusBadRequest, "invalid request"})
		return
	}
	post, err := p.postMeme(userID, req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, post)
}

// checkCanPost checks that someone may post in a channel (and its thread), as the server would for
// a message of theirs.
func (p *Plugin) checkCanPost(userID, channelID, rootID string) error {
	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		return &apiError{http.StatusNotFound, "channel not found"}
	}
	if channel.DeleteAt != 0 {
		return &apiError{http.StatusForbidden, "the channel is archived"}
	}
	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
		return &apiError{http.StatusForbidden, "you can't post in this channel"}
	}
	if rootID != "" {
		root, appErr := p.API.GetPost(rootID)
		if appErr != nil || root.ChannelId != channelID || root.RootId != "" {
			return &apiError{http.StatusBadRequest, "invalid thread"}
		}
	}
	return nil
}

func (p *Plugin) postMeme(userID string, req postRequest) (*model.Post, error) {
	name, custom, err := p.lookup(req.Template)
	if err != nil {
		return nil, err
	}
	captions := req.Captions
	if custom != nil {
		captions = custom.apply(captions)
	}
	if err := captions.Validate(); err != nil {
		return nil, &apiError{http.StatusBadRequest, err.Error()}
	}
	if captions.Empty() {
		return nil, &apiError{http.StatusBadRequest, "write something on the meme"}
	}
	if err := p.checkCanPost(userID, req.ChannelID, req.RootID); err != nil {
		return nil, err
	}

	img, err := p.compose(name, custom, captions)
	if err != nil {
		return nil, &apiError{http.StatusBadRequest, err.Error()}
	}
	data, err := encodeJPEG(img)
	if err != nil {
		return nil, err
	}
	info, appErr := p.API.UploadFile(data, req.ChannelID, name+".jpg")
	if appErr != nil {
		return nil, appErr
	}
	m := Meme{Template: name, Captions: captions}
	post, appErr := p.API.CreatePost(&model.Post{
		UserId:    userID,
		ChannelId: req.ChannelID,
		RootId:    req.RootID,
		FileIds:   model.StringArray{info.Id},
		// Props cross the plugin RPC: plain maps and slices only.
		Props: model.StringInterface{memeProp: m.props()},
	})
	if appErr != nil {
		return nil, appErr
	}
	if post == nil {
		return nil, &apiError{http.StatusInternalServerError, "the meme could not be posted"}
	}
	m.CreateAt = post.CreateAt
	p.remember(userID, m)
	return post, nil
}

func recentKey(userID string) string { return "recent_" + userID }

// recent returns the memes someone made last, newest first.
func (p *Plugin) recent(userID string) []Meme {
	data, appErr := p.API.KVGet(recentKey(userID))
	if appErr != nil || data == nil {
		return []Meme{}
	}
	var list []Meme
	if json.Unmarshal(data, &list) != nil {
		return []Meme{}
	}
	return list
}

func (p *Plugin) remember(userID string, m Meme) {
	if m.CreateAt == 0 {
		m.CreateAt = time.Now().UnixMilli()
	}
	list := append([]Meme{m}, p.recent(userID)...)
	if len(list) > recentLimit {
		list = list[:recentLimit]
	}
	if data, err := json.Marshal(list); err == nil {
		if appErr := p.API.KVSet(recentKey(userID), data); appErr != nil {
			p.API.LogWarn("Could not remember a meme", "error", appErr.Error())
		}
	}
}

func (p *Plugin) handleRecent(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, p.recent(r.Header.Get("Mattermost-User-Id")))
}

// handleAddTemplate adds a custom template (multipart/form-data: file, title, keywords and
// layout), and returns it. It's also the first of its creator's recent memes, for them to find it.
func (p *Plugin) handleAddTemplate(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if !p.canAdd(userID) {
		writeError(w, &apiError{http.StatusForbidden, "you can't add meme templates"})
		return
	}
	tooLarge := &apiError{http.StatusRequestEntityTooLarge, "the image is larger than 5 MB"}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes+64<<10)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			writeError(w, tooLarge)
			return
		}
		writeError(w, &apiError{http.StatusBadRequest, "invalid request"})
		return
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()

	title := strings.Join(strings.Fields(r.FormValue("title")), " ")
	if err := validTitle(title); err != nil {
		writeError(w, err)
		return
	}
	keywords := r.FormValue("keywords")
	if len([]rune(keywords)) > maxKeywordsLength {
		writeError(w, &apiError{http.StatusBadRequest, "the keywords are too long"})
		return
	}
	layout := r.FormValue("layout")
	if layout == "" {
		layout = defaultLayout
	}
	if _, ok := layouts[layout]; !ok {
		writeError(w, &apiError{http.StatusBadRequest, "unknown caption layout"})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, &apiError{http.StatusBadRequest, "an image is required"})
		return
	}
	defer file.Close()
	if header.Size > maxUploadBytes {
		writeError(w, tooLarge)
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxUploadBytes+1))
	if err != nil {
		writeError(w, err)
		return
	}
	if len(data) > maxUploadBytes {
		writeError(w, tooLarge)
		return
	}
	img, bounds, err := normalizeImage(data)
	if err != nil {
		writeError(w, err)
		return
	}

	t, err := p.store.add(&CustomTemplate{
		Title:     title,
		Keywords:  parseKeywords(keywords),
		Layout:    layout,
		Width:     bounds.Dx(),
		Height:    bounds.Dy(),
		CreatorID: userID,
		CreateAt:  model.GetMillis(),
	}, img)
	if err != nil {
		writeError(w, err)
		return
	}
	p.remember(userID, Meme{Template: t.Name, CreateAt: t.CreateAt})
	p.templatesChanged()
	writeJSON(w, http.StatusCreated, customInfo(t, true))
}

// handleDeleteTemplate deletes a custom template: its creator or a system admin can.
func (p *Plugin) handleDeleteTemplate(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	name := mux.Vars(r)["name"]
	if memelibrary.Canonical(name) != "" {
		writeError(w, &apiError{http.StatusForbidden, "the built-in templates can't be deleted"})
		return
	}
	t, err := p.store.remove(name, func(t *CustomTemplate) error {
		admin := p.isAdmin(userID)
		if !canDelete(userID, t, admin, !admin && p.isGuest(userID)) {
			return &apiError{http.StatusForbidden, "only its creator or a system admin can delete this template"}
		}
		return nil
	})
	if err != nil {
		writeError(w, err)
		return
	}
	if t.CreatorID != userID {
		p.API.LogInfo("A meme template was deleted by a system admin", "template", t.Name, "title", t.Title, "creator_id", t.CreatorID, "user_id", userID)
	}
	p.templatesChanged()
	writeJSON(w, http.StatusOK, map[string]string{"status": "OK"})
}
