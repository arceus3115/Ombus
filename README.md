# Ombus

Ombus is a local ombudsman intake workspace. It uses the location and topic of a concern to find a program, ask relevant follow-up questions, and save an intake for staff review.

## Run locally

Install Node.js 22.18 or later with npm, and Go 1.25 or later. From the Ombus repository root, install the frontend dependencies, build the frontend, and start the Go server.

```sh
npm ci
npm run build
go run ./cmd/ombus
```

Keep that terminal open and visit [New intake](http://127.0.0.1:8765/) or the [case queue](http://127.0.0.1:8765/cases). Press `Ctrl+C` to stop the server. Run `npm run build` again after changing the frontend or intake routing configuration. Restart the server after changing Go code or files under `config/`.

To use a different port and a separate case directory, run the server with these flags and visit [port 8766](http://127.0.0.1:8766/).

```sh
go run ./cmd/ombus -port 8766 -data ./data/sample-cases
```

Use fictional or de-identified information. The server binds to loopback and stores unencrypted case files in `data/cases` by default. The `data/` directory is ignored by Git. Multi-user access and live case data require authentication, authorization, and approved storage.

## Project layout

| Path | Purpose |
| --- | --- |
| `web/src/features/intake/` | Four-step intake, routing suggestions, and review |
| `web/src/features/cases/` | Case queue, record detail, and handoff preview |
| `web/src/components/` | Shared field renderer, county picker, review sections, and status indicators |
| `web/src/styles/` | Shared tokens, layout, components, and surface styles |
| `config/` | Shared intake fields, state and topic profiles, county codes, review rules, and output contracts |
| `internal/intake/` | Validation, record normalization, review flags, and handoff selection |
| `internal/store/` | Local case storage |
| `internal/server/` | JSON API and same-origin frontend serving |
| `cmd/ombus/` | Server entry point |

## Records and handoffs

On the review step, `POST /api/routing/preview` validates the intake and returns the destination, contact and next-step message. The preview leaves the case store untouched. `POST /api/cases` runs the same validation and saves the intake as pending staff review. Retrying an identical request returns the original record. `GET /api/cases` provides queue metadata, and `GET /api/cases/{id}` returns the saved record and its handoff preview.

## Routing by jurisdiction and program

In **New intake**, choose the jurisdiction and what the issue concerns. If several offices could handle that topic, Ombus asks one question about the setting or issue to find the office with the right scope. An exact office or program directory gets a match. When coverage is incomplete, staff review is the destination and the portal shows a published public resource for the topic where available. An unclear answer or potential eligibility mismatch goes to staff review.

| Coverage | Current behavior |
| --- | --- |
| Long-term care | All 50 states, Washington, DC, Puerto Rico, and Guam have a statewide program or state-filtered directory route. California also routes to county contacts using the selected county. [Federal program coverage](https://acl.gov/programs/Protecting-Rights-and-Preventing-Abuse/Long-term-Care-Ombudsman-Program), [State program directory](https://theconsumervoice.org/get-help/), [California county contacts](https://aging.ca.gov/Find_Services_in_My_County/) |
| Pilot workflows | Minnesota’s long-term care, mental health and developmental disabilities, and public managed care workflows and Wisconsin’s long-term care workflow retain their specific questions and versioned handoff previews. [Minnesota workflow research](docs/minnesota-ombudsman-workflows.md), [Wisconsin program guidance](https://boaltc.wi.gov/Pages/Ombudsman.aspx) |
| Specialized programs | The catalog includes 28 verified public contacts across 15 jurisdictions for government complaints, managed care, foster care and child protection, K–12 public education, corrections, residential disability services, and state housing programs. Minnesota child welfare and Texas disability services have a question to distinguish offices within the same topic. [Minnesota child welfare offices](https://mn.gov/oofy/complaint/other-offices.jsp), [Texas IDD Ombudsman](https://www.hhs.texas.gov/contact/complaints-appeals/hhs-office-ombudsman/idd-ombudsman), [Oregon ombudsman offices](https://www.oregon.gov/gov/Pages/Ombudsman.aspx) |
| Public resources | Every supported jurisdiction has a published resource for Medicaid, disability advocacy, child welfare, public education, corrections, and state government when Ombus lacks an office match. The resource shows the jurisdiction’s listing or the published agency contact. [Medicaid contacts](https://www.medicaid.gov/about-us/where-can-people-get-help-medicaid-chip), [Disability advocacy network](https://www.ndrn.org/about/ndrn-member-agencies/), [Child welfare office index](https://www.michigan.gov/oca/continuing-education/ombudsman-reference-list), [Education contacts](https://www.ed.gov/about/contact-us/state-contacts), [Corrections departments](https://www.usa.gov/state-corrections), [State governments](https://www.usa.gov/state-governments) |

### How the routing and outputs work

| Stage | Where it lives | Shared behavior |
| --- | --- | --- |
| Identify the program | [`config/routing.json`](config/routing.json), [`internal/intake/routing.go`](internal/intake/routing.go) | Match the selected jurisdiction and topic, then apply a scope question where configured. Direct office rules take precedence over program directories. Verified county codes can narrow a directory result. |
| Resolve public contact and instructions | [`config/resources.json`](config/resources.json), [`internal/intake/destination.go`](internal/intake/destination.go) | Return a single next step with the correct contact type, name, published URL, and source. Public resources carry the publisher and a review date and leave the case in staff review. Contact links carry only location or program selectors from the registry. |
| Prepare outputs | [`config/handoffs.json`](config/handoffs.json), [`internal/intake/handoff.go`](internal/intake/handoff.go) | Use the office’s versioned contract for field mappings, required information, and documents. Supported summary workflows produce a message draft using the contract’s allowed values. Direct public referrals get a generic contact inquiry using the jurisdiction and topic. Directory and staff-review routes keep the output to instructions. |
| Verify coverage | [`internal/intake/coverage.go`](internal/intake/coverage.go), [State-by-state report](docs/routing-coverage.md) | Show the available route for each jurisdiction and shared topic. The JSON output includes jurisdiction-specific topics, scope answers, and the resolved contact metadata. |

Run `go run ./cmd/ombus -coverage=json` for the current catalog or `go run ./cmd/ombus -coverage=markdown > docs/routing-coverage.md` to regenerate the table. A running workspace also exposes `GET /api/routing/coverage`. These reports use configuration only.

### Add or update coverage

1. Identify the program from a government agency or the designated program’s own published instructions. Record the jurisdiction, what it covers, exceptions, and the public intake link. Use the state whose services, facility, plan, or agency the concern involves when the reporter is elsewhere. If two offices might apply, collect the detail that distinguishes them or send the intake to staff review.
2. Reuse a topic in `config/routing.json` when possible. Add the jurisdiction, stable office ID, label, source URL, and matched topics to `referrals`. Use `sinceVersion` for routes introduced with the current form version. A program can narrow its topic wording and declare follow-up `fields`. Set the topic mapping’s `topic` value to select a branch of those fields. The server resolves the office and branch. Earlier intake versions retain their routing behavior for retries.
3. Use `directories` when an authoritative directory covers a program across jurisdictions. List only that program’s topics and the jurisdictions it covers. A direct office mapping takes precedence for its topic. For localized contacts, add a county set from `config/counties.json` and the program’s published county codes. A matching county takes precedence over the statewide destination. [Census California county codes](https://tigerweb.geo.census.gov/tigerwebmain/Files/acs26/tigerweb_acs26_county_ca.html), [California program service areas](https://aging.ca.gov/Providers_and_Partners/Long-Term_Care_Ombudsman/Providers_List/)
4. For overlapping offices, add a `clarifications` entry for the jurisdiction and topic. Each answer points to the primary topic, a route marked `followUpOnly`, or staff review. Include a staff review answer for overlap or uncertainty. Keep office names out of the answer choices and ask about a fact that determines which office can help.
5. Add eligibility or ambiguity rules in `config/intake.json`. For office-specific packets, add versioned mappings in `config/handoffs.json`, with specific rules before the fallback. The Minnesota and Wisconsin profiles in `config/states.json` show how to define more involved workflows. Keep old output contract versions available for existing case records.
6. Use the coverage report to find resource-only entries and confirm whether a specialized office exists before adding a direct route. For a public resource, use the locator’s published jurisdiction link or the responsible agency’s own page and record its publisher, source and review date. Then test the match, staff review fallback and any county or program boundary, and regenerate the coverage report.

A submission creates a local Ombus receipt. The user can continue through the program’s published contact channel, and staff can use an office-specific output preview where one is configured. Direct agency submission requires an approved delivery integration, a way to record disclosure authorization, and separate tracking for the agency’s acknowledgement.

## Verify

```sh
npm run typecheck
npm test
go test ./...
```

### Pre-commit checks

With the project dependencies installed (`npm ci`), install Python 3 and `pre-commit`, then enable and run the hooks from the repository root.

```sh
pre-commit install --install-hooks
pre-commit run --all-files
```

Commits check staged files for formatting, merge conflict markers, invalid data files, and potential secrets. Changes to Go or TypeScript inputs also trigger `go vet` or the TypeScript type checker. If a formatter rewrites a file, review and stage the changes before retrying the commit.
