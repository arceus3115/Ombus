package intake

import (
	"testing"
	"time"
)

func TestSavedCaseKeepsItsOutputVersion(t *testing.T) {
	schema, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	office := "ooltc"
	input := Input{
		ID: "00000000-0000-4000-8000-000000000001", SchemaVersion: schema.Version, RequestedOffice: &office,
		Concern: Values{"relationship": "self", "summary": "Sample concern", "urgency": "routine"},
		Contact: Values{"contactMethod": "none"}, OfficeDetails: Values{"topic": "complaint"},
	}
	saved, err := schema.Prepare(input, time.Now())
	if err != nil || saved.OutputContract == nil {
		t.Fatalf("prepare: %v, contract %+v", err, saved.OutputContract)
	}
	for i := range schema.handoffs {
		old := &schema.handoffs[i]
		if old.Output.ContractRef != *saved.OutputContract {
			continue
		}
		next := *old
		next.Output.Version++
		old.Retired = true
		schema.handoffs = append(schema.handoffs, next)
		break
	}

	later, err := schema.Prepare(input, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if version := schema.Details(saved).Handoff.Output.Version; version != 1 {
		t.Fatalf("saved case output version %d", version)
	}
	if later.OutputContract.Version != 2 {
		t.Fatalf("new case output version %d", later.OutputContract.Version)
	}
}
