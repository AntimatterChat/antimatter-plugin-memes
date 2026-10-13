package main

import (
	"flag"
	"fmt"
	"image/jpeg"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"

	"github.com/pkg/errors"

	"github.com/gorilla/mux"
	shellquote "github.com/kballard/go-shellquote"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/antimatterchat/antimatter-plugin-memes/server/meme"
	"github.com/antimatterchat/antimatter-plugin-memes/server/memelibrary"
)

const memeCommand = "meme"

func resolveMeme(input string) (*meme.Template, []string, error) {
	if template, text := memelibrary.PatternMatch(input); template != nil {
		return template, text, nil
	}
	parts, err := shellquote.Split(input)
	if err != nil {
		return nil, nil, err
	}
	if template := memelibrary.Template(parts[0]); template != nil {
		return template, parts[1:], nil
	}
	return nil, nil, fmt.Errorf("i don't know this meme")
}

func demo(args []string) error {
	fs := flag.NewFlagSet("demo", flag.ContinueOnError)
	out := fs.String("out", "", "output path to write the meme to")
	if err := fs.Parse(args); err != nil {
		return err
	}

	input := fs.Args()
	if len(input) != 1 {
		return fmt.Errorf("specify an input string")
	}

	template, text, err := resolveMeme(input[0])
	if err != nil {
		return err
	}

	if *out != "" {
		f, err := os.Create(*out)
		if err != nil {
			return err
		}
		defer f.Close()

		img, err := template.Render(text)
		if err != nil {
			return err
		}
		if err := jpeg.Encode(f, img, &jpeg.Options{
			Quality: 100,
		}); err != nil {
			return err
		}
	}

	return nil
}

type Plugin struct {
	plugin.MattermostPlugin

	router *mux.Router

	// store keeps the custom templates.
	store *customStore

	configurationLock sync.RWMutex
	configuration     *configuration
}

// templatesChangedEvent tells the other nodes of a cluster that custom templates were added or
// deleted, for them to update /meme's autocomplete.
const templatesChangedEvent = "templates_changed"

func (p *Plugin) OnActivate() error {
	if p.API.GetConfig().ServiceSettings.SiteURL == nil {
		p.API.LogError("The Site URL must be set (System Console > Environment > Web Server) for the memes of /meme to show.")
	}
	if p.store == nil {
		p.store = newCustomStore(p.API)
	}
	p.initRouter()
	return p.registerCommand()
}

// registerCommand registers /meme, with the built-in and custom templates in its autocomplete.
func (p *Plugin) registerCommand() error {
	if err := p.API.RegisterCommand(createMemesCommand(p.customNames())); err != nil {
		return errors.Wrapf(err, "failed to register %s command", memeCommand)
	}
	return nil
}

// customNames returns the names of the custom templates.
func (p *Plugin) customNames() []string {
	list, _, err := p.store.list()
	if err != nil {
		p.API.LogWarn("Could not list the custom meme templates", "error", err.Error())
		return nil
	}
	names := make([]string, 0, len(list))
	for _, t := range list {
		names = append(names, t.Name)
	}
	return names
}

// templatesChanged updates /meme after custom templates were added or deleted, here and on the
// other nodes of a cluster.
func (p *Plugin) templatesChanged() {
	if err := p.registerCommand(); err != nil {
		p.API.LogWarn("Could not update the /meme command", "error", err.Error())
	}
	if appErr := p.API.PublishPluginClusterEvent(model.PluginClusterEvent{Id: templatesChangedEvent}, model.PluginClusterEventSendOptions{SendType: model.PluginClusterEventSendTypeReliable}); appErr != nil {
		p.API.LogWarn("Could not tell the cluster about the meme templates", "error", appErr.Error())
	}
}

func (p *Plugin) OnPluginClusterEvent(_ *plugin.Context, ev model.PluginClusterEvent) {
	if ev.Id == templatesChangedEvent {
		if err := p.registerCommand(); err != nil {
			p.API.LogWarn("Could not update the /meme command", "error", err.Error())
		}
	}
}

