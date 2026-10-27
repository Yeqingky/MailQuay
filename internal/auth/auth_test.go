package auth

import (
	"net/http/httptest"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("correct horse battery", hash) {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword("wrong password", hash) {
		t.Fatal("wrong password verified")
	}
	if _, err := HashPassword("short"); err == nil {
		t.Fatal("expected short password rejection")
	}
}

func TestHostExempt(t *testing.T) {
	cases := []struct {
		host  string
		extra []string
		want  bool
	}{
		{"localhost", nil, true},
		{"mail.localhost", nil, true},
		{"app.lan", nil, true},
		{"box.home.arpa", nil, true},
		{"127.0.0.1", nil, true},
		{"10.1.2.3", nil, true},
		{"172.20.0.4", nil, true},
		{"192.168.1.7", nil, true},
		{"169.254.1.1", nil, true},
		{"::1", nil, true},
		{"fd00::5", nil, true},
		{"8.8.8.8", nil, false},
		{"mail.example.com", nil, false},
		{"mail.example.com", []string{".example.com"}, true},
		{"example.com", []string{"example.com"}, true},
		{"192.0.2.10", []string{"192.0.2.0/24"}, true},
		{"198.51.100.9", []string{"192.0.2.0/24"}, false},
	}
	for _, tc := range cases {
		if got := HostExempt(tc.host, tc.extra); got != tc.want {
			t.Errorf("HostExempt(%q, %v) = %v, want %v", tc.host, tc.extra, got, tc.want)
		}
	}
}

func TestValidCSRF(t *testing.T) {
	if !ValidCSRF("abc", "abc") {
		t.Fatal("matching tokens rejected")
	}
	if ValidCSRF("abc", "abd") || ValidCSRF("", "") || ValidCSRF("abc", "") {
		t.Fatal("mismatched tokens accepted")
	}
}

func TestInsecureTransport(t *testing.T) {
	allow := []string{"mail.example.net"}
	req := httptest.NewRequest("GET", "http://example.com/", nil)
	req.Host = "example.com"
	req.RemoteAddr = "203.0.113.5:1234"
	if !InsecureTransport(req, nil, allow) {
		t.Fatal("public HTTP host should warn")
	}
	req.Host = "mail.example.net"
	if InsecureTransport(req, nil, allow) {
		t.Fatal("explicitly allowed host should not warn")
	}
	req.Host = "example.com"
	req.Header.Set("X-Forwarded-Proto", "https")
	if !InsecureTransport(req, nil, allow) {
		t.Fatal("untrusted proxy header must be ignored")
	}
	if InsecureTransport(req, []string{"203.0.113.0/24"}, allow) {
		t.Fatal("trusted proxy HTTPS header should be honored")
	}
}

func TestClientIPUsesRightmostUntrustedHop(t *testing.T) {
	trusted := []string{"10.0.0.0/8"}
	cases := []struct {
		name string
		peer string
		xff  string
		want string
	}{
		{"direct peer", "203.0.113.5:1234", "198.51.100.7", "203.0.113.5"},
		{"trusted proxy", "10.0.0.9:443", "198.51.100.7", "198.51.100.7"},
		{"spoofed leftmost entry", "10.0.0.9:443", "1.2.3.4, 198.51.100.7", "198.51.100.7"},
		{"trusted hops skipped", "10.0.0.9:443", "1.2.3.4, 10.0.0.7", "1.2.3.4"},
		{"no header", "10.0.0.9:443", "", "10.0.0.9"},
		{"malformed hop", "10.0.0.9:443", "1.2.3.4, unknown", "10.0.0.9"},
	}
	for _, tc := range cases {
		req := httptest.NewRequest("POST", "http://example.com/api/v1/auth/login", nil)
		req.RemoteAddr = tc.peer
		if tc.xff != "" {
			req.Header.Set("X-Forwarded-For", tc.xff)
		}
		if got := ClientIP(req, trusted); got != tc.want {
			t.Errorf("%s: ClientIP = %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestLimiterDropsIdleKeys(t *testing.T) {
	l := newLimiter(10, 20*time.Millisecond)
	for i := 0; i < 100; i++ {
		l.Allow("ip-" + strconv.Itoa(i))
	}
	if len(l.attempts) != 100 {
		t.Fatalf("tracked keys = %d, want 100", len(l.attempts))
	}
	time.Sleep(30 * time.Millisecond)
	l.Allow("fresh")
	if len(l.attempts) != 1 {
		t.Fatalf("idle keys were not evicted: %d keys remain", len(l.attempts))
	}
}

func TestLimiterRejectsNewKeysAtCapacity(t *testing.T) {
	l := newLimiter(10, time.Hour)
	for i := 0; i < limiterMaxKeys+50; i++ {
		l.Allow("ip-" + strconv.Itoa(i))
	}
	if len(l.attempts) != limiterMaxKeys {
		t.Fatalf("tracked keys = %d, want %d", len(l.attempts), limiterMaxKeys)
	}
	if l.Allow("ip-new") {
		t.Fatal("new key accepted while the map is at capacity")
	}
	if !l.Allow("ip-0") {
		t.Fatal("known key rejected while the map is at capacity")
	}
}

func TestSetupTokenSurvivesFailedAttempts(t *testing.T) {
	svc := &Service{setupToken: "one-time"}
	if svc.validSetupToken("wrong") {
		t.Fatal("wrong token accepted")
	}
	if svc.validSetupToken("") {
		t.Fatal("empty token accepted")
	}
	if !svc.validSetupToken("one-time") {
		t.Fatal("valid token rejected")
	}
	if !svc.validSetupToken("one-time") {
		t.Fatal("failed attempt consumed the token")
	}
	svc.invalidateSetupToken()
	if svc.validSetupToken("one-time") {
		t.Fatal("invalidated token still accepted")
	}
}

func TestSetupTokenConcurrentValidation(t *testing.T) {
	svc := &Service{setupToken: "one-time"}
	svc.invalidateSetupToken()
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if svc.validSetupToken("one-time") {
				accepted.Add(1)
			}
		}()
	}
	wg.Wait()
	if accepted.Load() != 0 {
		t.Fatalf("invalidated token accepted %d times", accepted.Load())
	}
}
