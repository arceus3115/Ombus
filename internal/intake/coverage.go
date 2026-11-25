package intake

import (
	"cmp"
	"slices"
)

type CoverageReport struct {
	SchemaVersion int             `json:"schemaVersion"`
	Topics        []Option        `json:"topics"`
	Jurisdictions []StateCoverage `json:"jurisdictions"`
}

type StateCoverage struct {
	Code   string          `json:"code"`
	Name   string          `json:"name"`
	Topics []TopicCoverage `json:"topics"`
}

type TopicCoverage struct {
	Topic        Option           `json:"topic"`
	Routing      *RoutingOutcome  `json:"routing,omitempty"`
	CountyRoutes int              `json:"countyRoutes,omitempty"`
	Question     string           `json:"question,omitempty"`
	Options      []CoverageOption `json:"options,omitempty"`
}

type CoverageOption struct {
	Option  Option         `json:"option"`
	Routing RoutingOutcome `json:"routing"`
}

// Coverage reports available routes for the current form. A listing does not establish eligibility for an individual case.
func (s Schema) Coverage() CoverageReport {
	report := CoverageReport{SchemaVersion: s.publicVersion}
	for _, topic := range s.sharedTopics {
		if topic.Value != "unsure" {
			report.Topics = append(report.Topics, topic)
		}
	}
	for _, state := range s.states {
		entry := StateCoverage{Code: state.Code, Name: state.Name}
		for _, hint := range state.RoutingHints {
			if hint.Value == "unsure" || hint.FollowUpOnly {
				continue
			}
			question := state.clarifications[hint.Value]
			topic := TopicCoverage{Topic: Option{Value: hint.Value, Label: hint.Label}}
			if question.Topic != "" {
				topic.Topic.Label = question.TopicLabel
				topic.Question = question.Label
				for _, option := range question.Options {
					outcome := s.coverageOutcome(state, findHint(state.RoutingHints, option.Route), hint.Value, option.Value)
					topic.Options = append(topic.Options, CoverageOption{Option: option.Option, Routing: outcome})
				}
			} else {
				outcome := s.coverageOutcome(state, hint, hint.Value, "")
				topic.Routing = &outcome
				for _, route := range s.handoffs {
					if !route.Retired && route.State == state.Code && route.Office == hint.Office && len(route.Concern["countyCode"]) > 0 {
						topic.CountyRoutes += len(route.Concern["countyCode"])
					}
				}
			}
			entry.Topics = append(entry.Topics, topic)
		}
		report.Jurisdictions = append(report.Jurisdictions, entry)
	}
	slices.SortFunc(report.Jurisdictions, func(a, b StateCoverage) int { return cmp.Compare(a.Name, b.Name) })
	return report
}

func (s Schema) coverageOutcome(state stateConfig, hint Hint, topic, answer string) RoutingOutcome {
	input := Input{StateCode: state.Code, SchemaVersion: s.publicVersion, RoutingHint: topic, RoutingAnswer: answer}
	if hint.Office != "triage" {
		input.RequestedOffice = &hint.Office
		input.OfficeDetails = Values{"topic": hint.Topic}
	}
	return s.PreviewRouting(Record{Input: input}).Routing
}
