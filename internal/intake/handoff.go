package intake

import (
	"fmt"
	"net/url"
	"slices"
	"strings"
	"time"
)

type rule struct {
	State   string              `json:"state"`
	Office  string              `json:"office"`
	Retired bool                `json:"retired,omitempty"`
	When    map[string][]string `json:"when"`
	Concern map[string][]string `json:"concern"`
	Output  outputContract      `json:"output"`
	Handoff
}

type ContractRef struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}

type outputContract struct {
	ContractRef
	Format      string           `json:"format"`
	Fields      []outputField    `json:"fields"`
	RequiredAny []requiredChoice `json:"requiredAny"`
	Documents   []string         `json:"documents"`
}

type outputField struct {
	Name     string `json:"name"`
	Source   string `json:"source"`
	Required bool   `json:"required,omitempty"`
}

type requiredChoice struct {
	Label  string   `json:"label"`
	Fields []string `json:"fields"`
}

type Handoff struct {
	Title       string         `json:"title"`
	Channel     string         `json:"channel"`
	Instruction string         `json:"instruction"`
	SourceURL   string         `json:"sourceUrl,omitempty"`
	Fields      []FieldValue   `json:"fields"`
	Output      *OutputPreview `json:"output,omitempty"`
}

type OutputPreview struct {
	ContractRef
	Format      string           `json:"format"`
	Schema      OutputSchema     `json:"schema"`
	RequiredAny []requiredChoice `json:"requiredAny,omitempty"`
	Values      Values           `json:"values"`
	Missing     []string         `json:"missing"`
	Documents   []string         `json:"documents,omitempty"`
}

type OutputSchema struct {
	Dialect              string                    `json:"$schema"`
	Type                 string                    `json:"type"`
	Properties           map[string]OutputProperty `json:"properties"`
	Required             []string                  `json:"required,omitempty"`
	AllOf                []OutputAlternative       `json:"allOf,omitempty"`
	AdditionalProperties bool                      `json:"additionalProperties"`
}

type OutputProperty struct {
	Title     string   `json:"title"`
	Type      string   `json:"type"`
	MinLength int      `json:"minLength"`
	Format    string   `json:"format,omitempty"`
	Enum      []string `json:"enum,omitempty"`
}

type OutputAlternative struct {
	AnyOf []requiredProperties `json:"anyOf"`
}

type requiredProperties struct {
	Required []string `json:"required"`
}

type FieldValue struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type Details struct {
	Record  Record  `json:"record"`
	Handoff Handoff `json:"handoff"`
}

type Summary struct {
	ID              string    `json:"id"`
	CreatedAt       time.Time `json:"createdAt"`
	StateCode       string    `json:"stateCode"`
	RequestedOffice *string   `json:"requestedOffice"`
	Status          string    `json:"status"`
	ReviewFlags     []string  `json:"reviewFlags"`
	Topic           string    `json:"topic,omitempty"`
	County          string    `json:"county,omitempty"`
}

func (s Schema) Summary(record Record) Summary {
	state, _ := s.state(record.StateCode)
	summary := Summary{
		ID: record.ID, CreatedAt: record.CreatedAt, StateCode: state.Code, RequestedOffice: record.RequestedOffice,
		Status: record.Status, ReviewFlags: record.ReviewFlags, County: record.Concern["county"],
	}
	for _, field := range state.OfficeFields[officeKey(record.RequestedOffice)] {
		if field.Key == "topic" {
			summary.Topic = field.display(record.OfficeDetails["topic"])
			break
		}
	}
	if summary.Topic == "" {
		summary.Topic = findHint(state.RoutingHints, record.RoutingHint).Label
		question := state.clarifications[record.RoutingHint]
		for _, option := range question.Options {
			if option.Value == record.RoutingAnswer {
				summary.Topic = question.TopicLabel + " · " + option.Label
				break
			}
		}
	}
	return summary
}

func (s Schema) handoffRule(record Record, stateCode string) *rule {
	office := officeKey(record.RequestedOffice)
	if slices.Contains(record.ReviewFlags, "routing_review") {
		office = "triage"
	}
	for i := range s.handoffs {
		route := &s.handoffs[i]
		if route.Office != office || (route.State != "" && route.State != stateCode) {
			continue
		}
		if record.OutputContract != nil {
			if route.Output.ContractRef == *record.OutputContract {
				return route
			}
			continue
		}
		if !route.Retired && matches(route.Concern, record.Concern) && matches(route.When, record.OfficeDetails) {
			return route
		}
	}
	return nil
}

