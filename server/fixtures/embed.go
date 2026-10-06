package fixtures

import "embed"

//go:embed depots.json routes/*.json
var FS embed.FS
