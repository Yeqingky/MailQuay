//go:build integration

package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mailquay/mailquay/internal/app"
	"github.com/mailquay/mailquay/internal/auth"
	"github.com/mailquay/mailquay/internal/config"
	"github.com/mailquay/mailquay/internal/store"
)

func TestHTTPAuthAndAccountFlow(t *testing.T) {
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
		CORSOrigins: []string{"https://app.example.com"},
	}
	application, err := app.New(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer application.Close()
	server := httptest.NewServer(application.Handler())
	defer server.Close()
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 10 * time.Second}
	base := server.URL + "/api/v1"

	status := getJSON(t, client, base+"/auth/me")
	if status["needsSetup"] != true {
		t.Fatalf("needsSetup = %v", status["needsSetup"])
	}
	// A rejected setup must keep the token usable and name the reason.
	weak := postJSON(t, client, base+"/auth/setup", map[string]any{
		"token": "setup-token", "username": "owner", "password": "short",
	}, "")
	var weakBody map[string]any
	if err := json.NewDecoder(weak.Body).Decode(&weakBody); err != nil {
		t.Fatal(err)
	}
	weak.Body.Close()
	if weak.StatusCode != http.StatusBadRequest {
		t.Fatalf("weak password setup status %d", weak.StatusCode)
	}
	weakDetail, _ := weakBody["error"].(map[string]any)
	if message, _ := weakDetail["message"].(string); !strings.Contains(message, "at least 8 characters") {
		t.Fatalf("weak password message = %q", message)
	}
	resp := postJSON(t, client, base+"/auth/setup", map[string]any{
		"token": "setup-token", "username": "owner", "password": "supersecret1",
	}, "")
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("setup status %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()
	// Setup is rate limited per IP so a weak configured token cannot be
	// brute-forced online.
	limited := false
	for range 12 {
		resp = postJSON(t, client, base+"/auth/setup", map[string]any{
			"token": "wrong-token", "username": "intruder", "password": "supersecret1",
		}, "")
		status := resp.StatusCode
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if status == http.StatusTooManyRequests {
			limited = true
			break
		}
		if status != http.StatusBadRequest && status != http.StatusConflict {
			t.Fatalf("setup attempt status %d: %s", status, body)
		}
	}
	if !limited {
		t.Fatal("repeated setup attempts were never rate limited")
	}
	csrf := csrfFromJar(t, jar, server.URL)
	me := getJSON(t, client, base+"/auth/me")
	user, _ := me["user"].(map[string]any)
	if user == nil || user["username"] != "owner" {
		t.Fatalf("me = %+v", me)
	}
	// OAuth start must run inside an authenticated session; only the provider
	// callback is public.
	anonymous := &http.Client{Timeout: 10 * time.Second}
	startURL := base + "/oauth/google/start?accountId=11111111-1111-1111-1111-111111111111"
	resp, err = anonymous.Get(startURL)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous oauth start status = %d, want 401", resp.StatusCode)
	}
	noRedirect := &http.Client{
		Jar:     jar,
		Timeout: 10 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err = noRedirect.Get(startURL)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusFound {
		t.Fatalf("authenticated oauth start status = %d, want 302", resp.StatusCode)
	}
	resp, err = anonymous.Get(base + "/oauth/google/callback?code=code&state=state")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		t.Fatal("oauth callback must stay reachable without a session")
	}
	settings := getJSON(t, client, base+"/settings")
	if settings["sendRetryLimit"] != float64(3) {
		t.Fatalf("default retry limit = %v", settings["sendRetryLimit"])
	}
	if settings["removeReadImmediately"] != false || settings["prependNewMessages"] != true {
		t.Fatalf("list defaults = remove %v prepend %v", settings["removeReadImmediately"], settings["prependNewMessages"])
	}
	resp = sendJSON(t, client, http.MethodPatch, base+"/settings", map[string]any{
		"sendRetryLimit": 5, "language": "zh-CN",
		"removeReadImmediately": true, "prependNewMessages": false,
	}, csrf)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("settings patch %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()
	settings = getJSON(t, client, base+"/settings")
	if settings["sendRetryLimit"] != float64(5) || settings["language"] != "zh-CN" {
		t.Fatalf("settings not persisted: %+v", settings)
	}
	if settings["removeReadImmediately"] != true || settings["prependNewMessages"] != false {
		t.Fatalf("list settings not persisted: %+v", settings)
	}
	resp = sendJSON(t, client, http.MethodPatch, base+"/settings", map[string]any{
		"sessionTtlHours":     72,
		"syncIntervalSeconds": 120, "pop3IntervalSeconds": 90,
		"bodyPrefetchMaxBytes": 1048576, "maxAttachmentBytes": 10485760,
		"syncConcurrency": 3, "fetchConcurrency": 4,
		"googleClientId": "google-id", "googleClientSecret": "google-secret",
		"logLevel": "debug",
	}, csrf)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("server settings patch %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()
	settings = getJSON(t, client, base+"/settings")
	if settings["sessionTtlHours"] != float64(72) ||
		settings["logLevel"] != "debug" || settings["googleSecretSet"] != true {
		t.Fatalf("runtime settings not persisted: %+v", settings)
	}
	concurrency, _ := settings["concurrency"].(map[string]any)
	if concurrency["syncConcurrency"] != float64(3) || concurrency["fetchConcurrency"] != float64(4) {
		t.Fatalf("network concurrency not persisted: %+v", concurrency)
	}
	if _, ok := concurrency["searchConcurrency"]; !ok {
		t.Fatalf("local concurrency missing: %+v", concurrency)
	}
	resp = sendJSON(t, client, http.MethodPatch, base+"/settings", map[string]any{
		"searchConcurrency": 2, "indexBatchSize": 120, "autoLocalConcurrency": false,
	}, csrf)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("local concurrency patch %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()
	settings = getJSON(t, client, base+"/settings")
	if settings["autoLocalConcurrency"] != false || settings["searchConcurrency"] != float64(2) ||
		settings["indexBatchSize"] != float64(120) {
		t.Fatalf("local concurrency settings not persisted: %+v", settings)
	}
	concurrency, _ = settings["concurrency"].(map[string]any)
	if concurrency["searchConcurrency"] != float64(2) || concurrency["indexBatchSize"] != float64(120) {
		t.Fatalf("manual local pools not applied: %+v", concurrency)
	}
	oauth, _ := settings["oauth"].(map[string]any)
	_ = oauth
	loginResp := sendJSON(t, client, http.MethodPost, base+"/auth/login", map[string]any{
		"username": "owner", "password": "supersecret1",
	}, "")
	setCookie := strings.Join(loginResp.Header.Values("Set-Cookie"), "\n")
	loginResp.Body.Close()
	if !strings.Contains(setCookie, "SameSite=None") || !strings.Contains(setCookie, "Secure") {
		t.Fatalf("cross-origin cookie policy not applied: %s", setCookie)
	}
	csrf = csrfFromJar(t, jar, server.URL)
	// A sliding session must carry its CSRF cookie: after the cookie is gone the
	// session still works, so /auth/me has to hand back a usable token.
	resp, err = client.Get(base + "/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	if got := resp.Header.Get("Cache-Control"); got != "no-store" {
		t.Fatalf("api cache-control = %q, want no-store", got)
	}
	resp.Body.Close()
	if csrfFromJar(t, jar, server.URL) != csrf {
		t.Fatal("session refresh must keep the CSRF token stable for open tabs")
	}
	expireCookie(t, jar, server.URL, auth.CSRFCookie)
	resp, err = client.Get(base + "/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	setCookie = strings.Join(resp.Header.Values("Set-Cookie"), "\n")
	if err := json.NewDecoder(resp.Body).Decode(&me); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if !strings.Contains(setCookie, auth.CSRFCookie+"=") {
		t.Fatalf("session refresh must reissue the CSRF cookie: %s", setCookie)
	}
	csrf, _ = me["csrfToken"].(string)
	if csrf == "" {
		t.Fatal("auth status must return the reissued CSRF token")
	}
	if csrfFromJar(t, jar, server.URL) != csrf {
		t.Fatal("CSRF cookie and auth status token must match")
	}
	resp = sendJSON(t, client, http.MethodPatch, base+"/settings", map[string]any{"logLevel": "debug"}, csrf)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("write after CSRF cookie loss %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()
	if _, leaked := settings["googleClientSecret"]; leaked {
		t.Fatal("OAuth secret leaked in settings response")
	}
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	var stored string
	if err := conn.QueryRow(ctx, "SELECT value::text FROM settings WHERE key = 'google_client_secret'").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored, "google-secret") {
		t.Fatal("OAuth secret stored in plaintext")
	}
	// A rejected patch must not persist any of its settings, secrets included.
	retryBefore := settings["sendRetryLimit"]
	resp = sendJSON(t, client, http.MethodPatch, base+"/settings", map[string]any{
		"googleClientSecret": "rejected-secret", "sendRetryLimit": 99,
	}, csrf)
	if resp.StatusCode != 400 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("invalid settings patch %d: %s", resp.StatusCode, body)
	}
	var invalidSettings map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&invalidSettings); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	settingsDetail, _ := invalidSettings["error"].(map[string]any)
	messageText, _ := settingsDetail["message"].(string)
	if !strings.Contains(messageText, "sendRetryLimit") {
		t.Fatalf("invalid settings message = %q", messageText)
	}
	var after string
	if err := conn.QueryRow(ctx, "SELECT value::text FROM settings WHERE key = 'google_client_secret'").Scan(&after); err != nil {
		t.Fatal(err)
	}
	if after != stored {
		t.Fatal("rejected patch replaced the stored OAuth secret")
	}
	settings = getJSON(t, client, base+"/settings")
	if settings["sendRetryLimit"] != retryBefore {
		t.Fatalf("rejected patch changed sendRetryLimit: %v -> %v", retryBefore, settings["sendRetryLimit"])
	}
	// Oversized uploads must be cut off before the multipart parser buffers them.
	resp = sendJSON(t, client, http.MethodPatch, base+"/settings", map[string]any{"maxAttachmentBytes": 1 << 20}, csrf)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("attachment limit patch %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()
	upload := newBigMultipartBody(64 << 20)
	uploadReq, err := http.NewRequest(http.MethodPost, base+"/attachments", upload)
	if err != nil {
		t.Fatal(err)
	}
	uploadReq.Header.Set("Content-Type", "multipart/form-data; boundary="+uploadBoundary)
	uploadReq.Header.Set("X-CSRF-Token", csrf)
	resp, err = client.Do(uploadReq)
	if err == nil {
		if resp.StatusCode != http.StatusRequestEntityTooLarge {
			t.Fatalf("oversized upload status = %d, want 413", resp.StatusCode)
		}
		resp.Body.Close()
	}
	if upload.read >= 8<<20 {
		t.Fatalf("server consumed %d bytes of a rejected 64 MiB upload", upload.read)
	}
	resp = sendJSON(t, client, http.MethodPost, base+"/accounts", map[string]any{
		"name": "Test", "email": "api@example.com", "username": "api", "authType": "password",
		"password": "secret", "receiveProtocol": "imap", "imapAddr": "127.0.0.1:143",
		"imapSecurity": "starttls", "smtpAddr": "127.0.0.1:25", "smtpSecurity": "none",
		"syncEnabled": true, "initialSyncRange": "all", "downloadScope": "full_no_attachments",
	}, csrf)
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create account %d: %s", resp.StatusCode, body)
	}
	var account map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&account); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if account["hasPassword"] != true || account["imapAddr"] != "127.0.0.1:143" {
		t.Fatalf("account = %+v", account)
	}
	if _, ok := account["password"]; ok {
		t.Fatal("password leaked in response")
	}
	resp = sendJSON(t, client, http.MethodPatch, base+"/accounts/"+account["id"].(string), map[string]any{
		"name": "Test", "email": "api@example.com", "username": "api", "authType": "password",
		"receiveProtocol": "imap", "imapAddr": "127.0.0.1:143", "imapSecurity": "starttls",
		"smtpAddr": "127.0.0.1:25", "smtpSecurity": "none", "syncEnabled": true,
		"initialSyncRange": "all", "downloadScope": "full_no_attachments",
		"defaultSendName": "API Sender", "defaultReplyTo": "replies@example.com",
	}, csrf)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("update account %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()
	account = getJSON(t, client, base+"/accounts/"+account["id"].(string))
	if account["defaultSendName"] != "API Sender" || account["defaultReplyTo"] != "replies@example.com" {
		t.Fatalf("sender defaults not persisted: %+v", account)
	}
	tree := getJSON(t, client, base+"/mailboxes")
	if _, ok := tree["accounts"].([]any); !ok {
		t.Fatalf("tree = %+v", tree)
	}

	var mailboxID, messageID string
	if err := conn.QueryRow(ctx, `INSERT INTO mailboxes (id, account_id, path, name, role)
		VALUES (gen_random_uuid(), $1, 'INBOX', 'INBOX', 'inbox') RETURNING id`, account["id"]).Scan(&mailboxID); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(ctx, `INSERT INTO messages (id, account_id, mailbox_id, dedupe_key, received_at, subject)
		VALUES (gen_random_uuid(), $1, $2, 'patch-detail', now(), 'Patch detail') RETURNING id`, account["id"], mailboxID).Scan(&messageID); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `INSERT INTO attachments (id, message_id, part_path, filename, content_type, size, content_id)
		VALUES (gen_random_uuid(), $1, '1', 'inline.png', 'image/png', 10, 'inline-cid')`, messageID); err != nil {
		t.Fatal(err)
	}
	// Retry only applies to failed outbox rows; anything else must not be
	// reset to pending and re-sent.
	var draftID, outboxID string
	if err := conn.QueryRow(ctx, `INSERT INTO drafts (id, account_id)
		VALUES (gen_random_uuid(), $1) RETURNING id`, account["id"]).Scan(&draftID); err != nil {
		t.Fatal(err)
	}
	for _, status := range []string{"sent", "cancelled", "scheduled"} {
		if err := conn.QueryRow(ctx, `INSERT INTO outbox (id, account_id, draft_id, message_id_header, status)
			VALUES (gen_random_uuid(), $1, $2, '<retry@example.com>', $3) RETURNING id`,
			account["id"], draftID, status).Scan(&outboxID); err != nil {
			t.Fatal(err)
		}
		retryResp := sendJSON(t, client, http.MethodPost, base+"/outbox/"+outboxID+"/retry", nil, csrf)
		if retryResp.StatusCode != http.StatusConflict {
			body, _ := io.ReadAll(retryResp.Body)
			t.Fatalf("retry %s outbox %d: %s", status, retryResp.StatusCode, body)
		}
		retryResp.Body.Close()
		var unchanged string
		if err := conn.QueryRow(ctx, "SELECT status FROM outbox WHERE id = $1", outboxID).Scan(&unchanged); err != nil {
			t.Fatal(err)
		}
		if unchanged != status {
			t.Fatalf("retry of %s left status %q", status, unchanged)
		}
	}
	if err := conn.QueryRow(ctx, `INSERT INTO outbox (id, account_id, draft_id, message_id_header, status, last_error)
		VALUES (gen_random_uuid(), $1, $2, '<retry@example.com>', 'failed', 'smtp 550') RETURNING id`,
		account["id"], draftID).Scan(&outboxID); err != nil {
		t.Fatal(err)
	}
	retryResp := sendJSON(t, client, http.MethodPost, base+"/outbox/"+outboxID+"/retry", nil, csrf)
	if retryResp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(retryResp.Body)
		t.Fatalf("retry failed outbox %d: %s", retryResp.StatusCode, body)
	}
	retryResp.Body.Close()
	var retried string
	if err := conn.QueryRow(ctx, "SELECT status FROM outbox WHERE id = $1", outboxID).Scan(&retried); err != nil {
		t.Fatal(err)
	}
	if retried != "pending" {
		t.Fatalf("retried outbox status = %q, want pending", retried)
	}
	// Batch requests are bounded and never echo internal error text.
	tooMany := make([]string, 201)
	for i := range tooMany {
		tooMany[i] = uuid.NewString()
	}
	resp = sendJSON(t, client, http.MethodPost, base+"/messages/batch", map[string]any{
		"action": "read", "ids": tooMany,
	}, csrf)
	if resp.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("oversized batch %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()
	var batch map[string]any
	resp = sendJSON(t, client, http.MethodPost, base+"/messages/batch", map[string]any{
		"action": "read", "ids": []string{uuid.NewString()},
	}, csrf)
	if err := json.NewDecoder(resp.Body).Decode(&batch); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	failed, _ := batch["failed"].([]any)
	if len(failed) != 1 {
		t.Fatalf("batch failed = %v", batch["failed"])
	}
	if reason, _ := failed[0].(map[string]any)["error"].(string); reason != "not_found" {
		t.Fatalf("batch failure reason = %q, want not_found", reason)
	}
	detail := getJSON(t, client, base+"/messages/"+messageID)
	assertDetail := func(label string, payload map[string]any) {
		t.Helper()
		attachments, _ := payload["attachments"].([]any)
		if len(attachments) != 1 {
			t.Fatalf("%s attachments = %v, want 1", label, payload["attachments"])
		}
		if payload["accountEmail"] != "api@example.com" || payload["mailboxPath"] != "INBOX" {
			t.Fatalf("%s enrichment = %v / %v", label, payload["accountEmail"], payload["mailboxPath"])
		}
	}
	assertDetail("get", detail)
	resp = sendJSON(t, client, http.MethodPatch, base+"/messages/"+messageID, map[string]any{}, csrf)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("patch message %d: %s", resp.StatusCode, body)
	}
	var patched map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&patched); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	assertDetail("patch", patched)
}

