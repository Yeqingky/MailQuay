// Package discovery finds likely IMAP, POP3 and SMTP settings for an email
// domain.
//
// The lookup runs in this order:
//  1. a built-in provider registry for well-known public mail domains
//  2. MX records that identify a hosted mail platform
//  3. the autodiscover and autoconfig HTTPS endpoints published by the domain
//
// Every network step has its own deadline. The returned settings are only
// suggestions; the caller still validates and saves the account explicitly.
package discovery

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/mail"
	"net/netip"
	"strings"
	"time"
)

// Endpoint is one server address with its transport security.
type Endpoint struct {
	Addr     string
	Security string
}

// Result is the best-effort configuration for a domain.
type Result struct {
	Domain          string
	Provider        string
	Source          string
	OAuthProvider   string
	ReceiveProtocol string
	IMAP            *Endpoint
	POP3            *Endpoint
	SMTP            *Endpoint
}

const (
	// SourceRegistry means the domain matched the built-in provider table.
	SourceRegistry = "registry"
	// SourceDomain means MX records identified the mail platform.
	SourceDomain = "domain"
	// SourceAutodiscover means the domain published autodiscover settings.
	SourceAutodiscover = "autodiscover"
	// SourceAutoconfig means the domain published autoconfig settings.
	SourceAutoconfig = "autoconfig"
	// SourceNone means no settings could be inferred.
	SourceNone = "none"

	securityImplicitTLS = "implicit_tls"
	securitySTARTTLS    = "starttls"

	maxBody    = 1 << 20
	mxBudget   = 3 * time.Second
	httpBudget = 5 * time.Second
	userAgent  = "MailQuay autodiscovery"
)

type preset struct {
	provider string
	oauth    string
	imap     Endpoint
	pop3     Endpoint
	smtp     Endpoint
}

func ep(addr, security string) Endpoint { return Endpoint{Addr: addr, Security: security} }

