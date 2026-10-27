package discovery

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
	"time"
)

func TestDiscoverRegistry(t *testing.T) {
	result, err := Discover(t.Context(), "someone@gmail.com")
	if err != nil {
		t.Fatalf("discover: %v", err)
	}
	if result.Source != SourceRegistry || result.Provider != "gmail" || result.OAuthProvider != "google" {
		t.Fatalf("unexpected result: %+v", result)
	}
	if result.IMAP == nil || result.IMAP.Addr != "imap.gmail.com:993" || result.IMAP.Security != securityImplicitTLS {
		t.Fatalf("unexpected IMAP endpoint: %+v", result.IMAP)
	}
	if result.SMTP == nil || result.SMTP.Addr != "smtp.gmail.com:465" {
		t.Fatalf("unexpected SMTP endpoint: %+v", result.SMTP)
	}
	if result.ReceiveProtocol != "imap" {
		t.Fatalf("unexpected protocol: %q", result.ReceiveProtocol)
	}
}

func TestDiscoverInvalidEmail(t *testing.T) {
	for _, address := range []string{"", "not-an-email", "user@localhost", "user@127.0.0.1"} {
		if _, err := Discover(t.Context(), address); !errors.Is(err, ErrInvalidEmail) {
			t.Fatalf("expected ErrInvalidEmail for %q, got %v", address, err)
		}
	}
}

func TestDiscoverMicrosoftRegistry(t *testing.T) {
	result, err := Discover(t.Context(), "someone@outlook.com")
	if err != nil {
		t.Fatalf("discover: %v", err)
	}
	if result.OAuthProvider != "microsoft" || result.SMTP == nil || result.SMTP.Security != securitySTARTTLS {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestPublicAddrBlocksInternalRanges(t *testing.T) {
	cases := []struct {
		addr string
		want bool
	}{
		{"8.8.8.8", true},
		{"1.1.1.1", true},
		{"2606:4700:4700::1111", true},
		{"127.0.0.1", false},
		{"10.1.2.3", false},
		{"172.16.0.1", false},
		{"192.168.1.1", false},
		{"169.254.169.254", false},
		{"100.64.0.1", false},
		{"0.0.0.0", false},
		{"::1", false},
		{"fd00::1", false},
		{"fe80::1", false},
		{"192.0.2.10", false},
	}
	for _, tc := range cases {
		ip := netip.MustParseAddr(tc.addr)
		if got := publicAddr(ip); got != tc.want {
			t.Errorf("publicAddr(%s) = %v, want %v", tc.addr, got, tc.want)
		}
	}
}

func TestDiscoveryClientRefusesInternalHosts(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("autodiscovery reached a loopback server")
	}))
	defer server.Close()
	client := &http.Client{
		Timeout:   time.Second,
		Transport: &http.Transport{DialContext: publicDialContext},
	}
	if resp, err := client.Get(server.URL); err == nil {
		resp.Body.Close()
		t.Fatal("loopback request succeeded")
	}
}
