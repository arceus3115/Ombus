# Ombus

Ombus is a local ombudsman intake workspace. It includes Minnesota’s three pilot offices and an experimental Wisconsin long-term care route.

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

## Multi-state routing experiment

In **New intake**, choose Minnesota or Wisconsin, then select **Long-term care services or resident rights** under **Office Details**. The same topic selects each state’s long-term care office. Wisconsin asks about age band and care setting. Unsure or potentially out-of-scope answers route to staff review. On a saved case, inspect **Output schema** and download a preview containing the generated JSON Schema, mapped data, and missing information. [Minnesota workflow research](docs/minnesota-ombudsman-workflows.md), [Wisconsin program guidance](https://boaltc.wi.gov/Pages/Ombudsman.aspx)

| Configuration unit | What it controls |
| --- | --- |
| **State** | `config/states.json` defines participating offices, location questions, and the default time zone. `config/counties.json` provides reusable county lists by code. |
| **Office topic** | `routingHints` maps a topic within a state to an office and its initial issue type. `officeFields` supplies follow-up questions. `config/intake.json` contains shared questions and review flags. |
| **Output schema** | `config/handoffs.json` maps state, office, and issue to a versioned contract. It defines the channel, permitted fields, required alternatives, and documents to prepare. Put specific rules before an office’s fallback. Keep retired versions for saved cases and set `retired` to `true` when a version stops accepting new intakes. |

A submission here creates an Ombus receipt and staff review case. The output preview models what staff would prepare for the agency’s published channel. Public rollout would separate resident submission and status from restricted staff review, add an approved delivery integration per office, and track the agency’s acknowledgement separately from the Ombus receipt. [Wisconsin complaint channels](https://boaltc.wi.gov/Pages/Ombudsman/DisputeResolution.aspx), [Minnesota County ID Standard](https://mn.gov/mngeo/assets/MN_GAC_County_ID_Standard_tcm1235-754089.pdf)

## Verify

```sh
npm run typecheck
npm test
go test ./...
```
