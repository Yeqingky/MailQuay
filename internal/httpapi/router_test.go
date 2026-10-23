package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSecurityHeadersAllowSandboxedSrcdoc(t *testing.T) {
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	recorder := httptest.NewRecorder()
	securityHeaders(next).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

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
