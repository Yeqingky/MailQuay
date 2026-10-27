//go:build integration

package integration

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/mailquay/mailquay/internal/app"
	"github.com/mailquay/mailquay/internal/config"
	"github.com/mailquay/mailquay/internal/store"
)

func TestLoginRateLimitIgnoresSpoofedForwardedFor(t *testing.T) {
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
		SecretKey: mustKey(t), ListenAddr: ":0", SetupToken: "setup-token",
		TrustedProxies: []string{"127.0.0.0/8"},
	}
	application, err := app.New(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer application.Close()
	server := httptest.NewServer(application.Handler())
	defer server.Close()
	base := server.URL + "/api/v1"

	resp := postJSON(t, server.Client(), base+"/auth/setup", map[string]any{
		"token": "setup-token", "username": "owner", "password": "supersecret1",
	}, "")
	if resp.StatusCode != 201 {
		t.Fatalf("setup status %d", resp.StatusCode)
	}
	resp.Body.Close()

	status := 0
	for i := range 11 {
		req, err := http.NewRequest(http.MethodPost, base+"/auth/login",
			bytes.NewReader([]byte(`{"username":"owner","password":"wrong"}`)))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-For", "198.51.100."+strconv.Itoa(i)+", 203.0.113.9")
		resp, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		status = resp.StatusCode
	}
	if status != http.StatusTooManyRequests {
		t.Fatalf("eleventh attempt status = %d, want 429", status)
	}
}
