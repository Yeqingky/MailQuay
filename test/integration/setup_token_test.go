//go:build integration

package integration

import (
	"context"
	"errors"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mailquay/mailquay/internal/app"
	"github.com/mailquay/mailquay/internal/config"
	"github.com/mailquay/mailquay/internal/store"
)

func TestSetupRemovesGeneratedTokenFile(t *testing.T) {
	dsn := os.Getenv("MAILQUAY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("MAILQUAY_TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	resetSchema(t, ctx, dsn)
	if err := store.Migrate(ctx, dsn); err != nil {
		t.Fatal(err)
	}
	dataDir := filepath.Join(t.TempDir(), "data")
	cfg := &config.Config{
		DatabaseURL: dsn, DataDir: dataDir, SearchPath: filepath.Join(dataDir, "search"),
		SecretKey: mustKey(t), ListenAddr: ":0",
	}
	application, err := app.New(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer application.Close()
	server := httptest.NewServer(application.Handler())
	defer server.Close()

	tokenFile := config.SetupTokenPath(dataDir)
	raw, err := os.ReadFile(tokenFile)
	if err != nil {
		t.Fatalf("generated setup token file: %v", err)
	}
	token := strings.TrimSpace(string(raw))
	if len(token) < 16 {
		t.Fatalf("generated setup token = %q", token)
	}

	resp := postJSON(t, server.Client(), server.URL+"/api/v1/auth/setup", map[string]any{
		"token": token, "username": "owner", "password": "supersecret1",
	}, "")
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status %d", resp.StatusCode)
	}
	resp.Body.Close()
	if _, err := os.Stat(tokenFile); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("setup token file still present after setup: %v", err)
	}
}
