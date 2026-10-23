package netpace

import (
	"context"
	"math/rand/v2"
	"sync"
	"time"
)

type hostState struct {
	activeConnections int
	syncLimit         int
	activeSyncs       int
	adaptiveSyncLimit int
	retryUntil        time.Time
	retryDelay        time.Duration
	changed           chan struct{}
}

func (p *Pacer) hostStateLocked(host string) *hostState {
	state := p.hosts[host]
	if state == nil {
		state = &hostState{changed: make(chan struct{})}
		p.hosts[host] = state
	}
	return state
}

func notifyHost(state *hostState) {
	close(state.changed)
	state.changed = make(chan struct{})
}

// AcquireConnection reserves one active connection slot for addr. The returned
// release function must be called when the client connection closes.
func (p *Pacer) AcquireConnection(ctx context.Context, addr string, limit int) (func(), error) {
	if p == nil {
		return func() {}, nil
	}
	if limit < 1 {
		limit = 1
	}
	host := hostKey(addr)
	for {
		p.mu.Lock()
		state := p.hostStateLocked(host)
		if state.activeConnections < limit {
			state.activeConnections++
			p.mu.Unlock()
			release := onceRelease(func() {
				p.mu.Lock()
				state.activeConnections--
				notifyHost(state)
				p.mu.Unlock()
			})
			if err := p.Wait(ctx, addr); err != nil {
				release()
				return nil, err
			}
			return release, nil
		}
		changed := state.changed
		p.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-changed:
		}
	}
}

// AcquireSync reserves a server-wide synchronization slot independently from
// connection slots. A throttled server temporarily receives fewer concurrent
// syncs until successful work gradually restores the configured limit.
func (p *Pacer) AcquireSync(ctx context.Context, addr string, limit int) (func(), error) {
	if p == nil {
		return func() {}, nil
	}
	if limit < 1 {
		limit = 1
	}
	host := hostKey(addr)
	for {
		p.mu.Lock()
		state := p.hostStateLocked(host)
		state.syncLimit = limit
		allowed := limit
		if state.adaptiveSyncLimit > 0 && state.adaptiveSyncLimit < allowed {
			allowed = state.adaptiveSyncLimit
		}
		now := time.Now()
		if state.activeSyncs < allowed && !now.Before(state.retryUntil) {
			state.activeSyncs++
			p.mu.Unlock()
			return onceRelease(func() {
				p.mu.Lock()
				state.activeSyncs--
				notifyHost(state)
				p.mu.Unlock()
			}), nil
		}
		changed := state.changed
		wait := time.Until(state.retryUntil)
		p.mu.Unlock()

		if wait <= 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-changed:
			}
			continue
		}
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-changed:
			timer.Stop()
		case <-timer.C:
		}
	}
}

// ReportRateLimit backs off the host and cuts its effective sync concurrency.
// The next successful syncs gradually restore the configured concurrency.
func (p *Pacer) ReportRateLimit(addr string) time.Duration {
	if p == nil {
		return time.Second
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	state := p.hostStateLocked(hostKey(addr))
	if state.syncLimit < 1 {
		state.syncLimit = 1
	}
	if state.adaptiveSyncLimit <= 0 || state.adaptiveSyncLimit > state.syncLimit {
		state.adaptiveSyncLimit = state.syncLimit
	}
	if state.adaptiveSyncLimit > 1 {
		state.adaptiveSyncLimit = (state.adaptiveSyncLimit + 1) / 2
	}
	if state.retryDelay < 15*time.Second {
		state.retryDelay = 15 * time.Second
	} else if state.retryDelay < 10*time.Minute {
		state.retryDelay *= 2
		if state.retryDelay > 10*time.Minute {
			state.retryDelay = 10 * time.Minute
		}
	}
	delay := jitter(state.retryDelay)
	state.retryUntil = time.Now().Add(delay)
	notifyHost(state)
	return delay
}

// ReportSuccess slowly restores a host's sync concurrency after throttling.
func (p *Pacer) ReportSuccess(addr string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	state := p.hostStateLocked(hostKey(addr))
	if state.adaptiveSyncLimit > 0 && state.adaptiveSyncLimit < state.syncLimit {
		state.adaptiveSyncLimit++
	}
	if state.retryDelay <= 15*time.Second {
		state.retryDelay = 0
	} else {
		state.retryDelay /= 2
	}
	if !time.Now().Before(state.retryUntil) {
		state.retryUntil = time.Time{}
	}
	notifyHost(state)
}

func onceRelease(release func()) func() {
	var once sync.Once
	return func() { once.Do(release) }
}

func jitter(delay time.Duration) time.Duration {
	spread := delay / 5
	if spread <= 0 {
		return delay
	}
	return delay - spread + time.Duration(rand.Int64N(int64(2*spread)+1))
}
