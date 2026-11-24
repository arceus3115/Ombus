package intake

import (
	"encoding/json"
	"fmt"
	"maps"
	"net/mail"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"ombus/config"
)

type Values map[string]string

type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type Field struct {
	Key      string              `json:"key"`
	Label    string              `json:"label"`
	Type     string              `json:"type"`
	Required bool                `json:"required"`
	Max      int                 `json:"max"`
	Options  []Option            `json:"options"`
	When     map[string][]string `json:"when"`
}

type Hint struct {
	Value        string `json:"value"`
	Label        string `json:"label"`
	Office       string `json:"office"`
	Topic        string `json:"topic"`
	FollowUpOnly bool   `json:"followUpOnly"`
	sinceVersion int
	directory    bool
}

type reviewRule struct {
	Flag                     string              `json:"flag"`
	State                    string              `json:"state"`
	Office                   string              `json:"office"`
	Concern                  map[string][]string `json:"concern"`
	Details                  map[string][]string `json:"details"`
	DifferentSuggestedOffice bool                `json:"differentSuggestedOffice"`
}

type Schema struct {
	Version       int          `json:"version"`
	ConcernFields []Field      `json:"concernFields"`
	ContactFields []Field      `json:"contactFields"`
	ReviewRules   []reviewRule `json:"reviewRules"`
	states        map[string]stateConfig
	handoffs      []rule
	publicVersion int
}

type stateConfig struct {
	Code                string             `json:"code"`
	Name                string             `json:"name"`
	TimeZone            string             `json:"timeZone"`
	CountySet           string             `json:"countySet"`
	LocationFields      []Field            `json:"locationFields"`
	OfficeFields        map[string][]Field `json:"officeFields"`
	RoutingHints        []Hint             `json:"routingHints"`
	legacyHints         []Hint
	previousPublicHints []Hint
	clarifications      map[string]clarification
}

type Input struct {
	ID              string  `json:"id"`
	SchemaVersion   int     `json:"schemaVersion"`
	StateCode       string  `json:"stateCode,omitempty"`
	RequestedOffice *string `json:"requestedOffice"`
	RoutingHint     string  `json:"routingHint,omitempty"`
	RoutingAnswer   string  `json:"routingAnswer,omitempty"`
	Receipt         Values  `json:"receipt"`
	Concern         Values  `json:"concern"`
	Contact         Values  `json:"contact"`
	OfficeDetails   Values  `json:"officeDetails"`
}

type Record struct {
	Input
	CreatedAt      time.Time    `json:"createdAt"`
	Status         string       `json:"status"`
	ReviewFlags    []string     `json:"reviewFlags"`
	OutputContract *ContractRef `json:"outputContract,omitempty"`
}

const PendingReview = "pending_staff_review"
const defaultState = "MN"

var caseID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func ValidID(value string) bool { return caseID.MatchString(value) }

func Load() (Schema, error) {
	var schema Schema
	if err := json.Unmarshal(config.Intake, &schema); err != nil {
		return Schema{}, fmt.Errorf("intake configuration: %w", err)
	}
	var counties map[string][]Option
	if err := json.Unmarshal(config.Counties, &counties); err != nil {
		return Schema{}, fmt.Errorf("county configuration: %w", err)
	}
	var states []stateConfig
	if err := json.Unmarshal(config.States, &states); err != nil {
		return Schema{}, fmt.Errorf("state configuration: %w", err)
	}
	schema.states = make(map[string]stateConfig, len(states))
	for _, state := range states {
		for i := range state.LocationFields {
			field := &state.LocationFields[i]
			if field.Type != "county" || len(field.Options) > 0 {
				continue
			}
			field.Options = counties[state.CountySet]
			if len(field.Options) == 0 {
				return Schema{}, fmt.Errorf("no county options for state %q", state.Code)
			}
		}
		if state.Code == "" || state.Name == "" || state.TimeZone == "" || schema.states[state.Code].Code != "" {
			return Schema{}, fmt.Errorf("invalid or duplicate state %q", state.Code)
		}
		schema.states[state.Code] = state
	}
	if err := json.Unmarshal(config.Handoffs, &schema.handoffs); err != nil {
		return Schema{}, fmt.Errorf("handoff configuration: %w", err)
	}
	if err := schema.loadRouting(counties); err != nil {
		return Schema{}, err
	}
	if err := schema.validateHandoffs(); err != nil {
		return Schema{}, err
	}
	return schema, nil
}

func (s Schema) state(code string) (stateConfig, bool) {
	if code == "" {
		code = defaultState
	}
	state, ok := s.states[code]
	return state, ok
}

func officeKey(office *string) string {
	if office == nil {
		return "triage"
	}
	return *office
}

