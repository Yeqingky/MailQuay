package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	dsn := strings.TrimSpace(os.Getenv("MAILQUAY_TEST_DATABASE_URL"))
	if dsn == "" {
		return fmt.Errorf("MAILQUAY_TEST_DATABASE_URL is required")
	}
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("parse database URL: %w", err)
	}
	name := strings.ToLower(cfg.Database)
	if !strings.Contains(name, "test") && !strings.Contains(name, "e2e") {
		return fmt.Errorf(
			"refusing to reset database %q: name must contain \"test\" or \"e2e\"",
			cfg.Database,
		)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`); err != nil {
		return fmt.Errorf("reset schema: %w", err)
	}
	fmt.Printf("reset schema in %s\n", cfg.Database)
	return nil
}
