package intake

import (
	"encoding/json"
	"fmt"
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
	Value  string `json:"value"`
	Office string `json:"office"`
}

type Schema struct {
	Version       int                `json:"version"`
	ConcernFields []Field            `json:"concernFields"`
	ContactFields []Field            `json:"contactFields"`
	OfficeFields  map[string][]Field `json:"officeFields"`
	RoutingHints  []Hint             `json:"routingHints"`
	handoffs      []rule
}

type Input struct {
	ID              string  `json:"id"`
	SchemaVersion   int     `json:"schemaVersion"`
	RequestedOffice *string `json:"requestedOffice"`
	RoutingHint     string  `json:"routingHint,omitempty"`
	Receipt         Values  `json:"receipt"`
	Concern         Values  `json:"concern"`
	Contact         Values  `json:"contact"`
	OfficeDetails   Values  `json:"officeDetails"`
}

type Record struct {
	Input
	CreatedAt   time.Time `json:"createdAt"`
	Status      string    `json:"status"`
	ReviewFlags []string  `json:"reviewFlags"`
}

const PendingReview = "pending_staff_review"

var caseID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func ValidID(value string) bool { return caseID.MatchString(value) }

func Load() (Schema, error) {
	var schema Schema
	if err := json.Unmarshal(config.Intake, &schema); err != nil {
		return Schema{}, fmt.Errorf("intake configuration: %w", err)
	}
	if err := json.Unmarshal(config.Handoffs, &schema.handoffs); err != nil {
		return Schema{}, fmt.Errorf("handoff configuration: %w", err)
	}
	return schema, nil
}

func officeKey(office *string) string {
	if office == nil {
		return "triage"
	}
	return *office
}

func (s Schema) Prepare(input Input, now time.Time) (Record, error) {
	if input.SchemaVersion != s.Version || !ValidID(input.ID) {
		return Record{}, fmt.Errorf("invalid record ID or intake schema version")
	}
	office := officeKey(input.RequestedOffice)
	fields, known := s.OfficeFields[office]
	if !known || (input.RequestedOffice != nil && office == "triage") {
		return Record{}, fmt.Errorf("choose a valid office or staff review")
	}
	hintOffice := ""
	if input.RoutingHint != "" {
		for _, hint := range s.RoutingHints {
			if hint.Value == input.RoutingHint {
				hintOffice = hint.Office
				break
			}
		}
		if hintOffice == "" {
			return Record{}, fmt.Errorf("invalid routing suggestion")
		}
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
	if input.Receipt["receivedAtCentral"] != "" {
		input.Receipt["timeZone"] = "America/Chicago"
	}
	input.Contact = contact

	concernData := make(Values, len(input.Concern))
	for key, value := range input.Concern {
		concernData[key] = value
	}
	if countyCode := input.Concern["countyCode"]; countyCode != "" {
		concernData["county"] = countyCode
	}
	concern, err := normalize(s.ConcernFields, concernData)
	if err != nil {
		return Record{}, err
	}
	if code := concern["county"]; code != "" {
		for _, field := range s.ConcernFields {
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
	if concern["urgency"] == "immediate_danger" {
		flags = append(flags, "immediate_safety_concern")
	}
	if concern["urgency"] == "time_sensitive" || details["urgentService"] == "yes" {
		flags = append(flags, "time_sensitive")
	}
	if office == "triage" || details["program"] == "other" || (hintOffice != "" && hintOffice != office) {
		flags = append(flags, "routing_review")
	}
	switch {
	case office == "ooltc" && details["topic"] == "notice":
		flags = append(flags, "facility_notice_review")
	case office == "omhdd" && details["topic"] == "incident":
		flags = append(flags, "incident_report_review")
	case office == "managed_care" && details["topic"] == "benefit_decision":
		flags = append(flags, "appeal_review")
	}
	return Record{Input: input, CreatedAt: now.UTC(), Status: PendingReview, ReviewFlags: flags}, nil
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
		return strings.Replace(value, "T", " ", 1) + " Central time"
	}
	return value
}
