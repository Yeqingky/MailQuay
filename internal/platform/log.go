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

// ResetReason explains why a streaming reader cannot resume from its cursor.
type ResetReason string

const (
	// ResetCleared means Clear dropped every record the reader had already seen.
	ResetCleared ResetReason = "cleared"
	// ResetTruncated means the reader fell behind and lost records.
	ResetTruncated ResetReason = "truncated"
)

// LogBatch is one incremental read for a streaming reader.
type LogBatch struct {
	// Generation identifies the buffer contents. Clear bumps it, so a reader
	// can tell a slow cursor from a cursor that points at cleared records.
	Generation uint64
	// Entries holds retained records newer than the requested cursor, or every
	// retained record when Reset is set.
	Entries []LogEntry
	// Latest is the newest retained record ID, or zero when nothing is retained.
	Latest int64
	// Reset is set when the cursor can no longer be served.
	Reset ResetReason
}

// LogBuffer retains a bounded, ordered window of formatted log records.
type LogBuffer struct {
	mu       sync.RWMutex
	entries  []LogEntry
	capacity int
	start    int
	size     int
	nextID   int64
	gen      uint64
	updates  chan struct{}
}

// NewLogBuffer creates a bounded log buffer. Non-positive capacities use the
// default retention size.
func NewLogBuffer(capacity int) *LogBuffer {
	if capacity <= 0 {
		capacity = defaultLogCapacity
	}
	return &LogBuffer{
		entries:  make([]LogEntry, capacity),
		capacity: capacity,
		nextID:   1,
		gen:      1,
		updates:  make(chan struct{}, 1),
	}
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
	b.notifyLocked()
}

// notifyLocked wakes streaming readers. Signals coalesce, so a reader always
// re-reads the buffer instead of counting notifications.
func (b *LogBuffer) notifyLocked() {
	select {
	case b.updates <- struct{}{}:
	default:
	}
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
// The generation changes so streaming readers replay from an empty buffer
// instead of showing records that no longer exist.
func (b *LogBuffer) Clear() {
	b.mu.Lock()
	defer b.mu.Unlock()

	for i := 0; i < b.size; i++ {
		b.entries[(b.start+i)%b.capacity] = LogEntry{}
	}
	b.start = 0
	b.size = 0
	b.gen++
	b.notifyLocked()
}

// Latest returns the newest retained record ID and the current generation.
// The ID is zero when nothing is retained.
func (b *LogBuffer) Latest() (int64, uint64) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.size == 0 {
		return 0, b.gen
	}
	return b.nextID - 1, b.gen
}

// Updates reports that retained records changed. Signals coalesce; a reader
// must call After until it returns no entries.
func (b *LogBuffer) Updates() <-chan struct{} {
	return b.updates
}

// After returns retained records newer than cursor for a reader that last saw
// generation. A zero generation adopts the current one, which is how a fresh
// reader asks for everything that is still retained.
func (b *LogBuffer) After(cursor int64, generation uint64) LogBatch {
	b.mu.RLock()
	defer b.mu.RUnlock()

	batch := LogBatch{Generation: b.gen, Latest: b.nextID - 1}
	if b.size == 0 {
		batch.Latest = 0
		if generation != 0 && generation != b.gen {
			batch.Reset = ResetCleared
		}
		return batch
	}

	oldest := b.nextID - int64(b.size)
	start := 0
	switch {
	case generation != 0 && generation != b.gen:
		batch.Reset = ResetCleared
	case cursor > 0 && cursor+1 < oldest:
		// A zero cursor means the reader has seen nothing, so replaying the
		// retained window is complete rather than lossy.
		batch.Reset = ResetTruncated
	case cursor+1 > oldest:
		start = int(cursor + 1 - oldest)
		if start > b.size {
			start = b.size
		}
	}

	if start >= b.size {
		return batch
	}
	batch.Entries = make([]LogEntry, 0, b.size-start)
	for i := start; i < b.size; i++ {
		batch.Entries = append(batch.Entries, b.entries[(b.start+i)%b.capacity])
	}
	return batch
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
