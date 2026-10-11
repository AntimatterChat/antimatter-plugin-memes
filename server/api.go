// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	"net/http"
	"strconv"
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

	api := r.PathPrefix("/api/v1").Subrouter()
	api.Use(requireUser)
	api.HandleFunc("/templates", p.handleTemplates).Methods(http.MethodGet)
	api.HandleFunc("/templates/{name}/thumbnail", handleThumbnail).Methods(http.MethodGet)
	api.HandleFunc("/templates/{name}/render", handleRender).Methods(http.MethodGet)
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

func (p *Plugin) handleTemplates(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, memelibrary.List())
}

func handleThumbnail(w http.ResponseWriter, r *http.Request) {
	width, _ := strconv.Atoi(r.URL.Query().Get("width"))
	if width <= 0 || width > 640 {
		width = 240
	}
	img := memelibrary.Thumbnail(mux.Vars(r)["name"], width)
	if img == nil {
		http.NotFound(w, r)
		return
	}
	writeJPEG(w, img, "private, max-age=86400")
}

// captionsFromQuery reads ?top=&middle=&bottom=&box=&box=...
func captionsFromQuery(r *http.Request) memelibrary.Captions {
	q := r.URL.Query()
	return memelibrary.Captions{Top: q.Get("top"), Middle: q.Get("middle"), Bottom: q.Get("bottom"), Boxes: q["box"]}
}

// handleRender draws a meme for the creation dialog's preview.
func handleRender(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	if memelibrary.Canonical(name) == "" {
		http.NotFound(w, r)
		return
	}
	img, err := memelibrary.Compose(name, captionsFromQuery(r))
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
	name := memelibrary.Canonical(req.Template)
	if name == "" {
		return nil, &apiError{http.StatusNotFound, "unknown template"}
	}
	if err := req.Captions.Validate(); err != nil {
		return nil, &apiError{http.StatusBadRequest, err.Error()}
	}
	if req.Captions.Empty() {
		return nil, &apiError{http.StatusBadRequest, "write something on the meme"}
	}
	if err := p.checkCanPost(userID, req.ChannelID, req.RootID); err != nil {
		return nil, err
	}

	img, err := memelibrary.Compose(name, req.Captions)
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
	m := Meme{Template: name, Captions: req.Captions}
	post, appErr := p.API.CreatePost(&model.Post{
		UserId:    userID,
		ChannelId: req.ChannelID,
		RootId:    req.RootID,
		FileIds:   model.StringArray{info.Id},
		Props:     model.StringInterface{memeProp: m},
	})
	if appErr != nil {
		return nil, appErr
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
