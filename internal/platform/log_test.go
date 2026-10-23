package platform

import (
	"io"
	"strings"
	"testing"
)

func TestLoggerCapturesFormattedRecordsAtConfiguredLevel(t *testing.T) {
	logger, _, logs := newLoggerLevel(io.Discard, "warn", "text")
	logger.Info("below configured level")
	logger.With("component", "imap").Error("mailbox sync failed", "account", "owner@example.com")

	entries := logs.List()
	if len(entries) != 1 {
		t.Fatalf("log count = %d, want 1", len(entries))
	}
	line := entries[0].Line
	for _, part := range []string{"level=ERROR", `msg="mailbox sync failed"`, "component=imap", "account=owner@example.com"} {
		if !strings.Contains(line, part) {
			t.Errorf("log line %q does not contain %q", line, part)
		}
	}
}

func TestLogBufferKeepsNewestRecordsAndClearPreservesIDs(t *testing.T) {
	logs := NewLogBuffer(2)
	logs.Append("first")
	logs.Append("second")
	logs.Append("third")

	entries := logs.List()
	if len(entries) != 2 || entries[0].Line != "second" || entries[1].Line != "third" {
		t.Fatalf("entries = %#v, want second and third", entries)
	}
	if entries[0].ID != 2 || entries[1].ID != 3 {
		t.Fatalf("entry IDs = %d, %d, want 2, 3", entries[0].ID, entries[1].ID)
	}

	logs.Clear()
	logs.Append("after clear")
	entries = logs.List()
	if len(entries) != 1 || entries[0].ID != 4 || entries[0].Line != "after clear" {
		t.Fatalf("entries after clear = %#v, want ID 4 after clear", entries)
	}
}
