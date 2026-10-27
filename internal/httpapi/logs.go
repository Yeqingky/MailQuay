package httpapi

import (
	"net/http"

	"github.com/Yeqingky/MailQuay/internal/httpapi/oapi"
)

func (s *Server) ListLogs(w http.ResponseWriter, _ *http.Request) {
	entries := s.logs.List()
	logs := make([]oapi.LogEntry, 0, len(entries))
	for _, entry := range entries {
		logs = append(logs, oapi.LogEntry{Id: entry.ID, Line: entry.Line})
	}
	writeJSON(w, http.StatusOK, map[string]any{"logs": logs})
}

func (s *Server) ClearLogs(w http.ResponseWriter, _ *http.Request) {
	s.logs.Clear()
	w.WriteHeader(http.StatusNoContent)
}
