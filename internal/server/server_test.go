package server

import (
	"bytes"
	"encoding/json"
	"fmt"
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

func TestPublicIntakeRoutesLongTermCareInEveryState(t *testing.T) {
	handler, _ := workspace(t)
	states := strings.Fields("AL AK AZ AR CA CO CT DE DC FL GA GU HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY")
	for i, state := range states {
		t.Run(state, func(t *testing.T) {
			input := sampleIntake(nil)
			input.ID = fmt.Sprintf("00000000-0000-4000-8000-%012d", i+1)
			input.SchemaVersion = 2
			input.StateCode = state
			input.RoutingHint = "resident_rights"
			input.OfficeDetails = intake.Values{"setting": "nursing", "ageBand": "60_plus"}
			response := call(t, handler, http.MethodPost, "/api/cases", input)
			expect(t, response, http.StatusCreated)
			var result intake.Details
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Record.RequestedOffice == nil || !strings.HasPrefix(result.Handoff.SourceURL, "https://") || result.Handoff.Output == nil {
				t.Fatalf("missing long-term care handoff: %+v", result.Handoff)
			}
			if result.Handoff.Output.Format == "public_referral" && len(result.Handoff.Output.Values) != 0 {
				t.Fatalf("referral unexpectedly contains case data: %+v", result.Handoff.Output.Values)
			}
		})
	}
}

func TestPublicIntakeSelectsVerifiedDestinations(t *testing.T) {
	for _, tc := range []struct {
		name, state, topic, county, setting, title, link string
	}{
		{"county", "CA", "resident_rights", "06037", "nursing", "Los Angeles County Long-Term Care Ombudsman", "?cc=LA"},
		{"statewide", "CA", "resident_rights", "", "assisted", "California Long-Term Care Ombudsman", "aging.ca.gov/Programs_and_Services"},
		{"out of scope", "CA", "resident_rights", "06037", "other", "Internal routing review", ""},
		{"unknown program", "NE", "education", "", "", "Internal routing review", ""},
		{"unclear concern", "WA", "unsure", "", "", "Internal routing review", ""},
		{"verified program", "WA", "education", "", "", "Washington Office of the Education Ombuds", "oeo.wa.gov"},
		{"directory", "NE", "facility_notice", "", "nursing", "Nebraska Long-Term Care Ombudsman", "/single-location/nebraska/"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler, reopen := workspace(t)
			wrongOffice := "omhdd"
			input := sampleIntake(&wrongOffice)
			input.SchemaVersion, input.StateCode, input.RoutingHint = 2, tc.state, tc.topic
			input.Concern["countyCode"] = tc.county
			input.OfficeDetails = intake.Values{"setting": tc.setting, "topic": "monitoring"}
			response := call(t, handler, http.MethodPost, "/api/cases", input)
			expect(t, response, http.StatusCreated)
			var result intake.Details
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Handoff.Title != tc.title || (tc.link == "" && result.Handoff.SourceURL != "") || !strings.Contains(result.Handoff.SourceURL, tc.link) {
				t.Fatalf("unexpected handoff: %+v", result.Handoff)
			}
			handler = reopen()
			stored := call(t, handler, http.MethodGet, "/api/cases/"+testID, nil)
			expect(t, stored, http.StatusOK)
			if !bytes.Equal(stored.Body.Bytes(), response.Body.Bytes()) {
				t.Fatal("saved handoff changed after reopening")
			}
			expect(t, call(t, handler, http.MethodPost, "/api/cases", input), http.StatusOK)
		})
	}
}

func TestPublicIntakeRequiresLocationAndTopicAndDerivesPilotBranch(t *testing.T) {
	handler, _ := workspace(t)
	wrongOffice := "omhdd"
	input := sampleIntake(&wrongOffice)
	input.SchemaVersion = 2
	input.RoutingHint = "facility_notice"
	expect(t, call(t, handler, http.MethodPost, "/api/cases", input), http.StatusUnprocessableEntity)
	input.StateCode, input.RoutingHint = "MN", "not_a_topic"
	expect(t, call(t, handler, http.MethodPost, "/api/cases", input), http.StatusUnprocessableEntity)
	input.RoutingHint = "facility_notice"
	input.OfficeDetails = intake.Values{"topic": "monitoring", "noticeType": "nursing_discharge_transfer", "incidentType": "death"}
	response := call(t, handler, http.MethodPost, "/api/cases", input)
	expect(t, response, http.StatusCreated)
	var result intake.Details
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Handoff.Title != "Nursing facility transfer or discharge notice" || result.Record.OfficeDetails["topic"] != "notice" || result.Record.OfficeDetails["incidentType"] != "" {
		t.Fatalf("unexpected intake: %+v", result)
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
