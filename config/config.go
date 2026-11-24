package config

import _ "embed"

//go:embed intake.json
var Intake []byte

//go:embed counties.json
var Counties []byte

//go:embed states.json
var States []byte

//go:embed routing.json
var Routing []byte

//go:embed handoffs.json
var Handoffs []byte