var registry = map[string]preset{
	"gmail.com": {
		provider: "gmail", oauth: "google",
		imap: ep("imap.gmail.com:993", securityImplicitTLS),
		pop3: ep("pop.gmail.com:995", securityImplicitTLS),
		smtp: ep("smtp.gmail.com:465", securityImplicitTLS),
	},
	"googlemail.com": {
		provider: "gmail", oauth: "google",
		imap: ep("imap.gmail.com:993", securityImplicitTLS),
		pop3: ep("pop.gmail.com:995", securityImplicitTLS),
		smtp: ep("smtp.gmail.com:465", securityImplicitTLS),
	},
	"outlook.com": {
		provider: "outlook", oauth: "microsoft",
		imap: ep("outlook.office365.com:993", securityImplicitTLS),
		pop3: ep("outlook.office365.com:995", securityImplicitTLS),
		smtp: ep("smtp.office365.com:587", securitySTARTTLS),
	},
	"hotmail.com": {
		provider: "outlook", oauth: "microsoft",
		imap: ep("outlook.office365.com:993", securityImplicitTLS),
		pop3: ep("outlook.office365.com:995", securityImplicitTLS),
		smtp: ep("smtp.office365.com:587", securitySTARTTLS),
	},
	"live.com": {
		provider: "outlook", oauth: "microsoft",
		imap: ep("outlook.office365.com:993", securityImplicitTLS),
		pop3: ep("outlook.office365.com:995", securityImplicitTLS),
		smtp: ep("smtp.office365.com:587", securitySTARTTLS),
	},
	"live.cn": {
		provider: "outlook", oauth: "microsoft",
		imap: ep("outlook.office365.com:993", securityImplicitTLS),
		pop3: ep("outlook.office365.com:995", securityImplicitTLS),
		smtp: ep("smtp.office365.com:587", securitySTARTTLS),
	},
	"msn.com": {
		provider: "outlook", oauth: "microsoft",
		imap: ep("outlook.office365.com:993", securityImplicitTLS),
		pop3: ep("outlook.office365.com:995", securityImplicitTLS),
		smtp: ep("smtp.office365.com:587", securitySTARTTLS),
	},
	"icloud.com": {
		provider: "icloud",
		imap:     ep("imap.mail.me.com:993", securityImplicitTLS),
		pop3:     ep("pop.mail.me.com:995", securityImplicitTLS),
		smtp:     ep("smtp.mail.me.com:587", securitySTARTTLS),
	},
	"me.com": {
		provider: "icloud",
		imap:     ep("imap.mail.me.com:993", securityImplicitTLS),
		pop3:     ep("pop.mail.me.com:995", securityImplicitTLS),
		smtp:     ep("smtp.mail.me.com:587", securitySTARTTLS),
	},
	"mac.com": {
		provider: "icloud",
		imap:     ep("imap.mail.me.com:993", securityImplicitTLS),
		pop3:     ep("pop.mail.me.com:995", securityImplicitTLS),
		smtp:     ep("smtp.mail.me.com:587", securitySTARTTLS),
	},
	"yahoo.com": {
		provider: "yahoo",
		imap:     ep("imap.mail.yahoo.com:993", securityImplicitTLS),
		pop3:     ep("pop.mail.yahoo.com:995", securityImplicitTLS),
		smtp:     ep("smtp.mail.yahoo.com:465", securityImplicitTLS),
	},
	"qq.com": {
		provider: "qq",
		imap:     ep("imap.qq.com:993", securityImplicitTLS),
		pop3:     ep("pop.qq.com:995", securityImplicitTLS),
		smtp:     ep("smtp.qq.com:465", securityImplicitTLS),
	},
	"foxmail.com": {
		provider: "qq",
		imap:     ep("imap.qq.com:993", securityImplicitTLS),
		pop3:     ep("pop.qq.com:995", securityImplicitTLS),
		smtp:     ep("smtp.qq.com:465", securityImplicitTLS),
	},
	"163.com": {
		provider: "netease",
		imap:     ep("imap.163.com:993", securityImplicitTLS),
		pop3:     ep("pop.163.com:995", securityImplicitTLS),
		smtp:     ep("smtp.163.com:465", securityImplicitTLS),
	},
	"126.com": {
		provider: "netease",
		imap:     ep("imap.126.com:993", securityImplicitTLS),
		pop3:     ep("pop.126.com:995", securityImplicitTLS),
		smtp:     ep("smtp.126.com:465", securityImplicitTLS),
	},
	"yeah.net": {
		provider: "netease",
		imap:     ep("imap.yeah.net:993", securityImplicitTLS),
		pop3:     ep("pop.yeah.net:995", securityImplicitTLS),
		smtp:     ep("smtp.yeah.net:465", securityImplicitTLS),
	},
	"aliyun.com": {
		provider: "aliyun",
		imap:     ep("imap.aliyun.com:993", securityImplicitTLS),
		pop3:     ep("pop3.aliyun.com:995", securityImplicitTLS),
		smtp:     ep("smtp.aliyun.com:465", securityImplicitTLS),
	},
	"gmx.com": {
		provider: "gmx",
		imap:     ep("imap.gmx.com:993", securityImplicitTLS),
		pop3:     ep("pop.gmx.com:995", securityImplicitTLS),
		smtp:     ep("smtp.gmx.com:587", securitySTARTTLS),
	},
	"gmx.net": {
		provider: "gmx",
		imap:     ep("imap.gmx.net:993", securityImplicitTLS),
		pop3:     ep("pop.gmx.net:995", securityImplicitTLS),
		smtp:     ep("smtp.gmx.net:587", securitySTARTTLS),
	},
	"zoho.com": {
		provider: "zoho",
		imap:     ep("imap.zoho.com:993", securityImplicitTLS),
		pop3:     ep("pop.zoho.com:995", securityImplicitTLS),
		smtp:     ep("smtp.zoho.com:465", securityImplicitTLS),
	},
	"yandex.com": {
		provider: "yandex",
		imap:     ep("imap.yandex.com:993", securityImplicitTLS),
		pop3:     ep("pop.yandex.com:995", securityImplicitTLS),
		smtp:     ep("smtp.yandex.com:465", securityImplicitTLS),
	},
}

// Discover resolves likely connection settings for the email address.
//
// ErrInvalidEmail is returned when the address has no usable domain.
var ErrInvalidEmail = errors.New("invalid email address")

