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

func TestLogBufferAfterReturnsOnlyNewRecords(t *testing.T) {
	logs := NewLogBuffer(4)
	logs.Append("first")
	logs.Append("second")

	latest, generation := logs.Latest()
	if latest != 2 || generation == 0 {
		t.Fatalf("latest = %d, generation = %d, want 2 and a non-zero generation", latest, generation)
	}

	batch := logs.After(0, 0)
	if batch.Reset != "" || len(batch.Entries) != 2 || batch.Generation != generation || batch.Latest != 2 {
		t.Fatalf("initial batch = %#v, want both records and no reset", batch)
	}

	logs.Append("third")
	batch = logs.After(2, generation)
	if batch.Reset != "" {
		t.Fatalf("reset = %q, want none for an in-window cursor", batch.Reset)
	}
	if len(batch.Entries) != 1 || batch.Entries[0].ID != 3 || batch.Entries[0].Line != "third" {
		t.Fatalf("entries = %#v, want only the third record", batch.Entries)
	}

	if batch = logs.After(3, generation); len(batch.Entries) != 0 || batch.Reset != "" {
		t.Fatalf("batch at the newest cursor = %#v, want no entries and no reset", batch)
	}
}

func TestLogBufferAfterReportsClearedAndTruncatedCursors(t *testing.T) {
	logs := NewLogBuffer(2)
	logs.Append("first")
	logs.Append("second")
	_, generation := logs.Latest()

	logs.Append("third")
	logs.Append("fourth")
	batch := logs.After(1, generation)
	if batch.Reset != ResetTruncated || len(batch.Entries) != 2 || batch.Entries[0].ID != 3 {
		t.Fatalf("batch = %#v, want a truncated reset with the retained window", batch)
	}

	logs.Clear()
	batch = logs.After(4, generation)
	if batch.Reset != ResetCleared || len(batch.Entries) != 0 || batch.Generation == generation {
		t.Fatalf("batch after clear = %#v, want a cleared reset with a new generation", batch)
	}

	logs.Append("after clear")
	batch = logs.After(0, batch.Generation)
	if batch.Reset != "" {
		t.Fatalf("reset = %q, want none after adopting the new generation", batch.Reset)
	}
	if len(batch.Entries) != 1 || batch.Entries[0].ID != 5 {
		t.Fatalf("entries = %#v, want the record written after clear", batch.Entries)
	}
}

func TestLogBufferUpdatesCoalesceSignals(t *testing.T) {
	logs := NewLogBuffer(4)
	logs.Append("first")
	logs.Append("second")
	logs.Clear()

	// Three changes collapse into a single pending signal.
	select {
	case <-logs.Updates():
	default:
		t.Fatal("expected a pending update signal")
	}
	select {
	case <-logs.Updates():
		t.Fatal("expected signals to coalesce")
	default:
	}
}
