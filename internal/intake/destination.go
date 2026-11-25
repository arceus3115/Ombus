package intake

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"ombus/config"
)

const (
	destinationOffice    = "office"
	destinationDirectory = "program_directory"
	destinationReview    = "staff_review"
	destinationResource  = "staff_review_with_resource"
)

type PublicContact struct {
	Name       string `json:"name"`
	URL        string `json:"url"`
	LinkLabel  string `json:"linkLabel"`
	SourceURL  string `json:"sourceUrl"`
	Publisher  string `json:"publisher,omitempty"`
	ReviewedOn string `json:"reviewedOn,omitempty"`
}

type RoutingOutcome struct {
	Kind        string         `json:"kind"`
	Destination string         `json:"destination"`
	Message     string         `json:"message"`
	Contact     *PublicContact `json:"contact,omitempty"`
}

type RoutingPreview struct {
	Routing     RoutingOutcome `json:"routing"`
	ReviewFlags []string       `json:"reviewFlags"`
}

type resourceDirectory struct {
	Topic       string                    `json:"topic"`
	Label       string                    `json:"label"`
	Publisher   string                    `json:"publisher"`
	SourceURL   string                    `json:"sourceUrl"`
	ReviewedOn  string                    `json:"reviewedOn"`
	Instruction string                    `json:"instruction"`
	Links       map[string]string         `json:"links"`
	Sources     map[string]resourceSource `json:"sources"`
}

type resourceSource struct {
	URL       string `json:"url"`
	Publisher string `json:"publisher"`
}

func (s *Schema) loadResources() error {
	var directories []resourceDirectory
	if err := json.Unmarshal(config.Resources, &directories); err != nil {
		return fmt.Errorf("resource configuration: %w", err)
	}
	s.resources = make(map[string]resourceDirectory, len(directories))
	for _, entry := range directories {
		_, err := time.Parse(time.DateOnly, entry.ReviewedOn)
		if !slices.ContainsFunc(s.sharedTopics, func(topic Option) bool { return topic.Value == entry.Topic }) ||
			entry.Topic == "unsure" || s.resources[entry.Topic].Topic != "" || entry.Label == "" ||
			entry.Publisher == "" || entry.Instruction == "" || err != nil || !validPublicURL(entry.SourceURL) {
			return fmt.Errorf("invalid or duplicate resource for %q", entry.Topic)
		}
		for code, link := range entry.Links {
			if _, known := s.states[code]; !known || !validPublicURL(link) {
				return fmt.Errorf("invalid resource URL for %s/%s", code, entry.Topic)
			}
		}
		for code, source := range entry.Sources {
			if entry.Links[code] == "" || source.Publisher == "" || !validPublicURL(source.URL) {
				return fmt.Errorf("invalid resource source for %s/%s", code, entry.Topic)
			}
		}
		s.resources[entry.Topic] = entry
	}
	return nil
}

func (s Schema) PreviewRouting(record Record) RoutingPreview {
	state, _ := s.state(record.StateCode)
	return RoutingPreview{
		Routing:     s.routingOutcome(record, state, s.handoffRule(record, state.Code)),
		ReviewFlags: record.ReviewFlags,
	}
}

func (s Schema) routingOutcome(record Record, state stateConfig, route *rule) RoutingOutcome {
	if route != nil && route.Office != "triage" && route.SourceURL != "" {
		name := route.Title
		if route.Output.Format != "public_referral" {
			for _, office := range state.Offices {
				if office.Value == route.Office {
					name = office.Label
					break
				}
			}
		}
		kind := destinationOffice
		linkLabel := "Find contact instructions"
		message := "Use the contact instructions to reach the office directly."
		if route.Directory {
			kind = destinationDirectory
			linkLabel = "Find the program contact"
			message = route.Instruction
		}
		return RoutingOutcome{
			Kind: kind, Destination: name, Message: message,
			Contact: &PublicContact{Name: name, URL: route.SourceURL, LinkLabel: linkLabel, SourceURL: route.SourceURL},
		}
	}

	outcome := RoutingOutcome{
		Kind: destinationReview, Destination: "Staff routing review",
		Message: "Staff review is needed to identify the right office.",
	}
	hint := findHint(state.hintsForVersion(record.SchemaVersion), record.RoutingHint)
	// An additional resource fills a coverage gap. It cannot resolve an uncertain answer or override an office's eligibility rules.
	if record.RoutingAnswer != "" || hint.Office != "triage" || state.clarifications[record.RoutingHint].Topic != "" {
		return outcome
	}
	resource := s.resources[record.RoutingHint]
	link := resource.Links[state.Code]
	if link != "" {
		name := strings.ReplaceAll(resource.Label, "{state}", state.Name)
		outcome.Kind = destinationResource
		outcome.Message = "Staff review is needed to identify the right office. " + strings.ReplaceAll(resource.Instruction, "{state}", state.Name)
		source, ok := resource.Sources[state.Code]
		if !ok {
			source = resourceSource{URL: resource.SourceURL, Publisher: resource.Publisher}
		}
		outcome.Contact = &PublicContact{Name: name, URL: link, LinkLabel: "Open public resource",
			SourceURL: source.URL, Publisher: source.Publisher, ReviewedOn: resource.ReviewedOn}
	}
	return outcome
}