func createMemesCommand(custom []string) *model.Command {
	var availableMemes = getAvailableMemes(custom)
	memes := model.NewAutocompleteData(memeCommand, "[meme-name]", "Create awesome Memes yourself!")

	for _, name := range availableMemes {
		currentMeme := model.NewAutocompleteData(name, "", fmt.Sprintf("sends %s meme", name))
		currentMeme.AddTextArgument("displays text on meme", "[text]", "")
		memes.AddCommand(currentMeme)
	}

	return &model.Command{
		Trigger:          memeCommand,
		AutoComplete:     true,
		AutoCompleteDesc: "Renders custom memes so you can express yourself with culture.",
		AutocompleteData: memes,
	}
}

func getAvailableMemes(custom []string) []string {
	var availableMemes []string
	for name, metadata := range memelibrary.Memes() {
		availableMemes = append(availableMemes, name)
		availableMemes = append(availableMemes, metadata.Aliases...)
	}
	availableMemes = append(availableMemes, custom...)
	sort.Strings(availableMemes)
	return availableMemes
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}

func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	siteURL := p.GetSiteURL()

	input := strings.TrimSpace(strings.TrimPrefix(args.Command, "/meme"))

	if input == "" || input == "help" {
		var availableMemes = getAvailableMemes(p.customNames())
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text: `You can get started meming in one of two ways:

If your meme has well-defined phrasing, you can just type it:

` + "`" + `/meme brace yourself. memes are coming.` + "`" + `

If your meme doesn't have well-defined phrasing or you want more control, you can name a meme, then follow it with text to fill the slots:

` + "`" + `/meme brace-yourself "brace yourself." "memes are coming."` + "`" + `

In either case...

![brace-yourself](` + siteURL + `/plugins/memes/templates/brace-yourselves.jpg?text=brace+yourself.&text=memes+are+coming.)

Available memes: ` + strings.Join(availableMemes, ", "),
		}, nil
	}

	template, text, err := resolveMeme(input)
	if err != nil {
		if resp, appErr, ok := p.executeCustomMeme(args, input); ok {
			return resp, appErr
		}
		return nil, model.NewAppError("ExecuteCommand", "error resolving meme", nil, err.Error(), http.StatusInternalServerError)
	}

	queryString := ""
	for _, t := range text {
		if queryString == "" {
			queryString += "?"
		} else {
			queryString += "&"
		}
		queryString += "text=" + url.QueryEscape(t)
	}

	resp := &model.CommandResponse{
		ResponseType: model.CommandResponseTypeInChannel,
		Text:         "![" + template.Name + "](" + siteURL + "/plugins/memes/templates/" + template.Name + ".jpg" + queryString + ")",
	}
	return resp, nil
}

// executeCustomMeme posts a meme of a custom template, named first, with the texts after it as
// the captions of its layout, as the meme dialog would: as a file (custom templates have no public
// URL like the built-in ones).
func (p *Plugin) executeCustomMeme(args *model.CommandArgs, input string) (*model.CommandResponse, *model.AppError, bool) {
	parts, err := shellquote.Split(input)
	if err != nil || len(parts) == 0 {
		return nil, nil, false
	}
	t, err := p.store.get(parts[0])
	if err != nil || t == nil {
		return nil, nil, false
	}
	req := postRequest{ChannelID: args.ChannelId, RootID: args.RootId, Template: t.Name, Captions: t.fromText(parts[1:])}
	if _, err := p.postMeme(args.UserId, req); err != nil {
		return nil, model.NewAppError("ExecuteCommand", "the meme could not be posted: "+err.Error(), nil, "", statusFor(err)), true
	}
	return &model.CommandResponse{}, nil, true
}

func (p *Plugin) GetSiteURL() string {
	siteURL := ""
	ptr := p.API.GetConfig().ServiceSettings.SiteURL
	if ptr != nil {
		siteURL = *ptr
	}
	return siteURL
}

func main() {
	if len(os.Args) > 1 {
		if err := demo(os.Args[1:]); err != nil {
			fmt.Println(err.Error())
			os.Exit(1)
		}
	} else {
		plugin.ClientMain(&Plugin{})
	}
}
