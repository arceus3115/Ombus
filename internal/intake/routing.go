package intake

import (
	"encoding/json"
	"fmt"
	"net/url"
	"slices"
	"strings"

	"ombus/config"
)

const firstPublicVersion = 2

type routingCatalog struct {
	SchemaVersion  int             `json:"schemaVersion"`
	Jurisdictions  []jurisdiction  `json:"jurisdictions"`
	Topics         []Option        `json:"topics"`
	LocationFields []Field         `json:"locationFields"`
	CountyField    Field           `json:"countyField"`
	TriageFields   []Field         `json:"triageFields"`
	Directories    []directory     `json:"directories"`
	Referrals      []referral      `json:"referrals"`
	Clarifications []clarification `json:"clarifications"`
}

type jurisdiction struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type referral struct {
	State        string  `json:"state"`
	Office       string  `json:"office"`
	Label        string  `json:"label"`
	SourceURL    string  `json:"sourceUrl"`
	Version      int     `json:"version"`
	SinceVersion int     `json:"sinceVersion"`
	Topics       []Hint  `json:"topics"`
	Fields       []Field `json:"fields"`
}

type directory struct {
	Office        string                     `json:"office"`
	Version       int                        `json:"version"`
	Label         string                     `json:"label"`
	Topics        []string                   `json:"topics"`
	Fields        []Field                    `json:"fields"`
	Jurisdictions []string                   `json:"jurisdictions"`
	Contact       contactPage                `json:"contact"`
	Overrides     map[string]contactPage     `json:"overrides"`
	Counties      map[string]countyDirectory `json:"counties"`
}

type contactPage struct {
	SourceURL   string `json:"sourceUrl"`
	Channel     string `json:"channel"`
	Instruction string `json:"instruction"`
}

type countyDirectory struct {
	CountySet string            `json:"countySet"`
	Label     string            `json:"label"`
	Contact   contactPage       `json:"contact"`
	Codes     map[string]string `json:"codes"`
}

type clarification struct {
	State      string                `json:"state"`
	Topic      string                `json:"topic"`
	TopicLabel string                `json:"topicLabel"`
	Label      string                `json:"label"`
	Options    []clarificationOption `json:"options"`
}

type clarificationOption struct {
	Option
	Route string `json:"route"`
}

func (s *Schema) loadRouting(counties map[string][]Option) error {
	var catalog routingCatalog
	if err := json.Unmarshal(config.Routing, &catalog); err != nil {
		return fmt.Errorf("routing configuration: %w", err)
	}
	if catalog.SchemaVersion < firstPublicVersion {
		return fmt.Errorf("invalid public intake version %d", catalog.SchemaVersion)
	}
	s.publicVersion = catalog.SchemaVersion
	profiles := s.states
	s.states = make(map[string]stateConfig, len(catalog.Jurisdictions))
	for _, region := range catalog.Jurisdictions {
		if len(region.Code) != 2 || region.Name == "" || s.states[region.Code].Code != "" {
			return fmt.Errorf("invalid or duplicate jurisdiction %q", region.Code)
		}
		state, configured := profiles[region.Code]
		if configured {
			state.legacyHints = slices.Clone(state.RoutingHints)
			delete(profiles, region.Code)
		} else {
			state = stateConfig{
				Code: region.Code, Name: region.Name,
				LocationFields: catalog.LocationFields,
				OfficeFields:   map[string][]Field{"triage": catalog.TriageFields},
			}
		}
		for _, entry := range catalog.Referrals {
			if entry.State != state.Code {
				continue
			}
			if _, exists := state.OfficeFields[entry.Office]; exists || entry.Office == "" || len(entry.Topics) == 0 || entry.SinceVersion > s.publicVersion {
				return fmt.Errorf("invalid or duplicate referral office %s/%s", state.Code, entry.Office)
			}
			state.OfficeFields[entry.Office] = entry.Fields
			for _, topic := range entry.Topics {
				topic.Office = entry.Office
				topic.sinceVersion = entry.SinceVersion
				state.RoutingHints = append(state.RoutingHints, topic)
			}
			s.handoffs = append(s.handoffs, referralHandoff(entry.State, entry.Office, entry.Label, entry.Version, contactPage{
				SourceURL: entry.SourceURL, Channel: "Public office contact",
				Instruction: "Use the office’s published contact options to request help.",
			}))
		}
		for _, dir := range catalog.Directories {
			if len(dir.Jurisdictions) != 0 && !slices.Contains(dir.Jurisdictions, state.Code) {
				continue
			}
			if err := s.addDirectory(&state, dir, catalog.CountyField, counties); err != nil {
				return err
			}
		}
		previous, err := state.completeTopics(catalog.Topics, firstPublicVersion)
		if err != nil {
			return err
		}
		state.previousPublicHints = previous
		state.RoutingHints, err = state.completeTopics(catalog.Topics, s.publicVersion)
		if err != nil {
			return err
		}
		s.states[state.Code] = state
	}
	for code := range profiles {
		return fmt.Errorf("state profile %q has no jurisdiction", code)
	}
	for _, entry := range catalog.Referrals {
		if _, ok := s.states[entry.State]; !ok {
			return fmt.Errorf("referral office %q has unknown jurisdiction %q", entry.Office, entry.State)
		}
	}
	if err := s.validateDirectories(catalog.Directories); err != nil {
		return err
	}
	return s.loadClarifications(catalog.Clarifications)
}

