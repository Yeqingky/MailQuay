package sync

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Yeqingky/MailQuay/internal/store/sqlcgen"
)

func TestBulkEventsCoalesce(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	bulk := &bulkEvents{now: func() time.Time { return now }}
	if !bulk.due() {
		t.Fatal("first message must publish immediately")
	}
	if bulk.pending() {
		t.Fatal("a published message must not stay pending")
	}
	now = now.Add(200 * time.Millisecond)
	if bulk.due() {
		t.Fatal("a message inside the interval must not publish")
	}
	if !bulk.pending() {
		t.Fatal("a message inside the interval must stay pending for the final flush")
	}
	now = now.Add(bulkEventInterval)
	if !bulk.due() {
		t.Fatal("a message after the interval must publish")
	}
	bulk.clear()
	if bulk.pending() {
		t.Fatal("clear must drop the pending flag")
	}
}

func TestBulkEventsThreshold(t *testing.T) {
	if newBulkEvents(false) != nil {
		t.Fatal("small syncs must announce every message")
	}
	if newBulkEvents(true) == nil {
		t.Fatal("bulk syncs must coalesce")
	}
}

func TestNilBulkEventsNeverPublishes(t *testing.T) {
	var bulk *bulkEvents
	if bulk.due() || bulk.pending() {
		t.Fatal("nil coalescer must be inert")
	}
	bulk.clear()
}

func TestMessageEventPayloadCarriesSummary(t *testing.T) {
	acct := sqlcgen.Account{ID: uuid.New(), Email: "user@example.com", Name: "User"}
	mb := sqlcgen.Mailbox{ID: uuid.New(), Path: "INBOX", Role: "inbox"}
	thread := uuid.New()
	received := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)
	msg := sqlcgen.Message{
		ID: uuid.New(), AccountID: acct.ID, MailboxID: mb.ID, ThreadID: &thread,
		Subject: "Hello", ReceivedAt: received, Size: 42,
		Flags: []string{"\\Seen"}, BodyState: "cached", AttachmentsState: "missing",
		FromAddr: []byte(`{"name":"Alice","email":"alice@example.com"}`),
	}

	payload := messageEventPayload(msg, acct, mb)
	if payload["messageId"] != msg.ID.String() || payload["accountId"] != acct.ID.String() {
		t.Fatalf("payload ids = %v", payload)
	}
	if payload["unread"] != false {
		t.Fatalf("seen message reported unread: %v", payload["unread"])
	}
	summary, ok := payload["message"].(map[string]any)
	if !ok {
		t.Fatalf("payload has no summary: %v", payload["message"])
	}
	if summary["subject"] != "Hello" || summary["mailboxRole"] != "inbox" {
		t.Fatalf("summary = %v", summary)
	}
	if summary["accountEmail"] != acct.Email || summary["bodyState"] != "cached" {
		t.Fatalf("summary = %v", summary)
	}
	if summary["threadId"] != thread.String() {
		t.Fatalf("summary thread = %v", summary["threadId"])
	}
	from, ok := summary["from"].(map[string]any)
	if !ok || from["email"] != "alice@example.com" {
		t.Fatalf("summary from = %v", summary["from"])
	}
	if got := summary["receivedAt"]; got != received.Format(time.RFC3339Nano) {
		t.Fatalf("receivedAt = %v", got)
	}
}

func TestMailboxProgressEventCarriesIds(t *testing.T) {
	acct := sqlcgen.Account{ID: uuid.New()}
	mb := sqlcgen.Mailbox{ID: uuid.New()}
	event := mailboxProgressEvent(mb, acct)
	if event["mailboxId"] != mb.ID.String() || event["accountId"] != acct.ID.String() {
		t.Fatalf("event = %v", event)
	}
	if event["bulk"] != true || event["syncState"] != "syncing" {
		t.Fatalf("event = %v", event)
	}
}
