package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mailquay/mailquay/internal/platform"
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
	}
	if err := json.Unmarshal(listResponse.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode logs response: %v", err)
	}
	if len(result.Logs) != 1 || result.Logs[0].ID != 1 || result.Logs[0].Line != "time=2026-10-23T09:35:14Z level=INFO msg=sync mailbox" {
		t.Fatalf("logs = %#v, want the stored record", result.Logs)
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