func Discover(ctx context.Context, address string) (Result, error) {
	parsed, err := mail.ParseAddress(strings.TrimSpace(address))
	if err != nil {
		return Result{}, ErrInvalidEmail
	}
	at := strings.LastIndex(parsed.Address, "@")
	if at < 1 || at == len(parsed.Address)-1 {
		return Result{}, ErrInvalidEmail
	}
	domain := strings.ToLower(strings.TrimSuffix(parsed.Address[at+1:], "."))
	if !validDomain(domain) {
		return Result{}, ErrInvalidEmail
	}

	result := Result{Domain: domain, Provider: "custom", Source: SourceNone, ReceiveProtocol: "imap"}

	if preset, ok := registry[domain]; ok {
		applyPreset(&result, preset)
		result.Source = SourceRegistry
		return result, nil
	}

	mxLookup, cancelMX := context.WithTimeout(ctx, mxBudget)
	oauth, provider := mxPlatform(mxLookup, domain)
	cancelMX()
	if oauth != "" {
		applyPreset(&result, platformPreset(oauth, provider))
		result.Source = SourceDomain
		return result, nil
	}

	type published struct {
		source   string
		endpoint endpoints
		ok       bool
	}

	lookup, cancel := context.WithTimeout(ctx, httpBudget)
	defer cancel()
	results := make(chan published, 2)
	go func() {
		found, ok := autodiscover(lookup, domain, parsed.Address)
		results <- published{source: SourceAutodiscover, endpoint: found, ok: ok}
	}()
	go func() {
		found, ok := autoconfig(lookup, domain)
		results <- published{source: SourceAutoconfig, endpoint: found, ok: ok}
	}()

	var autoconfigResult published
	for range 2 {
		entry := <-results
		if !entry.ok {
			continue
		}
		if entry.source == SourceAutodiscover {
			applyEndpoints(&result, entry.endpoint)
			result.Source = SourceAutodiscover
			return result, nil
		}
		autoconfigResult = entry
	}
	if autoconfigResult.ok {
		applyEndpoints(&result, autoconfigResult.endpoint)
		result.Source = SourceAutoconfig
	}
	return result, nil
}

func applyPreset(result *Result, preset preset) {
	result.Provider = preset.provider
	result.OAuthProvider = preset.oauth
	imap, pop3, smtp := preset.imap, preset.pop3, preset.smtp
	result.IMAP = &imap
	result.POP3 = &pop3
	result.SMTP = &smtp
}

func platformPreset(oauth, provider string) preset {
	switch oauth {
	case "microsoft":
		return preset{
			provider: provider, oauth: "microsoft",
			imap: ep("outlook.office365.com:993", securityImplicitTLS),
			pop3: ep("outlook.office365.com:995", securityImplicitTLS),
			smtp: ep("smtp.office365.com:587", securitySTARTTLS),
		}
	default:
		return preset{
			provider: provider, oauth: "google",
			imap: ep("imap.gmail.com:993", securityImplicitTLS),
			pop3: ep("pop.gmail.com:995", securityImplicitTLS),
			smtp: ep("smtp.gmail.com:465", securityImplicitTLS),
		}
	}
}

type endpoints struct {
	imap *Endpoint
	pop3 *Endpoint
	smtp *Endpoint
}

func applyEndpoints(result *Result, found endpoints) {
	result.IMAP = found.imap
	result.POP3 = found.pop3
	result.SMTP = found.smtp
	if found.imap == nil && found.pop3 != nil {
		result.ReceiveProtocol = "pop3"
	}
	switch {
	case found.imap != nil && strings.HasSuffix(found.imap.Addr, "office365.com:993"):
		result.OAuthProvider = "microsoft"
	case found.smtp != nil && strings.HasSuffix(found.smtp.Addr, "office365.com:587"):
		result.OAuthProvider = "microsoft"
	case found.imap != nil && strings.HasSuffix(found.imap.Addr, "gmail.com:993"):
		result.OAuthProvider = "google"
	case found.smtp != nil && strings.HasSuffix(found.smtp.Addr, "gmail.com:465"):
		result.OAuthProvider = "google"
	}
	if found.imap != nil {
		result.Provider = providerFromHost(found.imap.Addr)
	} else if found.smtp != nil {
		result.Provider = providerFromHost(found.smtp.Addr)
	}
}

