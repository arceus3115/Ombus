package main

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"ombus/internal/intake"
)

func writeCoverage(w io.Writer, format string, report intake.CoverageReport) error {
	if format == "json" {
		encoder := json.NewEncoder(w)
		encoder.SetIndent("", "  ")
		return encoder.Encode(report)
	}
	if format != "markdown" {
		return fmt.Errorf("coverage format must be json or markdown")
	}
	var out strings.Builder
	out.WriteString("# Ombus routing coverage\n\n")
	out.WriteString("Regenerate with `go run ./cmd/ombus -coverage=markdown`. Use `-coverage=json` for contact URLs, sources, additional topics, and the destinations for each follow-up answer.\n\n")
	out.WriteString("**Office** means Ombus has a published contact for the matched office. **Directory** means a program directory can find the local contact. **Question** means one answer is needed to distinguish offices. **Resource** means the case goes to staff review with a published public resource. **Review** means staff review alone. A specific intake may require staff review if the answers leave its jurisdiction uncertain.\n\n")
	shortLabels := map[string]string{
		"resident_rights": "Long-term care", "facility_notice": "Care facility notice", "client_services": "Mental health or disability", "access_or_billing": "Medicaid",
		"foster_care": "Child welfare", "education": "Public education", "corrections": "Corrections", "government": "State government",
	}
	out.WriteString("| Jurisdiction |")
	for _, topic := range report.Topics {
		label := shortLabels[topic.Value]
		if label == "" {
			label = topic.Label
		}
		fmt.Fprintf(&out, " %s |", label)
	}
	out.WriteString("\n| --- |" + strings.Repeat(" --- |", len(report.Topics)) + "\n")
	for _, state := range report.Jurisdictions {
		entries := make(map[string]intake.TopicCoverage, len(state.Topics))
		for _, route := range state.Topics {
			entries[route.Topic.Value] = route
		}
		fmt.Fprintf(&out, "| %s (%s) |", state.Name, state.Code)
		for _, topic := range report.Topics {
			entry := entries[topic.Value]
			label := coverageLabel(entry)
			if entry.CountyRoutes > 0 {
				label += fmt.Sprintf(" + %d county contacts", entry.CountyRoutes)
			}
			fmt.Fprintf(&out, " %s |", label)
		}
		out.WriteByte('\n')
	}
	_, err := io.WriteString(w, out.String())
	return err
}

func coverageLabel(entry intake.TopicCoverage) string {
	if entry.Question != "" {
		return "Question"
	}
	if entry.Routing != nil {
		switch entry.Routing.Kind {
		case "office":
			return "Office"
		case "program_directory":
			return "Directory"
		case "staff_review_with_resource":
			return "Resource"
		}
	}
	return "Review"
}
