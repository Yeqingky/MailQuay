package auth

import (
	"sync"
	"time"
)

const (
	// limiterMaxKeys bounds tracked keys so spoofed or distributed sources cannot
	// grow the map without limit; new keys are rejected once the map is full.
	limiterMaxKeys = 4096
	// limiterSweepInterval throttles sweeps triggered by a full map.
	limiterSweepInterval = time.Second
)

type limiter struct {
	mu        sync.Mutex
	limit     int
	window    time.Duration
	attempts  map[string][]time.Time
	lastSweep time.Time
}

func newLimiter(limit int, window time.Duration) *limiter {
	return &limiter{limit: limit, window: window, attempts: make(map[string][]time.Time)}
}

func (l *limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	l.sweep(now)
	cutoff := now.Add(-l.window)
	entries, known := l.attempts[key]
	if !known && len(l.attempts) >= limiterMaxKeys {
		return false
	}
	kept := entries[:0]
	for _, t := range entries {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.limit {
		l.attempts[key] = kept
		return false
	}
	l.attempts[key] = append(kept, now)
	return true
}

func (l *limiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}

// sweep drops keys that have no attempt left inside the window. Every stored key
// holds a timestamp from its last Allow, so idle keys are exactly the stale ones.
func (l *limiter) sweep(now time.Time) {
	due := now.Sub(l.lastSweep) >= l.window
	if len(l.attempts) >= limiterMaxKeys && now.Sub(l.lastSweep) >= limiterSweepInterval {
		due = true
	}
	if !due {
		return
	}
	cutoff := now.Add(-l.window)
	for key, entries := range l.attempts {
		if len(entries) == 0 || !entries[len(entries)-1].After(cutoff) {
			delete(l.attempts, key)
		}
	}
	l.lastSweep = now
}
