// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE for license information.

package main

import (
	"github.com/pkg/errors"
)

// Who can add meme templates (the WhoCanAddTemplates setting).
const (
	addTemplatesEveryone = "everyone"
	addTemplatesAdmins   = "admins"
	// addTemplatesNobody turns custom templates off: nobody can add one. The ones already added
	// stay usable, and their creators and system admins can still delete them.
	addTemplatesNobody = "nobody"
)

// configuration is the plugin's settings, from the System Console.
type configuration struct {
	// WhoCanAddTemplates is who can add custom meme templates: everyone (the default), admins
	// (system admins only) or nobody (custom templates off).
	WhoCanAddTemplates string
}

// everyoneCanAdd tells whether all users, not only system admins, can add meme templates.
func (c *configuration) everyoneCanAdd() bool {
	return c == nil || (c.WhoCanAddTemplates != addTemplatesAdmins && c.WhoCanAddTemplates != addTemplatesNobody)
}

// customTemplatesOn tells whether people may add custom templates at all.
func (c *configuration) customTemplatesOn() bool {
	return c == nil || c.WhoCanAddTemplates != addTemplatesNobody
}

// getConfiguration returns the active configuration; it's never changed, only replaced.
func (p *Plugin) getConfiguration() *configuration {
	p.configurationLock.RLock()
	defer p.configurationLock.RUnlock()
	if p.configuration == nil {
		return &configuration{}
	}
	return p.configuration
}

func (p *Plugin) setConfiguration(c *configuration) {
	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()
	p.configuration = c
}

// OnConfigurationChange loads the settings when the plugin starts and when they change.
func (p *Plugin) OnConfigurationChange() error {
	c := new(configuration)
	if err := p.API.LoadPluginConfiguration(c); err != nil {
		return errors.Wrap(err, "failed to load the plugin configuration")
	}
	p.setConfiguration(c)
	return nil
}
