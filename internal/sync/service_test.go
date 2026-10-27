package sync

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mailquay/mailquay/internal/imapclient"
	"github.com/mailquay/mailquay/internal/netpace"
	"github.com/mailquay/mailquay/internal/settings"
	"github.com/mailquay/mailquay/internal/store/sqlcgen"
)

func TestDialIMAPHonorsPacingForInteractive(t *testing.T) {
	pacer := netpace.New(time.Hour)
	svc := &Service{pacer: pacer, settings: &settings.Service{}}
	addr := "127.0.0.1:1"
	if err := pacer.Wait(context.Background(), addr); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(netpace.WithInteractive(context.Background()), 30*time.Millisecond)
	defer cancel()
	_, err := svc.dialIMAP(ctx, imapclient.Config{
		Address: addr, Security: "none", Timeout: time.Second,
	})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("interactive dial error = %v, want pacing deadline", err)
	}
}

func TestMergeSyncRequestsDeduplicatesAndPromotesFullSync(t *testing.T) {
	firstMailbox, secondMailbox := uuid.New(), uuid.New()
	var pending []syncRequest
	mergeSyncRequest(&pending, syncRequest{mailboxID: firstMailbox, priority: 1})
	mergeSyncRequest(&pending, syncRequest{mailboxID: firstMailbox, priority: 3, manual: true})
	if len(pending) != 1 || pending[0].priority != 3 || !pending[0].manual {
		t.Fatalf("duplicate request merge = %+v", pending)
	}

	mergeSyncRequest(&pending, syncRequest{mailboxID: secondMailbox, priority: 2})
	mergeSyncRequest(&pending, syncRequest{priority: 2})
	if len(pending) != 1 || pending[0].mailboxID != uuid.Nil ||
		pending[0].priority != 3 || !pending[0].manual {
		t.Fatalf("full sync did not subsume mailbox requests: %+v", pending)
	}
	mergeSyncRequest(&pending, syncRequest{mailboxID: secondMailbox, priority: 3})
	if len(pending) != 1 || pending[0].mailboxID != uuid.Nil {
		t.Fatalf("mailbox request duplicated a pending full sync: %+v", pending)
	}
}

func TestMailboxSyncIntervalsAndJitter(t *testing.T) {
	values := settings.Defaults()
	if got := mailboxInterval(sqlcgen.Mailbox{Role: "inbox"}, values, false); got != 10*time.Minute {
		t.Fatalf("inbox interval = %v, want 10m", got)
	}
	if got := mailboxInterval(sqlcgen.Mailbox{Role: "inbox"}, values, true); got != 3*time.Minute {
		t.Fatalf("inbox interval without IDLE = %v, want 3m", got)
	}
	if got := mailboxInterval(sqlcgen.Mailbox{Role: "custom"}, values, true); got != 15*time.Minute {
		t.Fatalf("other mailbox interval = %v, want 15m", got)
	}
	for range 100 {
		got := jitterInterval(10 * time.Minute)
		if got < 9*time.Minute || got > 11*time.Minute {
			t.Fatalf("jitter interval = %v, want 9m–11m", got)
		}
	}
}

func TestIdleCapacityReservesConcurrentWorkerSlots(t *testing.T) {
	cases := []struct {
		accountCount    int
		perAccountLimit int
		perServerLimit  int
		syncLimit       int
		want            bool
	}{
		{accountCount: 1, perAccountLimit: 1, perServerLimit: 1, syncLimit: 2, want: true},
		{accountCount: 1, perAccountLimit: 2, perServerLimit: 1, syncLimit: 2, want: false},
		{accountCount: 3, perAccountLimit: 1, perServerLimit: 3, syncLimit: 2, want: true},
		{accountCount: 3, perAccountLimit: 2, perServerLimit: 4, syncLimit: 2, want: false},
		{accountCount: 3, perAccountLimit: 2, perServerLimit: 5, syncLimit: 2, want: true},
		{accountCount: 5, perAccountLimit: 2, perServerLimit: 7, syncLimit: 2, want: true},
	}
	for _, tc := range cases {
		if got := idleCapacityFits(tc.accountCount, tc.perAccountLimit, tc.perServerLimit, tc.syncLimit); got != tc.want {
			t.Errorf("idleCapacityFits(%d, %d, %d, %d) = %v, want %v",
				tc.accountCount, tc.perAccountLimit, tc.perServerLimit, tc.syncLimit, got, tc.want)
		}
	}
}

func TestMarkIdleUnsupportedShortensInboxPoll(t *testing.T) {
	svc := &Service{
		logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		noIdle:   make(map[uuid.UUID]bool),
		nextSync: make(map[uuid.UUID]time.Time),
		failures: make(map[uuid.UUID]int),
	}
	accountID, mailboxID := uuid.New(), uuid.New()
	inbox := sqlcgen.Mailbox{ID: mailboxID, AccountID: accountID, Role: "inbox"}
	later := time.Now().Add(10 * time.Minute)
	svc.nextSync[mailboxID] = later

	before := time.Now()
	svc.markIdleUnsupported(inbox, settings.Defaults())

	if !svc.noIdle[accountID] {
		t.Fatal("account was not marked as lacking IDLE")
	}
	next := svc.nextSync[mailboxID]
	// 180 seconds with the ±10% jitter never exceeds 198 seconds.
	if next.After(before.Add(199 * time.Second)) {
		t.Fatalf("next poll = %v, want at most 198s", next.Sub(before))
	}
	if next.Before(before) {
		t.Fatalf("next poll = %v, want a future time", next)
	}

	// An already sooner poll must not be pushed back by the probe.
	soon := time.Now().Add(time.Minute)
	svc.nextSync[mailboxID] = soon
	svc.markIdleUnsupported(inbox, settings.Defaults())
	if !svc.nextSync[mailboxID].Equal(soon) {
		t.Fatalf("next poll = %v, want the sooner %v", svc.nextSync[mailboxID], soon)
	}
}

func TestBackoffDelay(t *testing.T) {
	interval := 5 * time.Minute
	cases := []struct {
		failures int
		want     time.Duration
	}{
		{failures: 0, want: interval},
		{failures: 1, want: 2 * interval},
		{failures: 2, want: 4 * interval},
		{failures: 3, want: 8 * interval},
		{failures: 7, want: 8 * interval},
	}
	for _, tc := range cases {
		if got := backoffDelay(interval, tc.failures); got != tc.want {
			t.Fatalf("backoffDelay(%v, %d) = %v, want %v", interval, tc.failures, got, tc.want)
		}
	}
}