func (s Schema) Prepare(input Input, now time.Time) (Record, error) {
	public := input.SchemaVersion == firstPublicVersion || input.SchemaVersion == s.publicVersion
	if (!public && input.SchemaVersion != s.Version) || !ValidID(input.ID) {
		return Record{}, fmt.Errorf("invalid record ID or intake schema version")
	}
	state, ok := s.state(input.StateCode)
	if !ok || (public && input.StateCode == "") || (!public && state.legacyHints == nil) {
		return Record{}, fmt.Errorf("choose a supported state")
	}
	hints := state.legacyHints
	if public {
		hints = state.RoutingHints
	}
	if input.SchemaVersion == firstPublicVersion {
		hints = state.previousPublicHints
	}
	hint := findHint(hints, input.RoutingHint)
	if input.RoutingHint != "" && (hint.Value == "" || hint.FollowUpOnly) {
		return Record{}, fmt.Errorf("choose a valid topic")
	}
	question := state.clarifications[input.RoutingHint]
	if input.SchemaVersion == s.publicVersion && question.Topic != "" {
		option := slices.IndexFunc(question.Options, func(option clarificationOption) bool { return option.Value == input.RoutingAnswer })
		if option < 0 {
			return Record{}, fmt.Errorf("choose a response to %q", question.Label)
		}
		hint = findHint(hints, question.Options[option].Route)
	} else if input.RoutingAnswer != "" {
		return Record{}, fmt.Errorf("that routing answer does not apply")
	}
	office := officeKey(input.RequestedOffice)
	if public {
		if hint.Value == "" {
			return Record{}, fmt.Errorf("choose what your concern is about")
		}
		office = hint.Office
		input.RequestedOffice = nil
		if office != "triage" {
			input.RequestedOffice = &office
		}
		if hint.Topic != "" {
			details := make(Values, len(input.OfficeDetails)+1)
			maps.Copy(details, input.OfficeDetails)
			details["topic"] = hint.Topic
			input.OfficeDetails = details
		}
	}
	fields, known := state.OfficeFields[office]
	if !known || (input.RequestedOffice != nil && office == "triage") {
		return Record{}, fmt.Errorf("choose an office for this state or staff review")
	}
	contactAndReceipt := make(Values, len(input.Contact)+2)
	for key, value := range input.Contact {
		contactAndReceipt[key] = value
	}
	contactAndReceipt["receivedVia"] = input.Receipt["receivedVia"]
	contactAndReceipt["receivedAtCentral"] = input.Receipt["receivedAtCentral"]
	contact, err := normalize(s.ContactFields, contactAndReceipt)
	if err != nil {
		return Record{}, err
	}
	input.Receipt = Values{}
	for _, key := range []string{"receivedVia", "receivedAtCentral"} {
		if value, ok := contact[key]; ok {
			input.Receipt[key] = value
			delete(contact, key)
		}
	}
	if input.Receipt["receivedAtCentral"] != "" && state.TimeZone != "" {
		input.Receipt["timeZone"] = state.TimeZone
	}
	input.Contact = contact

	concernData := make(Values, len(input.Concern))
	for key, value := range input.Concern {
		concernData[key] = value
	}
	if countyCode := input.Concern["countyCode"]; countyCode != "" {
		concernData["county"] = countyCode
	}
	concern, err := normalize(append(slices.Clone(s.ConcernFields), state.LocationFields...), concernData)
	if err != nil {
		return Record{}, err
	}
	if code := concern["county"]; code != "" {
		for _, field := range state.LocationFields {
			if field.Key == "county" {
				concern["county"] = field.display(code)
				concern["countyCode"] = code
				break
			}
		}
	}
	input.Concern = concern
	details, err := normalize(fields, input.OfficeDetails)
	if err != nil {
		return Record{}, err
	}
	input.OfficeDetails = details

	flags := make([]string, 0)
	for _, rule := range s.ReviewRules {
		if (rule.State != "" && rule.State != state.Code) || (rule.Office != "" && rule.Office != office) ||
			(rule.DifferentSuggestedOffice && (hint.Office == "" || hint.Office == office)) {
			continue
		}
		if matches(rule.Concern, concern) && matches(rule.Details, details) && !slices.Contains(flags, rule.Flag) {
			flags = append(flags, rule.Flag)
		}
	}
	record := Record{Input: input, CreatedAt: now.UTC(), Status: PendingReview, ReviewFlags: flags}
	if route := s.handoffRule(record, state.Code); route != nil {
		record.OutputContract = &route.Output.ContractRef
	}
	return record, nil
}

func matches(when map[string][]string, values Values) bool {
	for key, allowed := range when {
		if !slices.Contains(allowed, values[key]) {
			return false
		}
	}
	return true
}

func normalize(fields []Field, raw Values) (Values, error) {
	values := make(Values)
	for _, field := range fields {
		if !matches(field.When, values) {
			continue
		}
		value := strings.TrimSpace(raw[field.Key])
		if value == "" {
			if field.Required {
				return nil, fmt.Errorf("%s needs a response", field.Label)
			}
			continue
		}
		if !field.valid(value) {
			return nil, fmt.Errorf("%s has an invalid value", field.Label)
		}
		values[field.Key] = value
	}
	return values, nil
}

func (field Field) valid(value string) bool {
	if field.Max > 0 && utf8.RuneCountInString(value) > field.Max {
		return false
	}
	if len(field.Options) > 0 && !slices.ContainsFunc(field.Options, func(option Option) bool { return option.Value == value }) {
		return false
	}
	switch field.Type {
	case "email":
		address, err := mail.ParseAddress(value)
		return err == nil && address.Name == "" && address.Address == value
	case "date":
		_, err := time.Parse("2006-01-02", value)
		return err == nil
	case "datetime-local":
		_, err := time.Parse("2006-01-02T15:04", value)
		return err == nil
	default:
		return true
	}
}

func (field Field) display(value string) string {
	for _, option := range field.Options {
		if option.Value == value {
			return option.Label
		}
	}
	if field.Type == "datetime-local" {
		return strings.Replace(value, "T", " ", 1) + " local time"
	}
	return value
}
