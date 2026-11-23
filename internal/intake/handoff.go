package intake

import "time"

type rule struct {
	Office string              `json:"office"`
	When   map[string][]string `json:"when"`
	Fields []string            `json:"fields"`
	Handoff
}

type Handoff struct {
	Title       string       `json:"title"`
	Channel     string       `json:"channel"`
	Instruction string       `json:"instruction"`
	SourceURL   string       `json:"sourceUrl,omitempty"`
	Fields      []FieldValue `json:"fields"`
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
	RequestedOffice *string   `json:"requestedOffice"`
	Status          string    `json:"status"`
	ReviewFlags     []string  `json:"reviewFlags"`
	Topic           string    `json:"topic,omitempty"`
	County          string    `json:"county,omitempty"`
}

func (s Schema) Summary(record Record) Summary {
	summary := Summary{
		ID: record.ID, CreatedAt: record.CreatedAt, RequestedOffice: record.RequestedOffice,
		Status: record.Status, ReviewFlags: record.ReviewFlags, County: record.Concern["county"],
	}
	for _, field := range s.OfficeFields[officeKey(record.RequestedOffice)] {
		if field.Key == "topic" {
			summary.Topic = field.display(record.OfficeDetails["topic"])
			break
		}
	}
	return summary
}

func (s Schema) Details(record Record) Details {
	office := officeKey(record.RequestedOffice)
	for _, flag := range record.ReviewFlags {
		if flag == "routing_review" {
			office = "triage"
			break
		}
	}
	for _, rule := range s.handoffs {
		if rule.Office != office || !matches(rule.When, record.OfficeDetails) {
			continue
		}
		handoff := rule.Handoff
		handoff.Fields = make([]FieldValue, 0, len(rule.Fields))
		for _, key := range rule.Fields {
			if value := record.OfficeDetails[key]; value != "" {
				for _, field := range s.OfficeFields[office] {
					if field.Key == key {
						handoff.Fields = append(handoff.Fields, FieldValue{Label: field.Label, Value: field.display(value)})
						break
					}
				}
			}
		}
		return Details{Record: record, Handoff: handoff}
	}
	return Details{Record: record, Handoff: Handoff{
		Title: "Staff review", Channel: "Internal", Instruction: "Confirm the appropriate receiving workflow.",
		Fields: []FieldValue{},
	}}
}
