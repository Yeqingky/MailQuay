package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mailquay/mailquay/internal/config"
)

func TestSecurityHeadersAllowSandboxedSrcdoc(t *testing.T) {
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	recorder := httptest.NewRecorder()
	server := &Server{cfg: &config.Config{}}
	server.securityHeaders(next).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	policy := recorder.Header().Get("Content-Security-Policy")
	for _, directive := range strings.Split(policy, ";") {
		fields := strings.Fields(directive)
		if len(fields) == 0 || fields[0] != "frame-src" {
			continue
		}
		for _, source := range fields[1:] {
			if source == "about:" {
				return
			}
		}
	}
	t.Fatalf("CSP frame-src must allow about: for sandboxed srcdoc mail frames, got %q", policy)
}

func TestSecurityHeadersHSTSAndFrameAncestors(t *testing.T) {
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	server := &Server{cfg: &config.Config{TrustedProxies: []string{"10.0.0.0/8"}}}

	plain := httptest.NewRecorder()
	httpReq := httptest.NewRequest(http.MethodGet, "http://example.com/", nil)
	httpReq.RemoteAddr = "203.0.113.5:1234"
	server.securityHeaders(next).ServeHTTP(plain, httpReq)
	if got := plain.Header().Get("Strict-Transport-Security"); got != "" {
		t.Errorf("HTTP response HSTS = %q, want empty", got)
	}
	if policy := plain.Header().Get("Content-Security-Policy"); !strings.Contains(policy, "frame-ancestors 'self'") {
		t.Errorf("CSP = %q, want frame-ancestors 'self'", policy)
	}

	secure := httptest.NewRecorder()
	proxied := httptest.NewRequest(http.MethodGet, "http://example.com/", nil)
	proxied.RemoteAddr = "10.0.0.9:443"
	proxied.Header.Set("X-Forwarded-Proto", "https")
	server.securityHeaders(next).ServeHTTP(secure, proxied)
	if got := secure.Header().Get("Strict-Transport-Security"); got != "max-age=31536000" {
		t.Errorf("HTTPS response HSTS = %q", got)
	}
}