func mustKey(t *testing.T) string {
	t.Helper()
	return "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
}

func getJSON(t *testing.T, client *http.Client, url string) map[string]any {
	t.Helper()
	resp, err := client.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode %s: %v", url, err)
	}
	return out
}

func postJSON(t *testing.T, client *http.Client, url string, body map[string]any, csrf string) *http.Response {
	t.Helper()
	return sendJSON(t, client, http.MethodPost, url, body, csrf)
}

func sendJSON(t *testing.T, client *http.Client, method, url string, body map[string]any, csrf string) *http.Response {
	t.Helper()
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(method, url, bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if csrf != "" {
		req.Header.Set("X-CSRF-Token", csrf)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func csrfFromJar(t *testing.T, jar http.CookieJar, serverURL string) string {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, serverURL, nil)
	for _, cookie := range jar.Cookies(req.URL) {
		if cookie.Name == auth.CSRFCookie {
			return cookie.Value
		}
	}
	t.Fatal("csrf cookie missing")
	return ""
}

func expireCookie(t *testing.T, jar http.CookieJar, serverURL, name string) {
	t.Helper()
	parsed, err := url.Parse(serverURL)
	if err != nil {
		t.Fatal(err)
	}
	jar.SetCookies(parsed, []*http.Cookie{{Name: name, Value: "", Path: "/", MaxAge: -1, Expires: time.Unix(1, 0)}})
	for _, cookie := range jar.Cookies(parsed) {
		if cookie.Name == name {
			t.Fatalf("cookie %s still present", name)
		}
	}
}

const uploadBoundary = "mailquaytestboundary"

type bigMultipartBody struct {
	read   int64
	prefix []byte
	data   int64
	suffix []byte
	stage  int
}

func newBigMultipartBody(size int64) *bigMultipartBody {
	prefix := "--" + uploadBoundary + "\r\n" +
		"Content-Disposition: form-data; name=\"file\"; filename=\"big.bin\"\r\n" +
		"Content-Type: application/octet-stream\r\n\r\n"
	return &bigMultipartBody{
		prefix: []byte(prefix),
		data:   size,
		suffix: []byte("\r\n--" + uploadBoundary + "--\r\n"),
	}
}

func (b *bigMultipartBody) Read(p []byte) (int, error) {
	if b.stage == 0 {
		n := copy(p, b.prefix)
		b.prefix = b.prefix[n:]
		b.read += int64(n)
		if len(b.prefix) == 0 {
			b.stage = 1
		}
		return n, nil
	}
	if b.stage == 1 {
		if b.data == 0 {
			b.stage = 2
		} else {
			if int64(len(p)) > b.data {
				p = p[:b.data]
			}
			clear(p)
			b.data -= int64(len(p))
			b.read += int64(len(p))
			return len(p), nil
		}
	}
	if len(b.suffix) == 0 {
		return 0, io.EOF
	}
	n := copy(p, b.suffix)
	b.suffix = b.suffix[n:]
	b.read += int64(n)
	return n, nil
}
