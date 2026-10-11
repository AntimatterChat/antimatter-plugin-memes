// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package memelibrary

import (
	"embed"
	"io/fs"
	"path"
)

// The templates' images and metadata, and the fonts, built into the plugin.
//
//go:embed assets
var assets embed.FS

// MustAsset returns the content of an asset, by its path under assets/.
func MustAsset(name string) []byte {
	data, err := assets.ReadFile(path.Join("assets", name))
	if err != nil {
		panic(err)
	}
	return data
}

// AssetDir lists the names of the files in a folder of assets/.
func AssetDir(dir string) ([]string, error) {
	entries, err := fs.ReadDir(assets, path.Join("assets", dir))
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}
