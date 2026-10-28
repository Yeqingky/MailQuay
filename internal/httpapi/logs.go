package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Yeqingky/MailQuay/internal/httpapi/oapi"
)

// logHeartbeat keeps proxies from closing an idle log stream. It matches the
// main event stream so one reverse proxy timeout covers both.
const logHeartbeat = 5 * time.Second

func (s *Server) ListLogs(w http.ResponseWriter, _ *http.Request) {
	entries := s.logs.List()
	logs := make([]oapi.LogEntry, 0, len(entries))
	for _, entry := range entries {
		logs = append(logs, oapi.LogEntry{Id: entry.ID, Line: entry.Line})
	}
	latest, generation := s.logs.Latest()
	writeJSON(w, http.StatusOK, map[string]any{
		"logs":   logs,
		"cursor": formatLogCursor(generation, latest),
	})
}

func (s *Server) ClearLogs(w http.ResponseWriter, _ *http.Request) {
	s.logs.Clear()
	w.WriteHeader(http.StatusNoContent)
}

// StreamLogs pushes batches of runtime log records. The SSE id carries the
// buffer generation and the newest entry in the batch, so a reconnect resumes
// exactly after the last delivered record and a cleared buffer is detectable.
func (s *Server) StreamLogs(w http.ResponseWriter, r *http.Request, params oapi.StreamLogsParams) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		s.error(w, r, http.StatusInternalServerError, "stream_unsupported", "Streaming is not supported.")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	writeEvent := func(id, event string, data []byte) bool {
		var frame string
		if event == "" {
			frame = fmt.Sprintf("id: %s\ndata: %s\n\n", id, data)
		} else {
			frame = fmt.Sprintf("id: %s\nevent: %s\ndata: %s\n\n", id, event, data)
		}
		_, err := fmt.Fprint(w, frame)
		return err == nil
	}

	cursor, generation := logCursor(params)
	emit := func() bool {
		batch := s.logs.After(cursor, generation)
		generation = batch.Generation
		if batch.Reset != "" {
			payload, err := json.Marshal(map[string]string{"reason": string(batch.Reset)})
			if err != nil {
				return false
			}
			// A reset cursor precedes every record of the new generation, so a
			// reconnect that only learns this id still replays the buffer.
			if !writeEvent(formatLogCursor(generation, 0), "reset", payload) {
				return false
			}
			// The batch below already carries every retained record.
			cursor = batch.Latest
		}
		if len(batch.Entries) > 0 {
			data, err := json.Marshal(batch.Entries)
			if err != nil {
				return true
			}
			last := batch.Entries[len(batch.Entries)-1]
			if !writeEvent(formatLogCursor(generation, last.ID), "", data) {
				return false
			}
			cursor = last.ID
		}
		flusher.Flush()
		return true
	}

	if !emit() {
		return
	}
	updates := s.logs.Updates()
	heartbeat := time.NewTicker(logHeartbeat)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case <-updates:
			if !emit() {
				return
			}
		}
	}
}

func logCursor(params oapi.StreamLogsParams) (int64, uint64) {
	raw := ""
	if params.LastEventID != nil {
		raw = *params.LastEventID
	}
	if raw == "" && params.After != nil {
		raw = *params.After
	}
	generation, id, ok := strings.Cut(raw, "-")
	if !ok {
		return 0, 0
	}
	gen, err := strconv.ParseUint(generation, 10, 64)
	if err != nil {
		return 0, 0
	}
	cursor, err := strconv.ParseInt(id, 10, 64)
	if err != nil || cursor < 0 {
		return 0, 0
	}
	return cursor, gen
}

func formatLogCursor(generation uint64, id int64) string {
	return fmt.Sprintf("%d-%d", generation, id)
}