func (s Schema) Details(record Record) Details {
	state, _ := s.state(record.StateCode)
	route := s.handoffRule(record, state.Code)
	if route == nil {
		return Details{Record: record, Handoff: Handoff{
			Title: "Staff review", Channel: "Internal",
			Instruction: "Confirm the receiving workflow and the applicable output schema.",
			Fields:      []FieldValue{},
		}}
	}
	handoff := route.Handoff
	handoff.Fields = make([]FieldValue, 0, len(route.Output.Fields))
	output := &OutputPreview{
		ContractRef: route.Output.ContractRef, Format: route.Output.Format,
		Schema:  OutputSchema{Dialect: "https://json-schema.org/draft/2020-12/schema", Type: "object", Properties: map[string]OutputProperty{}},
		Values:  Values{},
		Missing: []string{}, RequiredAny: route.Output.RequiredAny, Documents: route.Output.Documents,
	}
	for _, mapping := range route.Output.Fields {
		section, key, _ := strings.Cut(mapping.Source, ".")
		field := s.sourceField(state, route.Office, section, key)
		property := OutputProperty{Title: field.Label, Type: "string", MinLength: 1}
		if field.Type == "date" {
			property.Format = "date"
		}
		for _, option := range field.Options {
			property.Enum = append(property.Enum, option.Value)
		}
		output.Schema.Properties[mapping.Name] = property
		if mapping.Required {
			output.Schema.Required = append(output.Schema.Required, mapping.Name)
		}

		var values Values
		switch section {
		case "concern":
			values = record.Concern
		case "contact":
			values = record.Contact
		case "receipt":
			values = record.Receipt
		case "officeDetails":
			values = record.OfficeDetails
		}
		if value := values[key]; value != "" {
			output.Values[mapping.Name] = value
			handoff.Fields = append(handoff.Fields, FieldValue{Label: field.Label, Value: field.display(value)})
		} else if mapping.Required {
			output.Missing = append(output.Missing, field.Label)
		}
	}
	for _, group := range route.Output.RequiredAny {
		alternatives := OutputAlternative{}
		for _, name := range group.Fields {
			alternatives.AnyOf = append(alternatives.AnyOf, requiredProperties{Required: []string{name}})
		}
		output.Schema.AllOf = append(output.Schema.AllOf, alternatives)
		if !slices.ContainsFunc(group.Fields, func(name string) bool { return output.Values[name] != "" }) {
			output.Missing = append(output.Missing, group.Label)
		}
	}
	handoff.Output = output
	return Details{Record: record, Handoff: handoff}
}

func (s Schema) sourceField(state stateConfig, office, section, key string) Field {
	groups := [][]Field{}
	switch section {
	case "concern":
		groups = [][]Field{s.ConcernFields, state.LocationFields}
	case "contact", "receipt":
		groups = [][]Field{s.ContactFields}
	case "officeDetails":
		groups = [][]Field{state.OfficeFields[office]}
	}
	for _, fields := range groups {
		for _, field := range fields {
			if field.Key == key {
				return field
			}
		}
	}
	return Field{}
}

func (s Schema) validateHandoffs() error {
	seen := make(map[ContractRef]bool)
	for _, route := range s.handoffs {
		ref := route.Output.ContractRef
		if ref.ID == "" || ref.Version < 1 || route.Output.Format == "" ||
			route.Title == "" || route.Channel == "" || seen[ref] {
			return fmt.Errorf("invalid or duplicate output contract %q", ref.ID)
		}
		seen[ref] = true
		state, ok := s.state(route.State)
		_, officeExists := state.OfficeFields[route.Office]
		if !ok || !officeExists || (route.State == "" && route.Office != "triage") {
			return fmt.Errorf("invalid state or office for output contract %q", ref.ID)
		}
		if route.SourceURL != "" {
			link, err := url.Parse(route.SourceURL)
			if err != nil || link.Scheme != "https" || link.Host == "" || link.User != nil || strings.ContainsAny(route.SourceURL, "{}") {
				return fmt.Errorf("invalid source link for output contract %q", ref.ID)
			}
		} else if route.Output.Format == "public_referral" {
			return fmt.Errorf("missing source link for output contract %q", ref.ID)
		}
		fields := map[string]bool{}
		for _, field := range route.Output.Fields {
			section, key, valid := strings.Cut(field.Source, ".")
			if !valid || field.Name == "" || fields[field.Name] || s.sourceField(state, route.Office, section, key).Key == "" {
				return fmt.Errorf("invalid mapping %q for output contract %q", field.Name, ref.ID)
			}
			fields[field.Name] = true
		}
		for _, group := range route.Output.RequiredAny {
			if group.Label == "" || len(group.Fields) == 0 {
				return fmt.Errorf("invalid alternatives for output contract %q", ref.ID)
			}
			for _, name := range group.Fields {
				if !fields[name] {
					return fmt.Errorf("unknown alternate field %q for output contract %q", name, ref.ID)
				}
			}
		}
	}
	return nil
}
