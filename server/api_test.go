// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func newTestPlugin(api *plugintest.API) *Plugin {
	p := &Plugin{store: newCustomStore(newFakeKV())}
	p.SetAPI(api)
	p.initRouter()
	return p
}

func do(p *Plugin, method, path, userID string, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	r := httptest.NewRequest(method, path, &buf)
	if userID != "" {
		r.Header.Set("Mattermost-User-Id", userID)
	}
	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, r)
	return w
}

func TestAPINeedsAUser(t *testing.T) {
	p := newTestPlugin(&plugintest.API{})
	assert.Equal(t, http.StatusUnauthorized, do(p, http.MethodGet, "/api/v1/templates", "", nil).Code)
}

func TestTemplatesAndRender(t *testing.T) {
	p := newTestPlugin(&plugintest.API{})
	w := do(p, http.MethodGet, "/api/v1/templates", "u1", nil)
	require.Equal(t, http.StatusOK, w.Code)
	var list []map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &list))
	assert.Len(t, list, 57)

	w = do(p, http.MethodGet, "/api/v1/templates/everywhere/render?top=memes&bottom=memes+everywhere", "u1", nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "image/jpeg", w.Header().Get("Content-Type"))

	assert.Equal(t, http.StatusOK, do(p, http.MethodGet, "/api/v1/templates/drake/thumbnail?width=100", "u1", nil).Code)
	assert.Equal(t, http.StatusNotFound, do(p, http.MethodGet, "/api/v1/templates/nope/render", "u1", nil).Code)
}

func TestPostMeme(t *testing.T) {
	api := &plugintest.API{}
	api.On("GetChannel", "c1").Return(&model.Channel{Id: "c1"}, nil)
	api.On("HasPermissionToChannel", "u1", "c1", model.PermissionCreatePost).Return(true)
	api.On("GetPost", "root").Return(&model.Post{Id: "root", ChannelId: "c1"}, nil)
	api.On("UploadFile", mock.Anything, "c1", "disaster-girl.jpg").Return(&model.FileInfo{Id: "f1"}, nil)
	api.On("CreatePost", mock.MatchedBy(func(post *model.Post) bool {
		meme, ok := post.GetProp(memeProp).(map[string]any)
		return post.UserId == "u1" && post.ChannelId == "c1" && post.RootId == "root" && len(post.FileIds) == 1 && post.FileIds[0] == "f1" &&
			ok && meme["template"] == "disaster-girl" && meme["top"] == "my code"
	})).Return(&model.Post{Id: "p1", CreateAt: 42}, nil)
	api.On("KVGet", "recent_u1").Return(nil, nil)
	var saved []byte
	api.On("KVSet", "recent_u1", mock.Anything).Run(func(args mock.Arguments) { saved = args.Get(1).([]byte) }).Return(nil)
	p := newTestPlugin(api)

	w := do(p, http.MethodPost, "/api/v1/memes", "u1", map[string]any{"channel_id": "c1", "root_id": "root", "template": "disaster-girl", "top": "my code", "bottom": "in prod"})
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var recent []Meme
	require.NoError(t, json.Unmarshal(saved, &recent))
	require.Len(t, recent, 1)
	assert.Equal(t, "my code", recent[0].Top)
	assert.EqualValues(t, 42, recent[0].CreateAt)
}

func TestPostMemeRefused(t *testing.T) {
	api := &plugintest.API{}
	api.On("GetChannel", "c1").Return(&model.Channel{Id: "c1"}, nil)
	api.On("GetChannel", "archived").Return(&model.Channel{Id: "archived", DeleteAt: 1}, nil)
	api.On("HasPermissionToChannel", "reader", "c1", model.PermissionCreatePost).Return(false)
	api.On("HasPermissionToChannel", "u1", "c1", model.PermissionCreatePost).Return(true)
	api.On("GetPost", "elsewhere").Return(&model.Post{Id: "elsewhere", ChannelId: "c2"}, nil)
	p := newTestPlugin(api)

	post := func(user string, body map[string]any) int {
		return do(p, http.MethodPost, "/api/v1/memes", user, body).Code
	}
	assert.Equal(t, http.StatusForbidden, post("reader", map[string]any{"channel_id": "c1", "template": "doge", "top": "wow"}))
	assert.Equal(t, http.StatusForbidden, post("u1", map[string]any{"channel_id": "archived", "template": "doge", "top": "wow"}))
	assert.Equal(t, http.StatusBadRequest, post("u1", map[string]any{"channel_id": "c1", "root_id": "elsewhere", "template": "doge", "top": "wow"}))
	assert.Equal(t, http.StatusBadRequest, post("u1", map[string]any{"channel_id": "c1", "template": "doge"}), "nothing written")
	assert.Equal(t, http.StatusNotFound, post("u1", map[string]any{"channel_id": "c1", "template": "nope", "top": "x"}))
}

// The /meme images need no login: a long text took minutes of CPU to fit before it was bounded.
func TestCommandMemeBoundsText(t *testing.T) {
	p := newTestPlugin(&plugintest.API{})
	start := time.Now()
	w := do(p, http.MethodGet, "/templates/everywhere.jpg?text="+strings.Repeat("memes+", 50000)+"&text=everywhere", "", nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Less(t, time.Since(start), 10*time.Second)
}
