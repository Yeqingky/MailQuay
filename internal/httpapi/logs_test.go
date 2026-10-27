package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Yeqingky/MailQuay/internal/httpapi/oapi"
	"github.com/Yeqingky/MailQuay/internal/platform"
)

func TestLogsCanBeReadAndCleared(t *testing.T) {
	logs := platform.NewLogBuffer(3)
	logs.Append("time=2026-10-23T09:35:14Z level=INFO msg=sync mailbox")
	server := &Server{logs: logs}

	listResponse := httptest.NewRecorder()
	server.ListLogs(listResponse, httptest.NewRequest(http.MethodGet, "/api/v1/logs", nil))
	if listResponse.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want %d", listResponse.Code, http.StatusOK)
	}
	var result struct {
		Logs []struct {
			ID   int64  `json:"id"`
			Line string `json:"line"`
		} `json:"logs"`
		Cursor string `json:"cursor"`
	}
	if err := json.Unmarshal(listResponse.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode logs response: %v", err)
	}
	if len(result.Logs) != 1 || result.Logs[0].ID != 1 || result.Logs[0].Line != "time=2026-10-23T09:35:14Z level=INFO msg=sync mailbox" {
		t.Fatalf("logs = %#v, want the stored record", result.Logs)
	}
	latest, generation := logs.Latest()
	if result.Cursor != formatLogCursor(generation, latest) {
		t.Fatalf("cursor = %q, want the newest record cursor %q", result.Cursor, formatLogCursor(generation, latest))
	}

	clearResponse := httptest.NewRecorder()
	server.ClearLogs(clearResponse, httptest.NewRequest(http.MethodDelete, "/api/v1/logs", nil))
	if clearResponse.Code != http.StatusNoContent {
		t.Fatalf("DELETE status = %d, want %d", clearResponse.Code, http.StatusNoContent)
	}
	if remaining := logs.List(); len(remaining) != 0 {
		t.Fatalf("log count after clear = %d, want 0", len(remaining))
	}
}

type sseFrame struct {
	ID    string
	Event string
	Data  string
}

// readFrame returns the next complete SSE frame. The request context bounds the
// wait, so a missing frame fails instead of hanging the test.
func readFrame(t *testing.T, reader *bufio.Reader) sseFrame {
	t.Helper()
	var frame sseFrame
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read frame: %v", err)
		}
		line = strings.TrimRight(line, "\n")
		if line == "" {
			if frame.ID == "" && frame.Data == "" && frame.Event == "" {
				continue // comment-only frame such as a heartbeat
			}
			return frame
		}
		switch {
		case strings.HasPrefix(line, "id: "):
			frame.ID = strings.TrimPrefix(line, "id: ")
		case strings.HasPrefix(line, "event: "):
			frame.Event = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			frame.Data = strings.TrimPrefix(line, "data: ")
		}
	}
}

func decodeLogFrame(t *testing.T, frame sseFrame) []platform.LogEntry {
	t.Helper()
	var entries []platform.LogEntry
	if err := json.Unmarshal([]byte(frame.Data), &entries); err != nil {
		t.Fatalf("decode frame data %q: %v", frame.Data, err)
	}
	return entries
}

func TestStreamLogsSendsNewBatchesAndResetsAfterClear(t *testing.T) {
	logs := platform.NewLogBuffer(4)
	logs.Append("first")
	logs.Append("second")
	server := &Server{logs: logs}
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		server.StreamLogs(w, r, oapi.StreamLogsParams{})
	}))
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL, nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	response, err := ts.Client().Do(request)
	if err != nil {
		t.Fatalf("open stream: %v", err)
	}
	defer response.Body.Close()
	if contentType := response.Header.Get("Content-Type"); contentType != "text/event-stream" {
		t.Fatalf("content type = %q, want text/event-stream", contentType)
	}
	reader := bufio.NewReader(response.Body)
	_, generation := logs.Latest()

	frame := readFrame(t, reader)
	if frame.Event != "" || frame.ID != formatLogCursor(generation, 2) {
		t.Fatalf("initial frame = %#v, want an unnamed frame at %q", frame, formatLogCursor(generation, 2))
	}
	if entries := decodeLogFrame(t, frame); len(entries) != 2 || entries[0].Line != "first" || entries[1].Line != "second" {
		t.Fatalf("initial entries = %#v, want both retained records", entries)
	}

	logs.Append("third")
	frame = readFrame(t, reader)
	if entries := decodeLogFrame(t, frame); len(entries) != 1 || entries[0].ID != 3 || entries[0].Line != "third" {
		t.Fatalf("entries = %#v, want only the new record", entries)
	}

	logs.Clear()
	frame = readFrame(t, reader)
	if frame.Event != "reset" || !strings.Contains(frame.Data, string(platform.ResetCleared)) {
		t.Fatalf("frame = %#v, want a cleared reset", frame)
	}

	logs.Append("fourth")
	frame = readFrame(t, reader)
	entries := decodeLogFrame(t, frame)
	if len(entries) != 1 || entries[0].ID != 4 || entries[0].Line != "fourth" {
		t.Fatalf("entries = %#v, want the record written after clear", entries)
	}
	if frame.ID != formatLogCursor(generation+1, 4) {
		t.Fatalf("frame id = %q, want the post-clear generation cursor", frame.ID)
	}
}

func TestStreamLogsResumesFromLastEventID(t *testing.T) {
	logs := platform.NewLogBuffer(4)
	logs.Append("first")
	logs.Append("second")
	_, generation := logs.Latest()
	cursor := formatLogCursor(generation, 1)
	server := &Server{logs: logs}
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		server.StreamLogs(w, r, oapi.StreamLogsParams{LastEventID: &cursor})
	}))
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL, nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	response, err := ts.Client().Do(request)
	if err != nil {
		t.Fatalf("open stream: %v", err)
	}
	defer response.Body.Close()

	frame := readFrame(t, bufio.NewReader(response.Body))
	if entries := decodeLogFrame(t, frame); len(entries) != 1 || entries[0].ID != 2 {
		t.Fatalf("entries = %#v, want only the record after the cursor", entries)
	}
}
