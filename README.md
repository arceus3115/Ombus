# Ombus

Ombus is a local ombudsman intake workspace. It uses the location and topic of a concern to find a program, ask relevant follow-up questions, and save an intake for staff review.

## Run locally

Install Node.js 22.18 or later with npm, and Go 1.25 or later. From the Ombus repository root, install the frontend dependencies, build the frontend, and start the Go server.

```sh
npm ci
npm run build
go run ./cmd/ombus
```

Keep that terminal open and visit [New intake](http://127.0.0.1:8765/) or the [case queue](http://127.0.0.1:8765/cases). Press `Ctrl+C` to stop the server. Run `npm run build` again after changing the frontend. Restart the server after changing Go code or files under `config/`. If you change the shared intake fields or county list, rebuild the frontend and restart the server.

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

The browser sends versioned JSON to `POST /api/cases`. Go validates the active questions, removes answers from inactive branches, and saves the intake as pending staff review. Retrying an identical request returns the original record. `GET /api/cases` provides queue metadata, and `GET /api/cases/{id}` returns the saved record and its handoff preview.

## Nationwide routing

In **New intake**, choose where the issue happened and what it concerns. The portal shows only the follow-up questions for that route. Review shows the destination, and the receipt offers a link to the program’s public contact instructions when there is a match. Unclear topics, unverified programs, and answers that put an intake outside the configured jurisdiction go to staff routing review.

| Coverage | Current behavior |
| --- | --- |
| Long-term care | All 50 states, Washington, DC, Puerto Rico, and Guam have a statewide program or state-filtered directory route. California also routes to county contacts using the selected county. [Federal program coverage](https://acl.gov/programs/Protecting-Rights-and-Preventing-Abuse/Long-term-Care-Ombudsman-Program), [State program directory](https://theconsumervoice.org/get-help/), [California county contacts](https://aging.ca.gov/Find_Services_in_My_County/) |
| Pilot workflows | Minnesota’s long-term care, mental health and developmental disabilities, and public managed care workflows and Wisconsin’s long-term care workflow retain their specific questions and versioned handoff previews. [Minnesota workflow research](docs/minnesota-ombudsman-workflows.md), [Wisconsin program guidance](https://boaltc.wi.gov/Pages/Ombudsman.aspx) |
| Specialized programs | The catalog includes verified public contact paths for selected state agency, managed care, foster care, K–12 education, and corrections programs in Alaska, California, Minnesota, Texas, and Washington. Each route carries its program’s published link. Other jurisdiction and topic combinations enter staff routing review. |

### Add or update coverage

1. Identify the program from a government agency or the designated program’s own published instructions. Record the jurisdiction, what it covers, exceptions, and the public intake link. Use the state whose services, facility, plan, or agency the concern involves when the reporter is elsewhere. If two offices might apply, collect the detail that distinguishes them or send the intake to staff review.
2. Reuse a topic in `config/routing.json` when possible. Add the jurisdiction, stable office ID, label, source URL, and matched topics to `referrals`. A program can narrow its topic wording and declare follow-up `fields`. To select an existing branch of those fields, set the topic mapping’s `topic` value. The server derives the office and branch for v2 submissions. Existing v1 cases keep their saved workflow.
3. For location-specific long-term care, use `longTermCareByCounty` with a county set from `config/counties.json` and verified codes from the state program. A matching county takes precedence over the statewide route. Areas with service boundaries finer than county need an additional verified location criterion or a statewide contact path. [Census California county codes](https://tigerweb.geo.census.gov/tigerwebmain/Files/acs26/tigerweb_acs26_county_ca.html), [California program service areas](https://aging.ca.gov/Providers_and_Partners/Long-Term_Care_Ombudsman/Providers_List/)
4. Add eligibility or ambiguity rules in `config/intake.json`. For office-specific packets, add versioned mappings in `config/handoffs.json`, with specific rules before the fallback. The Minnesota and Wisconsin profiles in `config/states.json` show how to define more involved workflows. Keep old output contract versions available for existing case records.
5. Verify a case that should match, one that should go to staff review, and any county or program boundary. Run the verification commands after changes to the registry. Review published contacts periodically so links and jurisdiction rules stay current.

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
