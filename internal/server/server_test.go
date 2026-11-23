package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ombus/internal/intake"
	"ombus/internal/store"
)

const testID = "00000000-0000-4000-8000-000000000001"

func workspace(t *testing.T) (http.Handler, func() http.Handler) {
	t.Helper()
	schema, err := intake.Load()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	open := func() http.Handler {
		cases, err := store.Open(dir)
		if err != nil {
			t.Fatal(err)
		}
		return New(schema, cases, "")
	}
	return open(), open
}

func call(t *testing.T, handler http.Handler, method, path string, input any) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	if input != nil {
		if err := json.NewEncoder(&body).Encode(input); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, "http://127.0.0.1:8766"+path, &body)
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func expect(t *testing.T, response *httptest.ResponseRecorder, status int) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("HTTP %d, want %d: %s", response.Code, status, response.Body)
	}
}

func sampleIntake(office *string) intake.Input {
	return intake.Input{
		ID: testID, SchemaVersion: 1, RequestedOffice: office,
		Concern: intake.Values{"relationship": "self", "summary": "Fictional summary", "urgency": "routine"},
		Contact: intake.Values{"contactMethod": "none"},
	}
}

func TestSaveRetryAndReadFromReopenedStore(t *testing.T) {
	handler, reopen := workspace(t)
	office := "ooltc"
	input := sampleIntake(&office)
	input.Concern["county"] = "Client-supplied county label"
	input.Concern["countyCode"] = "27053"
	input.Contact["phone"] = "stale hidden number"
	input.OfficeDetails = intake.Values{
		"topic": "notice", "noticeType": "assisted_living_termination", "provider": "Fictional facility",
		"residentReceiptDate": "2026-11-23", "incidentType": "stale hidden incident",
	}

	created := call(t, handler, http.MethodPost, "/api/cases", input)
	expect(t, created, http.StatusCreated)
	if created.Header().Get("Location") != "/api/cases/"+testID || created.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing case location or no-store header")
	}
	var details intake.Details
	if err := json.Unmarshal(created.Body.Bytes(), &details); err != nil {
		t.Fatal(err)
	}
	if details.Record.Concern["county"] != "Hennepin" || details.Record.Contact["phone"] != "" || details.Record.OfficeDetails["incidentType"] != "" {
		t.Fatalf("unexpected normalization: %+v", details.Record)
	}
	if details.Handoff.Title != "Assisted living notice" || len(details.Handoff.Fields) != 3 {
		t.Fatalf("unexpected handoff: %+v", details.Handoff)
	}

	handler = reopen()
	retried := call(t, handler, http.MethodPost, "/api/cases", input)
	expect(t, retried, http.StatusOK)
	if !bytes.Equal(created.Body.Bytes(), retried.Body.Bytes()) {
		t.Fatal("retry changed the saved record")
	}

	input.Concern["summary"] = "A different attempt"
	expect(t, call(t, handler, http.MethodPost, "/api/cases", input), http.StatusConflict)
	expect(t, call(t, handler, http.MethodGet, "/api/cases/"+testID, nil), http.StatusOK)
	list := call(t, handler, http.MethodGet, "/api/cases", nil)
	expect(t, list, http.StatusOK)
	if !strings.Contains(list.Body.String(), "Hennepin") || strings.Contains(list.Body.String(), "Fictional summary") {
		t.Fatalf("unexpected case list payload: %s", list.Body)
	}
}