func providerFromHost(addr string) string {
	host := addr
	if idx := strings.LastIndex(addr, ":"); idx >= 0 {
		host = addr[:idx]
	}
	switch host {
	case "outlook.office365.com", "smtp.office365.com":
		return "outlook"
	case "imap.gmail.com", "smtp.gmail.com":
		return "gmail"
	}
	return "custom"
}

func mxPlatform(ctx context.Context, domain string) (oauth, provider string) {
	records, err := net.DefaultResolver.LookupMX(ctx, domain)
	if err != nil {
		return "", ""
	}
	for _, record := range records {
		host := strings.ToLower(strings.TrimSuffix(record.Host, "."))
		switch {
		case hostMatches(host, "mail.protection.outlook.com", "outlook.office365.com"):
			return "microsoft", "outlook"
		case hostMatches(host, "google.com", "googlemail.com"):
			return "google", "gmail"
		}
	}
	return "", ""
}

func hostMatches(host string, suffixes ...string) bool {
	for _, suffix := range suffixes {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}

func validDomain(domain string) bool {
	if len(domain) == 0 || len(domain) > 253 {
		return false
	}
	if net.ParseIP(domain) != nil {
		return false
	}
	for _, label := range strings.Split(domain, ".") {
		if label == "" || len(label) > 63 {
			return false
		}
		if strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return false
		}
		for _, r := range label {
			if !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9') && r != '-' {
				return false
			}
		}
	}
	return strings.Contains(domain, ".")
}

type autodiscoverProtocol struct {
	Type   string `xml:"Type"`
	Server string `xml:"Server"`
	Port   int    `xml:"Port"`
	SSL    string `xml:"SSL"`
}

type autodiscoverEnvelope struct {
	Response struct {
		Account struct {
			Protocols []autodiscoverProtocol `xml:"Protocol"`
		} `xml:"Account"`
	} `xml:"Response"`
}

const autodiscoverRequest = `<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">
  <Request>
    <EMailAddress>%s</EMailAddress>
    <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>
  </Request>
</Autodiscover>`

func autodiscover(ctx context.Context, domain, address string) (endpoints, bool) {
	requestBody := fmt.Sprintf(autodiscoverRequest, xmlEscape(address))
	for _, url := range []string{
		"https://autodiscover." + domain + "/autodiscover/autodiscover.xml",
		"https://" + domain + "/autodiscover/autodiscover.xml",
	} {
		reqCtx, cancel := context.WithTimeout(ctx, httpBudget)
		req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, url, bytes.NewReader([]byte(requestBody)))
		if err != nil {
			cancel()
			continue
		}
		req.Header.Set("Content-Type", "text/xml; charset=utf-8")
		req.Header.Set("User-Agent", userAgent)
		resp, err := httpClient().Do(req)
		if err != nil {
			cancel()
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxBody))
		resp.Body.Close()
		cancel()
		if readErr != nil || resp.StatusCode != http.StatusOK {
			continue
		}
		var envelope autodiscoverEnvelope
		if err := xml.Unmarshal(body, &envelope); err != nil {
			continue
		}
		found := endpoints{}
		for _, protocol := range envelope.Response.Account.Protocols {
			endpoint, ok := protocolEndpoint(protocol.Server, protocol.Port, protocol.SSL == "on")
			if !ok {
				continue
			}
			switch strings.ToUpper(protocol.Type) {
			case "IMAP":
				found.imap = &endpoint
			case "POP3":
				found.pop3 = &endpoint
			case "SMTP":
				found.smtp = &endpoint
			}
		}
		if found.imap != nil || found.smtp != nil {
			return found, true
		}
	}
	return endpoints{}, false
}

type autoconfigServer struct {
	Type       string `xml:"type,attr"`
	Hostname   string `xml:"hostname"`
	Port       int    `xml:"port"`
	SocketType string `xml:"socketType"`
}

type autoconfigEnvelope struct {
	Provider struct {
		Incoming []autoconfigServer `xml:"incomingServer"`
		Outgoing []autoconfigServer `xml:"outgoingServer"`
	} `xml:"emailProvider"`
}

