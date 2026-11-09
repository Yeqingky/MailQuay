package push

import (
	"os"
	"path/filepath"
	"testing"
)

func TestComposeNotification(t *testing.T) {
	single := []notification{{
		AccountID: "acc-1", MailboxID: "mb-1", Sender: "Alice", Subject: "Hello",
	}}
	title, body, path := composeNotification(single, "en")
	if title != "Alice" || body != "Hello" || path != "/accounts/acc-1/mailboxes/mb-1" {
		t.Fatalf("single = %q %q %q", title, body, path)
	}

	multiple := []notification{
		{AccountID: "acc-1", MailboxID: "mb-1", Sender: "Alice", Subject: "One"},
		{AccountID: "acc-2", MailboxID: "mb-2", Sender: "Bob", Subject: "Two"},
	}
	title, body, path = composeNotification(multiple, "en")
	if title != "2 new messages" || body != "Two" || path != "/accounts/acc-2/mailboxes/mb-2" {
		t.Fatalf("multiple = %q %q %q", title, body, path)
	}

	title, body, _ = composeNotification(multiple, "zh-CN")
	if title != "2 封新邮件" || body != "Two" {
		t.Fatalf("zh = %q %q", title, body)
	}

	title, body, _ = composeNotification([]notification{{AccountID: "acc-1", MailboxID: "mb-1"}}, "zh-CN")
	if title != "MailQuay" || body != "(无主题)" {
		t.Fatalf("fallback = %q %q", title, body)
	}
}

func TestReadNotificationRejectsReadOrIncomplete(t *testing.T) {
	if _, ok := readNotification(map[string]any{
		"accountId": "acc-1", "mailboxId": "mb-1", "unread": false,
		"message": map[string]any{"subject": "read"},
	}); ok {
		t.Fatal("read message should be ignored")
	}
	if _, ok := readNotification(map[string]any{
		"accountId": "acc-1", "mailboxId": "mb-1", "unread": true,
	}); ok {
		t.Fatal("missing summary should be ignored")
	}
}

func TestReadNotificationUsesSenderAndAccountFallback(t *testing.T) {
	item, ok := readNotification(map[string]any{
		"accountId": "acc-1", "mailboxId": "mb-1", "unread": true,
		"message": map[string]any{
			"subject": "Hi",
			"from":    map[string]any{"email": "alice@example.com"},
		},
	})
	if !ok || item.Sender != "alice@example.com" || item.Subject != "Hi" {
		t.Fatalf("item = %+v ok=%v", item, ok)
	}

	item, ok = readNotification(map[string]any{
		"accountId": "acc-1", "mailboxId": "mb-1", "unread": true,
		"message": map[string]any{"subject": "", "accountEmail": "owner@example.com"},
	})
	if !ok || item.Sender != "owner@example.com" {
		t.Fatalf("fallback item = %+v ok=%v", item, ok)
	}
}

func TestLoadOrCreateKeysPersists(t *testing.T) {
	dir := t.TempDir()
	first, err := loadOrCreateKeys(dir)
	if err != nil {
		t.Fatal(err)
	}
	if first.PublicKey == "" || first.PrivateKey == "" {
		t.Fatal("generated keys are empty")
	}
	second, err := loadOrCreateKeys(dir)
	if err != nil {
		t.Fatal(err)
	}
	if second != first {
		t.Fatalf("keys changed between loads")
	}
	info, err := os.Stat(filepath.Join(dir, vapidFile))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("vapid mode = %o", info.Mode().Perm())
	}
}