func TestHandoffVariants(t *testing.T) {
	for _, tt := range []struct {
		name, office, hint, title string
		fields                    intake.Values
	}{
		{"incident", "omhdd", "incident", "Death or serious injury report", intake.Values{"topic": "incident", "incidentType": "death"}},
		{"supplement", "omhdd", "incident", "Supplement an existing OMHDD incident report", intake.Values{"topic": "incident", "incidentType": "serious_injury", "alreadyReported": "yes", "agencyReference": "CASE-001"}},
		{"appeal", "managed_care", "benefit_decision", "Health plan appeal", intake.Values{"topic": "benefit_decision", "appealStage": "pending"}},
		{"hearing", "managed_care", "benefit_decision", "Managed care state fair hearing review", intake.Values{"topic": "benefit_decision", "appealStage": "decision"}},
		{"override", "omhdd", "facility_notice", "Internal routing review", intake.Values{"topic": "guardian"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := workspace(t)
			input := sampleIntake(&tt.office)
			input.RoutingHint = tt.hint
			input.OfficeDetails = tt.fields
			response := call(t, handler, http.MethodPost, "/api/cases", input)
			expect(t, response, http.StatusCreated)
			var details intake.Details
			if err := json.Unmarshal(response.Body.Bytes(), &details); err != nil {
				t.Fatal(err)
			}
			if details.Handoff.Title != tt.title {
				t.Fatalf("handoff title %q, want %q", details.Handoff.Title, tt.title)
			}
		})
	}
}

func TestInvalidIntakeAndOriginAreRejected(t *testing.T) {
	handler, _ := workspace(t)
	input := sampleIntake(nil)
	input.Contact["contactMethod"] = "email"
	expect(t, call(t, handler, http.MethodPost, "/api/cases", input), http.StatusUnprocessableEntity)

	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8766/api/cases", nil)
	req.Header.Set("Origin", "https://example.com")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	expect(t, response, http.StatusForbidden)

	expect(t, call(t, handler, http.MethodGet, "/api/cases/invalid", nil), http.StatusNotFound)
}

func TestWisconsinRoutingAndOutputContract(t *testing.T) {
	handler, _ := workspace(t)
	office := "wi_boaltc"
	input := sampleIntake(&office)
	input.StateCode = "WI"
	input.RoutingHint = "resident_rights"
	input.Concern["countyCode"] = "27053"
	input.Concern["serviceLocation"] = "Milwaukee County, 53202"
	input.OfficeDetails = intake.Values{
		"topic": "complaint", "ageBand": "60_plus", "setting": "nursing",
		"provider": "Sample care home", "plannedMoveDate": "2026-12-01",
	}
	response := call(t, handler, http.MethodPost, "/api/cases", input)
	expect(t, response, http.StatusCreated)
	var details intake.Details
	if err := json.Unmarshal(response.Body.Bytes(), &details); err != nil {
		t.Fatal(err)
	}
	if details.Record.Concern["countyCode"] != "" || details.Record.OfficeDetails["plannedMoveDate"] != "" {
		t.Fatalf("out-of-scope fields survived normalization: %+v", details.Record)
	}
	preview := details.Handoff.Output
	if preview == nil || preview.ID != "wi.boaltc.consumer_concern" || preview.Format != "web_form" {
		t.Fatalf("wrong contract: %+v", preview)
	}
	if preview.Values["service_location"] != "Milwaukee County, 53202" || preview.Values["concern_description"] != "Fictional summary" || len(preview.Missing) != 1 {
		t.Fatalf("wrong preview values or requirements: %+v", preview)
	}

	wrongOffice := "ooltc"
	input.RequestedOffice = &wrongOffice
	expect(t, call(t, handler, http.MethodPost, "/api/cases", input), http.StatusUnprocessableEntity)
	input.RequestedOffice = &office
	input.StateCode = "XX"
	expect(t, call(t, handler, http.MethodPost, "/api/cases", input), http.StatusUnprocessableEntity)
}

func TestWisconsinUncertainScopeStaysInInternalReview(t *testing.T) {
	handler, _ := workspace(t)
	office := "wi_boaltc"
	input := sampleIntake(&office)
	input.StateCode = "WI"
	input.RoutingHint = "resident_rights"
	input.OfficeDetails = intake.Values{"topic": "complaint", "ageBand": "under_60", "setting": "nursing"}
	response := call(t, handler, http.MethodPost, "/api/cases", input)
	expect(t, response, http.StatusCreated)
	var details intake.Details
	if err := json.Unmarshal(response.Body.Bytes(), &details); err != nil {
		t.Fatal(err)
	}
	if details.Handoff.Output == nil || details.Handoff.Output.Format != "internal_review" || len(details.Handoff.Output.Values) != 0 {
		t.Fatalf("unsafe handoff for uncertain scope: %+v", details.Handoff)
	}
}
