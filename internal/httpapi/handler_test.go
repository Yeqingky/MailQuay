package httpapi

import (
	"errors"
	"io"
	"log/slog"
	"net/http/httptest"
	"testing"
)

func TestSafeMessageExposesOnlyTypedErrors(t *testing.T) {
	s := &Server{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	req := httptest.NewRequest("GET", "/api/v1/settings", nil)
	exposed := errors.New("typed failure")

	if got := s.safeMessage(req, exposed, "fallback", exposed); got != "typed failure" {
		t.Fatalf("typed message = %q", got)
	}
	if got := s.safeMessage(req, errors.New("load account: pq: relation missing"), "fallback", exposed); got != "fallback" {
		t.Fatalf("untyped message = %q, want fallback", got)
	}
	if got := s.safeMessage(req, errors.New("db exploded"), "fallback"); got != "fallback" {
		t.Fatalf("message without exposure = %q, want fallback", got)
	}
}
