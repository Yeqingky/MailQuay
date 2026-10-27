package sync

import (
	"encoding/json"
	"time"

	"github.com/Yeqingky/MailQuay/internal/store/sqlcgen"
)

const (
	// bulkEventInterval bounds how often a bulk sync publishes mailbox progress
	// events. The UI refreshes at most once per interval instead of once per
	// imported message.
	bulkEventInterval = time.Second
	// bulkEventThreshold is the number of new messages above which a sync is
	// treated as bulk: per-message events are replaced by coalesced mailbox
	// progress events. Below it, new mail is announced individually so IDLE and
	// small polls stay near real time.
	bulkEventThreshold = 50
)

// bulkEvents coalesces notifications for a bulk sync of one mailbox. The zero
// value is not usable; call newBulkEvents. A nil *bulkEvents means "not bulk".
type bulkEvents struct {
	now   func() time.Time
	last  time.Time
	dirty bool
}

// newBulkEvents returns a coalescer when bulk is true, otherwise nil. Callers
// treat nil as "publish every message".
func newBulkEvents(bulk bool) *bulkEvents {
	if !bulk {
		return nil
	}
	return &bulkEvents{now: time.Now}
}

// due records one imported message and reports whether a progress event is due
// now. A message that arrives inside the interval stays pending until the next
// due() call or the final flush.
func (b *bulkEvents) due() bool {
	if b == nil {
		return false
	}
	b.dirty = true
	now := b.now()
	if !b.last.IsZero() && now.Sub(b.last) < bulkEventInterval {
		return false
	}
	b.last = now
	b.dirty = false
	return true
}

// pending reports whether messages arrived since the last published event.
func (b *bulkEvents) pending() bool {
	return b != nil && b.dirty
}

// clear marks the coalescer as published, so the deferred final flush does not
// duplicate the idle event that ends the sync.
func (b *bulkEvents) clear() {
	if b == nil {
		return
	}
	b.dirty = false
}

// mailboxProgressEvent is the coalesced notification sent while a bulk sync
// imports messages. It carries no counts on purpose: the client refetches the
// mailbox tree and the visible page once per interval, and the final idle event
// carries authoritative counts.
func mailboxProgressEvent(mb sqlcgen.Mailbox, acct sqlcgen.Account) map[string]any {
	return map[string]any{
		"accountId": acct.ID.String(), "mailboxId": mb.ID.String(),
		"syncState": "syncing", "bulk": true,
	}
}

// messageEventPayload announces one new message together with the summary the
// list needs, so clients can insert the row without requesting message detail.
func messageEventPayload(msg sqlcgen.Message, acct sqlcgen.Account, mb sqlcgen.Mailbox) map[string]any {
	return map[string]any{
		"accountId": acct.ID.String(), "mailboxId": mb.ID.String(),
		"messageId": msg.ID.String(), "unread": !hasFlag(msg.Flags, "\\Seen"),
		"message": messageSummary(msg, acct, mb),
	}
}

// messageSummary mirrors the MessageSummary schema for the fields a list row
// needs. Detail-only fields stay out; the client loads them on demand.
func messageSummary(msg sqlcgen.Message, acct sqlcgen.Account, mb sqlcgen.Mailbox) map[string]any {
	summary := map[string]any{
		"id": msg.ID.String(), "accountId": msg.AccountID.String(), "mailboxId": msg.MailboxID.String(),
		"subject": msg.Subject, "receivedAt": msg.ReceivedAt.UTC().Format(time.RFC3339Nano),
		"size": msg.Size, "unread": !hasFlag(msg.Flags, "\\Seen"), "marked": msg.LocalFlag,
		"hasAttachments": msg.HasAttachments, "bodyState": msg.BodyState,
		"attachmentsState": msg.AttachmentsState, "preserved": msg.PreservedAt != nil,
		"snippet": msg.Snippet, "isArchive": false,
		"accountEmail": acct.Email, "accountName": acct.Name,
		"mailboxPath": mb.Path, "mailboxRole": mb.Role,
	}
	if msg.ThreadID != nil {
		summary["threadId"] = msg.ThreadID.String()
	}
	if msg.SentAt != nil {
		summary["sentAt"] = msg.SentAt.UTC().Format(time.RFC3339Nano)
	}
	if value := decodeEventJSON(msg.FromAddr); value != nil {
		summary["from"] = value
	}
	if value := decodeEventJSON(msg.ToAddrs); value != nil {
		summary["to"] = value
	}
	if value := decodeEventJSON(msg.CcAddrs); value != nil {
		summary["cc"] = value
	}
	return summary
}

func decodeEventJSON(raw []byte) any {
	if len(raw) == 0 {
		return nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil
	}
	return value
}
