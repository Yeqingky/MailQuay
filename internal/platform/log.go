package platform

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
	"unicode/utf8"
)

const (
	defaultLogCapacity = 1000
	maxLogLineBytes    = 8192
	truncatedSuffix    = " [truncated]"
)

// LogEntry is one formatted runtime log record retained for the task center.
type LogEntry struct {
	ID   int64  `json:"id"`
	Line string `json:"line"`
}

// LogBuffer retains a bounded, ordered window of formatted log records.
type LogBuffer struct {
	mu       sync.RWMutex
	entries  []LogEntry
	capacity int
	start    int
	size     int
	nextID   int64
}

// NewLogBuffer creates a bounded log buffer. Non-positive capacities use the
// default retention size.
func NewLogBuffer(capacity int) *LogBuffer {
	if capacity <= 0 {
		capacity = defaultLogCapacity
	}
	return &LogBuffer{entries: make([]LogEntry, capacity), capacity: capacity, nextID: 1}
}

// Append adds one formatted record and drops the oldest record when full.
func (b *LogBuffer) Append(line string) {
	line = strings.TrimSuffix(line, "\n")
	if line == "" {
		return
	}
	if len(line) > maxLogLineBytes {
		end := maxLogLineBytes - len(truncatedSuffix)
		for end > 0 && !utf8.RuneStart(line[end]) {
			end--
		}
		line = line[:end] + truncatedSuffix
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	index := (b.start + b.size) % b.capacity
	if b.size == b.capacity {
		index = b.start
		b.start = (b.start + 1) % b.capacity
	} else {
		b.size++
	}
	b.entries[index] = LogEntry{ID: b.nextID, Line: line}
	b.nextID++
}

// Write appends one record from slog's text handler.
func (b *LogBuffer) Write(data []byte) (int, error) {
	b.Append(string(data))
	return len(data), nil
}

// List returns a detached snapshot ordered from oldest to newest.
func (b *LogBuffer) List() []LogEntry {
	b.mu.RLock()
	defer b.mu.RUnlock()

	entries := make([]LogEntry, b.size)
	for i := range entries {
		entries[i] = b.entries[(b.start+i)%b.capacity]
	}
	return entries
}

// Clear removes retained records without resetting the monotonic entry IDs.
func (b *LogBuffer) Clear() {
	b.mu.Lock()
	defer b.mu.Unlock()

	for i := 0; i < b.size; i++ {
		b.entries[(b.start+i)%b.capacity] = LogEntry{}
	}
	b.start = 0
	b.size = 0
}

type teeHandler struct {
	handlers []slog.Handler
}

func (h *teeHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, handler := range h.handlers {
		if handler.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (h *teeHandler) Handle(ctx context.Context, record slog.Record) error {
	var result error
	for _, handler := range h.handlers {
		if handler.Enabled(ctx, record.Level) {
			result = errors.Join(result, handler.Handle(ctx, record))
		}
	}
	return result
}

func (h *teeHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	handlers := make([]slog.Handler, len(h.handlers))
	for i, handler := range h.handlers {
		handlers[i] = handler.WithAttrs(attrs)
	}
	return &teeHandler{handlers: handlers}
}

func (h *teeHandler) WithGroup(name string) slog.Handler {
	handlers := make([]slog.Handler, len(h.handlers))
	for i, handler := range h.handlers {
		handlers[i] = handler.WithGroup(name)
	}
	return &teeHandler{handlers: handlers}
}

// ParseLevel maps a configuration string to a slog level.
func ParseLevel(level string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// NewLogger builds a structured logger from level and format strings.
func NewLogger(level, format string) *slog.Logger {
	lvl := new(slog.LevelVar)
	lvl.Set(ParseLevel(level))
	return slog.New(newOutputHandler(os.Stdout, format, &slog.HandlerOptions{Level: lvl}))
}

// NewLoggerLevel builds a logger with a mutable level and bounded log history.
func NewLoggerLevel(level, format string) (*slog.Logger, *slog.LevelVar, *LogBuffer) {
	return newLoggerLevel(os.Stdout, level, format)
}

func newLoggerLevel(output io.Writer, level, format string) (*slog.Logger, *slog.LevelVar, *LogBuffer) {
	lvl := new(slog.LevelVar)
	lvl.Set(ParseLevel(level))
	opts := &slog.HandlerOptions{Level: lvl}
	console := newOutputHandler(output, format, opts)
	logs := NewLogBuffer(defaultLogCapacity)
	capture := slog.NewTextHandler(logs, opts)
	logger := slog.New(&teeHandler{handlers: []slog.Handler{console, capture}})
	return logger, lvl, logs
}

func newOutputHandler(output io.Writer, format string, opts *slog.HandlerOptions) slog.Handler {
	if strings.EqualFold(format, "json") {
		return slog.NewJSONHandler(output, opts)
	}
	return slog.NewTextHandler(output, opts)
}
