package mailsession

import (
	"context"
	"errors"
	"time"

	"github.com/Yeqingky/MailQuay/internal/imapclient"
	"github.com/google/uuid"
)

// ErrIdleUnsupported reports that the server does not advertise IDLE.
var ErrIdleUnsupported = errors.New("mailsession: server does not support IDLE")

// Configure changes per-account connection limits and worker idle expiry.
func (p *Pool) Configure(maxConnections int, idleTimeout time.Duration) {
	if p == nil {
		return
	}
	if maxConnections < 1 {
		maxConnections = 1
	}
	if maxConnections > 3 {
		maxConnections = 3
	}
	if idleTimeout <= 0 {
		idleTimeout = 10 * time.Minute
	}

	p.mu.Lock()
	p.maxConnections = maxConnections
	p.idleTimeout = idleTimeout
	sessions := make([]*Session, 0, len(p.sessions))
	for _, session := range p.sessions {
		sessions = append(sessions, session)
	}
	p.mu.Unlock()

	if maxConnections < 2 {
		for _, session := range sessions {
			session.closeIdleConnection()
		}
	}
}

// MaxConnections returns the configured per-account connection ceiling.
func (p *Pool) MaxConnections() int {
	if p == nil {
		return 1
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.maxConnections
}

// RunIdleRound enters IDLE on an account session. With two or more permitted
// connections it uses the dedicated listener; with one it yields the worker
// connection whenever normal IMAP work arrives.
func (p *Pool) RunIdleRound(ctx context.Context, accountID uuid.UUID, mailboxPath string, timeout time.Duration, dial DialFunc) (changed, interrupted bool, err error) {
	if p == nil {
		return false, false, errors.New("mailsession: IDLE requires a connection pool")
	}
	session := p.session(accountID)
	if p.MaxConnections() == 1 {
		return session.runSharedIdle(ctx, dial, mailboxPath, timeout)
	}
	return session.runDedicatedIdle(ctx, dial, mailboxPath, timeout)
}

func (s *Session) runDedicatedIdle(ctx context.Context, dial DialFunc, mailboxPath string, timeout time.Duration) (bool, bool, error) {
	acquired, err := s.idleGate.acquire(ctx, false, 0)
	if err != nil {
		return false, false, err
	}
	if !acquired {
		return false, false, ErrBusy
	}
	defer s.idleGate.release()

	client, err := s.idleConn(ctx, dial)
	if err != nil {
		return false, false, err
	}
	if !client.SupportsIdle() {
		s.discardIdleConnection(client)
		return false, false, ErrIdleUnsupported
	}
	if _, err := client.Select(ctx, mailboxPath); err != nil {
		s.discardIdleConnection(client)
		return false, false, err
	}
	changed, interrupted, err := client.IdleInterruptible(ctx, timeout, nil)
	if err != nil {
		s.discardIdleConnection(client)
	}
	return changed, interrupted, err
}

func (s *Session) idleConn(ctx context.Context, dial DialFunc) (*imapclient.Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.idleClient != nil && !s.idleClient.Closed() {
		return s.idleClient, nil
	}
	if s.idleClient != nil {
		_ = s.idleClient.Close()
		s.idleClient = nil
	}
	client, err := dial(ctx, false)
	if err != nil {
		return nil, err
	}
	s.idleClient = client
	return client, nil
}

func (s *Session) discardIdleConnection(client *imapclient.Client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.idleClient == client {
		_ = s.idleClient.Close()
		s.idleClient = nil
	}
}

func (s *Session) closeIdleConnection() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.idleClient != nil {
		_ = s.idleClient.Close()
		s.idleClient = nil
	}
}

func (s *Session) runSharedIdle(ctx context.Context, dial DialFunc, mailboxPath string, timeout time.Duration) (bool, bool, error) {
	stop := make(chan struct{})
	s.mu.Lock()
	s.idleStop = stop
	s.mu.Unlock()

	acquired, err := s.gate.acquire(ctx, false, 0)
	if err != nil {
		s.clearSharedIdle(stop)
		return false, false, err
	}
	if !acquired {
		s.clearSharedIdle(stop)
		return false, false, ErrBusy
	}
	defer s.gate.release()

	select {
	case <-stop:
		s.clearSharedIdle(stop)
		return false, true, nil
	default:
	}
	client, err := s.conn(ctx, dial)
	if err != nil {
		s.clearSharedIdle(stop)
		return false, false, err
	}
	if !client.SupportsIdle() {
		s.clearSharedIdle(stop)
		s.finish(nil)
		return false, false, ErrIdleUnsupported
	}
	if _, err := client.Select(ctx, mailboxPath); err != nil {
		s.clearSharedIdle(stop)
		s.finish(err)
		return false, false, err
	}

	changed, interrupted, idleErr := client.IdleInterruptible(ctx, timeout, stop)
	s.clearSharedIdle(stop)
	s.finish(idleErr)
	return changed, interrupted, idleErr
}

func (s *Session) clearSharedIdle(stop chan struct{}) {
	s.mu.Lock()
	if s.idleStop == stop {
		s.idleStop = nil
	}
	s.mu.Unlock()
}

func (s *Session) stopSharedIdle() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stopSharedIdleLocked()
}

func (s *Session) stopSharedIdleLocked() {
	if s.idleStop != nil {
		close(s.idleStop)
		s.idleStop = nil
	}
}
