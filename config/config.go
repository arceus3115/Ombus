package config

import _ "embed"

//go:embed intake.json
var Intake []byte

//go:embed handoffs.json
var Handoffs []byte
