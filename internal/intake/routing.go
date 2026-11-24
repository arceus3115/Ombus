package intake

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"ombus/config"
)

const longTermCareOffice = "long_term_care"

type routingCatalog struct {
	SchemaVersion         int                        `json:"schemaVersion"`
	LongTermCareDirectory string                     `json:"longTermCareDirectory"`
	Jurisdictions         []jurisdiction             `json:"jurisdictions"`
	LongTermCareByCounty  map[string]countyDirectory `json:"longTermCareByCounty"`
	CountyField           Field                      `json:"countyField"`
	Topics                []Option                   `json:"topics"`
	LocationFields        []Field                    `json:"locationFields"`
	TriageFields          []Field                    `json:"triageFields"`
	LongTermCareFields    []Field                    `json:"longTermCareFields"`
	Referrals             []referral                 `json:"referrals"`
}

type jurisdiction struct {
	Code            string `json:"code"`
	Name            string `json:"name"`
	LongTermCareURL string `json:"longTermCareUrl"`
}

type referral struct {
	State     string  `json:"state"`
	Office    string  `json:"office"`
	Label     string  `json:"label"`
	SourceURL string  `json:"sourceUrl"`
	Version   int     `json:"version"`
	Topics    []Hint  `json:"topics"`
	Fields    []Field `json:"fields"`
}

type countyDirectory struct {
	CountySet string            `json:"countySet"`
	Directory string            `json:"directory"`
	Codes     map[string]string `json:"codes"`
}

func (s *Schema) loadRouting(counties map[string][]Option) error {
	var catalog routingCatalog
	if err := json.Unmarshal(config.Routing, &catalog); err != nil {
		return fmt.Errorf("routing configuration: %w", err)
	}
	if catalog.SchemaVersion <= s.Version {
		return fmt.Errorf("invalid public intake version %d", catalog.SchemaVersion)
	}
	s.publicVersion = catalog.SchemaVersion
	unconfigured := s.states
	s.states = make(map[string]stateConfig, len(catalog.Jurisdictions))
	for _, region := range catalog.Jurisdictions {
		if len(region.Code) != 2 || region.Name == "" || s.states[region.Code].Code != "" {
			return fmt.Errorf("invalid or duplicate jurisdiction %q", region.Code)
		}
		state, configured := unconfigured[region.Code]
		if configured {
			state.legacyHints = slices.Clone(state.RoutingHints)
			delete(unconfigured, region.Code)
		} else {
			countyRoutes, exists := catalog.LongTermCareByCounty[region.Code]
			if exists {
				if err := s.addCountyHandoffs(region.Code, countyRoutes, counties[countyRoutes.CountySet]); err != nil {
					return err
				}
				delete(catalog.LongTermCareByCounty, region.Code)
			}
			state = s.addLongTermCare(region, catalog)
			if exists {
				field := catalog.CountyField
				field.Options = counties[countyRoutes.CountySet]
				state.LocationFields = []Field{field}
			}
		}
		for _, entry := range catalog.Referrals {
			if entry.State != state.Code {
				continue
			}
			if _, exists := state.OfficeFields[entry.Office]; exists || entry.Office == "" || len(entry.Topics) == 0 {
				return fmt.Errorf("invalid or duplicate referral office %s/%s", state.Code, entry.Office)
			}
			state.OfficeFields[entry.Office] = entry.Fields
			for _, topic := range entry.Topics {
				topic.Office = entry.Office
				state.RoutingHints = append(state.RoutingHints, topic)
			}
			s.handoffs = append(s.handoffs, referralHandoff(entry, "Public office contact", "Use the office’s published contact options to request help."))
		}
		if err := state.completeTopics(catalog.Topics); err != nil {
			return err
		}
		s.states[state.Code] = state
	}
	for code := range unconfigured {
		return fmt.Errorf("state profile %q has no jurisdiction", code)
	}
	for code := range catalog.LongTermCareByCounty {
		return fmt.Errorf("county directory %q needs a shared long-term care profile", code)
	}
	for _, entry := range catalog.Referrals {
		if _, ok := s.states[entry.State]; !ok {
			return fmt.Errorf("referral office %q has unknown jurisdiction %q", entry.Office, entry.State)
		}
	}
	return nil
}