func (s Schema) validateDirectories(directories []directory) error {
	seen := map[string]bool{}
	for _, dir := range directories {
		if dir.Office == "" || seen[dir.Office] || len(dir.Topics) == 0 {
			return fmt.Errorf("invalid or duplicate directory %q", dir.Office)
		}
		seen[dir.Office] = true
		for _, code := range dir.Jurisdictions {
			if _, ok := s.states[code]; !ok {
				return fmt.Errorf("directory %q has unknown jurisdiction %q", dir.Office, code)
			}
		}
		for code := range dir.Overrides {
			if _, ok := s.states[code]; !ok || (len(dir.Jurisdictions) != 0 && !slices.Contains(dir.Jurisdictions, code)) {
				return fmt.Errorf("directory %q has an override outside its jurisdiction %q", dir.Office, code)
			}
		}
		for code := range dir.Counties {
			if _, ok := s.states[code]; !ok || (len(dir.Jurisdictions) != 0 && !slices.Contains(dir.Jurisdictions, code)) {
				return fmt.Errorf("directory %q has a county mapping outside its jurisdiction %q", dir.Office, code)
			}
		}
	}
	return nil
}

func (s *Schema) addDirectory(state *stateConfig, dir directory, countyField Field, counties map[string][]Option) error {
	if _, exists := state.OfficeFields[dir.Office]; exists {
		return fmt.Errorf("directory %q duplicates an office in %s", dir.Office, state.Code)
	}
	var assigned []Hint
	for _, topic := range dir.Topics {
		if !slices.ContainsFunc(state.RoutingHints, func(h Hint) bool { return h.Value == topic && !h.directory && h.sinceVersion <= firstPublicVersion }) {
			assigned = append(assigned, Hint{Value: topic, Office: dir.Office, directory: true})
		}
	}
	if len(assigned) == 0 {
		return nil
	}
	state.OfficeFields[dir.Office] = dir.Fields
	state.RoutingHints = append(state.RoutingHints, assigned...)
	replacements := strings.NewReplacer("{state}", state.Name, "{stateCode}", state.Code,
		"{stateSlug}", strings.ReplaceAll(strings.ToLower(state.Name), " ", "-"))
	if local, ok := dir.Counties[state.Code]; ok {
		countyOptions := counties[local.CountySet]
		if state.CountySet != "" && state.CountySet != local.CountySet {
			return fmt.Errorf("conflicting county sets for %s", state.Code)
		}
		if err := s.addCountyHandoffs(*state, dir, local, countyOptions); err != nil {
			return err
		}
		if !slices.ContainsFunc(state.LocationFields, func(field Field) bool { return field.Key == countyField.Key }) {
			countyField.Options = countyOptions
			state.CountySet = local.CountySet
			if state.legacyHints == nil {
				state.LocationFields = nil
			}
			state.LocationFields = append(slices.Clone(state.LocationFields), countyField)
		}
	}
	page, overridden := dir.Overrides[state.Code]
	if !overridden {
		page = dir.Contact
	}
	page.SourceURL = replacements.Replace(page.SourceURL)
	s.handoffs = append(s.handoffs, referralHandoff(state.Code, dir.Office, replacements.Replace(dir.Label), dir.Version, page))
	return nil
}