func autoconfig(ctx context.Context, domain string) (endpoints, bool) {
	for _, url := range []string{
		"https://autoconfig." + domain + "/mail/config-v1.1.xml",
		"https://" + domain + "/.well-known/autoconfig/mail/config-v1.1.xml",
	} {
		reqCtx, cancel := context.WithTimeout(ctx, httpBudget)
		req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
		if err != nil {
			cancel()
			continue
		}
		req.Header.Set("User-Agent", userAgent)
		resp, err := httpClient().Do(req)
		if err != nil {
			cancel()
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxBody))
		resp.Body.Close()
		cancel()
		if readErr != nil || resp.StatusCode != http.StatusOK {
			continue
		}
		var envelope autoconfigEnvelope
		if err := xml.Unmarshal(body, &envelope); err != nil {
			continue
		}
		found := endpoints{}
		for _, server := range append(append([]autoconfigServer{}, envelope.Provider.Incoming...), envelope.Provider.Outgoing...) {
			security := securityFromSocketType(server.SocketType)
			endpoint, ok := protocolEndpoint(server.Hostname, server.Port, security == securityImplicitTLS)
			if !ok {
				continue
			}
			endpoint.Security = security
			switch strings.ToLower(server.Type) {
			case "imap":
				found.imap = &endpoint
			case "pop3":
				found.pop3 = &endpoint
			case "smtp":
				found.smtp = &endpoint
			}
		}
		if found.imap != nil || found.smtp != nil {
			return found, true
		}
	}
	return endpoints{}, false
}

// securityFromSocketType maps a provider hint to a transport. Plaintext is
// never accepted from remote XML: a malicious autoconfig must not be able to
// downgrade stored credentials to an unencrypted session.
func securityFromSocketType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "ssl", "ssl/tls", "tls":
		return securityImplicitTLS
	default:
		return securitySTARTTLS
	}
}

func protocolEndpoint(host string, port int, implicitTLS bool) (Endpoint, bool) {
	host = strings.TrimSpace(strings.ToLower(host))
	if !validEndpointHost(host) || port < 1 || port > 65535 {
		return Endpoint{}, false
	}
	security := securitySTARTTLS
	if implicitTLS {
		security = securityImplicitTLS
	}
	return Endpoint{Addr: net.JoinHostPort(host, fmt.Sprintf("%d", port)), Security: security}, true
}

// validEndpointHost accepts a DNS name or an IP literal and rejects anything
// that could smuggle a path, credentials or extra whitespace into the address.
func validEndpointHost(host string) bool {
	if host == "" || len(host) > 253 {
		return false
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		return ip.IsValid()
	}
	if strings.HasPrefix(host, ".") || strings.HasSuffix(host, ".") || strings.HasPrefix(host, "-") {
		return false
	}
	for _, r := range host {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '.', r == '-', r == '_':
		default:
			return false
		}
	}
	return true
}

func httpClient() *http.Client {
	return &http.Client{
		Timeout:   httpBudget,
		Transport: &http.Transport{DialContext: publicDialContext, TLSHandshakeTimeout: httpBudget},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many redirects")
			}
			if req.URL.Scheme != "https" {
				return errors.New("redirect to insecure scheme")
			}
			return nil
		},
	}
}

// blockedPrefixes are special-purpose ranges that must never be reached from a
// domain-provided autodiscovery URL.
var blockedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("2001:db8::/32"),
}

// ErrBlockedPort is returned when autodiscovery tries to use a port other than
// the HTTPS default.
var ErrBlockedPort = errors.New("discovery: blocked port")

// publicDialContext resolves the target and dials only a public address, so a
// crafted autodiscovery response cannot make the server probe loopback,
// private, link-local or metadata endpoints.
func publicDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	// Autodiscovery endpoints are plain HTTPS on the default port; a redirect
	// to another port would only widen the SSRF surface.
	if port != "443" {
		return nil, fmt.Errorf("%w: %s", ErrBlockedPort, port)
	}
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	dialer := &net.Dialer{}
	var lastErr error
	for _, ip := range ips {
		if !publicAddr(ip) {
			lastErr = fmt.Errorf("discovery: blocked non-public address %s", ip)
			continue
		}
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = errors.New("discovery: no usable address")
	}
	return nil, lastErr
}

func publicAddr(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsValid() || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	for _, prefix := range blockedPrefixes {
		if prefix.Contains(ip) {
			return false
		}
	}
	return true
}

func xmlEscape(value string) string {
	var buffer bytes.Buffer
	_ = xml.EscapeText(&buffer, []byte(value))
	return buffer.String()
}
