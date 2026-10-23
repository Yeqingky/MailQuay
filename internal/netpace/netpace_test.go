package netpace

import (
	"context"
	"testing"
	"time"
)

func TestPacerSpacesSameHost(t *testing.T) {
	p := New(40 * time.Millisecond)
	ctx := context.Background()
	start := time.Now()
	for i := range 3 {
		if err := p.Wait(ctx, "imap.example.com:993"); err != nil {
			t.Fatalf("wait %d: %v", i, err)
		}
	}
	if elapsed := time.Since(start); elapsed < 70*time.Millisecond {
		t.Fatalf("paced waits returned after %v, want at least 70ms", elapsed)
	}
}

func TestPacerSeparatesHosts(t *testing.T) {
	p := New(200 * time.Millisecond)
	ctx := context.Background()
	if err := p.Wait(ctx, "a.example.com:993"); err != nil {
		t.Fatalf("host a wait: %v", err)
	}
	start := time.Now()
	if err := p.Wait(ctx, "b.example.com:993"); err != nil {
		t.Fatalf("host b wait: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 150*time.Millisecond {
		t.Fatalf("unrelated host waited %v", elapsed)
	}
	if err := p.Wait(ctx, "a.example.com:993"); err != nil {
		t.Fatalf("host a second wait: %v", err)
	}
	if elapsed := time.Since(start); elapsed < 150*time.Millisecond {
		t.Fatalf("same host reused its slot after %v", elapsed)
	}
}

func TestPacerContextCanceled(t *testing.T) {
	p := New(time.Hour)
	ctx := context.Background()
	if err := p.Wait(ctx, "imap.example.com:993"); err != nil {
		t.Fatalf("first wait: %v", err)
	}
	waitCtx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := p.Wait(waitCtx, "imap.example.com:993"); err == nil {
		t.Fatal("wait returned nil for canceled context")
	}
}

func TestNilPacerDoesNotBlock(t *testing.T) {
	var p *Pacer
	if err := p.Wait(context.Background(), "imap.example.com:993"); err != nil {
		t.Fatalf("nil pacer wait: %v", err)
	}
	if interval := p.Interval(); interval != 0 {
		t.Fatalf("nil pacer interval = %v", interval)
	}
}

func TestHostKeyIgnoresPort(t *testing.T) {
	if a, b := hostKey("IMAP.Example.com:993"), hostKey("imap.example.com:143"); a != b {
		t.Fatalf("host keys differ: %q vs %q", a, b)
	}
}

func TestConnectionLimitIsSharedAcrossPortsAndReleased(t *testing.T) {
	p := New(0)
	release, err := p.AcquireConnection(context.Background(), "imap.example.com:993", 1)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err := p.AcquireConnection(ctx, "imap.example.com:143", 1); err != context.DeadlineExceeded {
		t.Fatalf("second connection error = %v, want deadline exceeded", err)
	}
	release()
	releaseAgain, err := p.AcquireConnection(context.Background(), "imap.example.com:143", 1)
	if err != nil {
		t.Fatalf("connection slot was not released: %v", err)
	}
	releaseAgain()
}

func TestSyncLimitIsIndependentAndAdaptsAfterThrottling(t *testing.T) {
	p := New(0)
	releaseSync, err := p.AcquireSync(context.Background(), "imap.example.com:993", 4)
	if err != nil {
		t.Fatal(err)
	}
	releaseConn, err := p.AcquireConnection(context.Background(), "imap.example.com:993", 1)
	if err != nil {
		t.Fatalf("connection limit shared sync slots: %v", err)
	}
	releaseConn()
	p.ReportRateLimit("imap.example.com:143")
	releaseSync()

	p.mu.Lock()
	state := p.hosts["imap.example.com"]
	if state == nil || state.adaptiveSyncLimit != 2 {
		p.mu.Unlock()
		t.Fatalf("adaptive sync limit = %v, want 2", state)
	}
	p.mu.Unlock()

	p.ReportSuccess("imap.example.com:993")
	p.mu.Lock()
	state = p.hosts["imap.example.com"]
	got := state.adaptiveSyncLimit
	p.mu.Unlock()
	if got != 3 {
		t.Fatalf("successful sync restored limit to %d, want 3", got)
	}
}

func TestServerSyncConcurrencyIsSharedAcrossPorts(t *testing.T) {
	p := New(0)
	release, err := p.AcquireSync(context.Background(), "imap.example.com:993", 1)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err := p.AcquireSync(ctx, "imap.example.com:143", 1); err != context.DeadlineExceeded {
		t.Fatalf("second sync error = %v, want deadline exceeded", err)
	}
	release()
	releaseAgain, err := p.AcquireSync(context.Background(), "imap.example.com:143", 1)
	if err != nil {
		t.Fatalf("sync slot was not released: %v", err)
	}
	releaseAgain()
}

func TestInteractiveMarker(t *testing.T) {
	if IsInteractive(context.Background()) {
		t.Fatal("background context reported as interactive")
	}
	if !IsInteractive(WithInteractive(context.Background())) {
		t.Fatal("marked context not reported as interactive")
	}
}
