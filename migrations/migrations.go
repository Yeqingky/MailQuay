package migrations

import "embed"

// FS contains the embedded PostgreSQL migrations.
//
//go:embed postgres/*.sql
var FS embed.FS
