package store

import "testing"

func TestMigrateURL(t *testing.T) {
	tests := map[string]string{
		"postgres://u:p@localhost:5432/db?sslmode=disable": "pgx5://u:p@localhost:5432/db?sslmode=disable",
		"pgx5://u:p@localhost/db":                          "pgx5://u:p@localhost/db",
	}
	for in, want := range tests {
		if got := migrateURL(in); got != want {
			t.Errorf("migrateURL(%q) = %q, want %q", in, got, want)
		}
	}
}