func (s *Schema) addCountyHandoffs(state stateConfig, dir directory, local countyDirectory, counties []Option) error {
	if !strings.Contains(local.Contact.SourceURL, "{countyContact}") || len(local.Codes) == 0 || len(counties) == 0 {
		return fmt.Errorf("incomplete county directory for %s/%s", state.Code, dir.Office)
	}
	for countyCode, contactCode := range local.Codes {
		i := slices.IndexFunc(counties, func(county Option) bool { return county.Value == countyCode })
		if i < 0 || contactCode == "" {
			return fmt.Errorf("invalid county route %s/%s", state.Code, countyCode)
		}
		page := local.Contact
		page.SourceURL = strings.ReplaceAll(page.SourceURL, "{countyContact}", url.QueryEscape(contactCode))
		label := strings.ReplaceAll(local.Label, "{county}", counties[i].Label)
		route := referralHandoff(state.Code, dir.Office, label, dir.Version, page)
		route.Concern = map[string][]string{"countyCode": {countyCode}}
		route.Output.ID += "." + countyCode
		s.handoffs = append(s.handoffs, route)
	}
	return nil
}

func (s *Schema) loadClarifications(questions []clarification) error {
	for _, question := range questions {
		state, known := s.states[question.State]
		hint := findHint(state.RoutingHints, question.Topic)
		if !known || question.Label == "" || question.TopicLabel == "" || len(question.Options) < 2 || state.clarifications[question.Topic].Topic != "" || hint.Value == "" || hint.FollowUpOnly {
			return fmt.Errorf("invalid or duplicate routing question %s/%s", question.State, question.Topic)
		}
		seen := map[string]bool{}
		hasReview := false
		for _, option := range question.Options {
			route := findHint(state.RoutingHints, option.Route)
			if option.Value == "" || option.Label == "" || seen[option.Value] || route.Value == "" ||
				(option.Route != question.Topic && route.Office != "triage" && !route.FollowUpOnly) {
				return fmt.Errorf("invalid routing option %s/%s/%s", question.State, question.Topic, option.Value)
			}
			hasReview = hasReview || route.Office == "triage"
			seen[option.Value] = true
		}
		if !hasReview {
			return fmt.Errorf("no staff review option for %s/%s", question.State, question.Topic)
		}
		if state.clarifications == nil {
			state.clarifications = make(map[string]clarification)
		}
		state.clarifications[question.Topic] = question
		s.states[question.State] = state
	}
	return nil
}

func findHint(hints []Hint, value string) Hint {
	for _, hint := range hints {
		if hint.Value == value {
			return hint
		}
	}
	return Hint{}
}

// Shared topics supply the default wording and route to staff if a state has no match.
func (state stateConfig) completeTopics(topics []Option, version int) ([]Hint, error) {
	byValue := make(map[string]Hint, len(state.RoutingHints))
	for _, hint := range state.RoutingHints {
		if hint.sinceVersion > version {
			continue
		}
		if existing, ok := byValue[hint.Value]; ok && hint.directory && !existing.directory {
			continue
		}
		fields, known := state.OfficeFields[hint.Office]
		if hint.Value == "" || byValue[hint.Value].Value != "" || !known {
			return nil, fmt.Errorf("invalid or duplicate topic %s/%s", state.Code, hint.Value)
		}
		if hint.Topic != "" && !slices.ContainsFunc(fields, func(field Field) bool {
			return field.Key == "topic" && slices.ContainsFunc(field.Options, func(option Option) bool { return option.Value == hint.Topic })
		}) {
			return nil, fmt.Errorf("invalid follow-up topic %s/%s", state.Code, hint.Value)
		}
		byValue[hint.Value] = hint
	}
	assigned := make([]Hint, 0, len(topics)+len(byValue))
	for _, topic := range topics {
		if topic.Value == "" || topic.Label == "" || slices.ContainsFunc(assigned, func(h Hint) bool { return h.Value == topic.Value }) {
			return nil, fmt.Errorf("invalid or duplicate shared topic %q", topic.Value)
		}
		hint, matched := byValue[topic.Value]
		if !matched {
			hint = Hint{Value: topic.Value, Office: "triage"}
		}
		if hint.Label == "" {
			hint.Label = topic.Label
		}
		assigned = append(assigned, hint)
		delete(byValue, topic.Value)
	}
	for _, extra := range state.RoutingHints {
		if hint, remains := byValue[extra.Value]; remains && hint == extra {
			if extra.Label == "" {
				return nil, fmt.Errorf("missing topic label for %s/%s", state.Code, extra.Value)
			}
			assigned = append(assigned, extra)
		}
	}
	return assigned, nil
}

func referralHandoff(state, office, label string, version int, page contactPage) rule {
	return rule{
		State: state, Office: office,
		Handoff: Handoff{Title: label, Channel: page.Channel, Instruction: page.Instruction, SourceURL: page.SourceURL},
		Output: outputContract{
			ContractRef: ContractRef{ID: strings.ToLower(state) + "." + office + ".referral", Version: version},
			Format:      "public_referral",
		},
	}
}
