package auth

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

var defaultExemptSuffixes = []string{".localhost", ".local", ".lan", ".internal", ".home.arpa"}

var defaultExemptPrefixes = []netip.Prefix{
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("fe80::/10"),
}

// RequestScheme returns the effective scheme, trusting X-Forwarded-Proto only
// when the direct peer is a configured proxy.
func RequestScheme(r *http.Request, trustedProxies []string) string {
	if r.TLS != nil {
		return "https"
	}
	peer, err := netip.ParseAddr(hostOnly(r.RemoteAddr))
	if err == nil && peer.IsValid() && peerTrusted(peer, trustedProxies) {
		if proto := strings.ToLower(strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0])); proto == "https" || proto == "http" {
			return proto
		}
	}
	return "http"
}

// InsecureTransport reports whether the browser should see the permanent warning.
func InsecureTransport(r *http.Request, trustedProxies, insecureAllow []string) bool {
	if RequestScheme(r, trustedProxies) == "https" {
		return false
	}
	return !HostExempt(hostOnly(r.Host), insecureAllow)
}

// HostExempt reports whether a host is exempt from the HTTPS warning.
func HostExempt(host string, extra []string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	if host == "" {
		return false
	}
	if host == "localhost" {
		return true
	}
	for _, suffix := range defaultExemptSuffixes {
		if strings.HasSuffix(host, suffix) {
			return true
		}
	}
	if addr, err := netip.ParseAddr(host); err == nil {
		for _, prefix := range defaultExemptPrefixes {
			if prefix.Contains(addr) {
				return true
			}
		}
	}
	for _, entry := range extra {
		entry = strings.ToLower(strings.TrimSpace(entry))
		if entry == "" {
			continue
		}
		if strings.Contains(entry, "/") {
			if prefix, err := netip.ParsePrefix(entry); err == nil {
				if addr, err := netip.ParseAddr(host); err == nil && prefix.Contains(addr) {
					return true
				}
			}
			continue
		}
		if entry == host {
			return true
		}
		if strings.HasPrefix(entry, ".") && strings.HasSuffix(host, entry) {
			return true
		}
		if !strings.HasPrefix(entry, ".") && entry != "localhost" && strings.HasSuffix(host, "."+entry) {
			return true
		}
	}
	return false
}

func hostOnly(hostport string) string {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	return strings.Trim(host, "[]")
}

// ClientIP returns the client address for rate limiting. Behind a trusted proxy
// it walks X-Forwarded-For from the right and returns the first hop that is not
// itself a trusted proxy, so client-supplied entries on the left cannot spoof it.
func ClientIP(r *http.Request, trustedProxies []string) string {
	peer := hostOnly(r.RemoteAddr)
	addr, err := netip.ParseAddr(peer)
	if err != nil || !peerTrusted(addr, trustedProxies) {
		return peer
	}
	hops := forwardedHops(r)
	for i := len(hops) - 1; i >= 0; i-- {
		hop, err := netip.ParseAddr(hops[i])
		if err != nil {
			return peer
		}
		if peerTrusted(hop, trustedProxies) {
			continue
		}
		return hop.String()
	}
	return peer
}

func forwardedHops(r *http.Request) []string {
	var hops []string
	for _, header := range r.Header.Values("X-Forwarded-For") {
		for _, hop := range strings.Split(header, ",") {
			if hop = strings.TrimSpace(hop); hop != "" {
				hops = append(hops, hop)
			}
		}
	}
	return hops
}

func peerTrusted(addr netip.Addr, trustedProxies []string) bool {
	for _, raw := range trustedProxies {
		if prefix, err := netip.ParsePrefix(strings.TrimSpace(raw)); err == nil && prefix.Contains(addr) {
			return true
		}
	}
	return false
}