func (s *Schema) addCountyHandoffs(state string, directory countyDirectory, counties []Option) error {
	if directory.Directory == "" || len(directory.Codes) == 0 || len(counties) == 0 {
		return fmt.Errorf("incomplete county directory for %s", state)
	}
	for countyCode, agencyCode := range directory.Codes {
		i := slices.IndexFunc(counties, func(county Option) bool { return county.Value == countyCode })
		if i < 0 || agencyCode == "" {
			return fmt.Errorf("invalid county route %s/%s", state, countyCode)
		}
		route := referralHandoff(referral{
			State: state, Office: longTermCareOffice, Label: counties[i].Label + " County Long-Term Care Ombudsman",
			SourceURL: directory.Directory + agencyCode, Version: 1,
		}, "Local long-term care program", "Use the Long-Term Care Ombudsman contact listed for this county.")
		route.Concern = map[string][]string{"countyCode": {countyCode}}
		route.Output.ID += "." + countyCode
		s.handoffs = append(s.handoffs, route)
	}
	return nil
}

func (s *Schema) addLongTermCare(region jurisdiction, catalog routingCatalog) stateConfig {
	source := region.LongTermCareURL
	channel := "State long-term care directory"
	instruction := "Use the directory for this state to contact the program that serves the facility."
	if source == "" {
		source = catalog.LongTermCareDirectory + strings.ReplaceAll(strings.ToLower(region.Name), " ", "-") + "/"
	} else {
		channel = "State long-term care program"
		instruction = "Use the state program’s published instructions to contact the office that serves the facility."
	}
	s.handoffs = append(s.handoffs, referralHandoff(referral{
		State: region.Code, Office: longTermCareOffice, Label: region.Name + " Long-Term Care Ombudsman",
		SourceURL: source, Version: 1,
	}, channel, instruction))
	return stateConfig{
		Code: region.Code, Name: region.Name, LocationFields: catalog.LocationFields,
		OfficeFields: map[string][]Field{longTermCareOffice: catalog.LongTermCareFields, "triage": catalog.TriageFields},
		RoutingHints: []Hint{{Value: "resident_rights", Office: longTermCareOffice}, {Value: "facility_notice", Office: longTermCareOffice}},
	}
}

// Shared topics supply the default wording and route to staff if a state has no match.
func (state *stateConfig) completeTopics(topics []Option) error {
	byValue := make(map[string]Hint, len(state.RoutingHints))
	for _, hint := range state.RoutingHints {
		fields, known := state.OfficeFields[hint.Office]
		if hint.Value == "" || byValue[hint.Value].Value != "" || !known {
			return fmt.Errorf("invalid or duplicate topic %s/%s", state.Code, hint.Value)
		}
		if hint.Topic != "" && !slices.ContainsFunc(fields, func(field Field) bool {
			return field.Key == "topic" && slices.ContainsFunc(field.Options, func(option Option) bool { return option.Value == hint.Topic })
		}) {
			return fmt.Errorf("invalid follow-up topic %s/%s", state.Code, hint.Value)
		}
		byValue[hint.Value] = hint
	}
	assigned := make([]Hint, 0, len(topics)+len(byValue))
	for _, topic := range topics {
		if topic.Value == "" || topic.Label == "" || slices.ContainsFunc(assigned, func(h Hint) bool { return h.Value == topic.Value }) {
			return fmt.Errorf("invalid or duplicate shared topic %q", topic.Value)
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
		if _, remains := byValue[extra.Value]; remains {
			if extra.Label == "" {
				return fmt.Errorf("missing topic label for %s/%s", state.Code, extra.Value)
			}
			assigned = append(assigned, extra)
		}
	}
	state.RoutingHints = assigned
	return nil
}

func referralHandoff(entry referral, channel, instruction string) rule {
	return rule{
		State: entry.State, Office: entry.Office,
		Handoff: Handoff{Title: entry.Label, Channel: channel, Instruction: instruction, SourceURL: entry.SourceURL},
		Output: outputContract{
			ContractRef: ContractRef{ID: strings.ToLower(entry.State) + "." + entry.Office + ".referral", Version: entry.Version},
			Format:      "public_referral",
		},
	}
}
