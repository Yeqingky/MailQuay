package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/mailquay/mailquay/internal/imapclient"
	"github.com/mailquay/mailquay/internal/mailsession"
	"github.com/mailquay/mailquay/internal/platform"
	"github.com/mailquay/mailquay/internal/settings"
	"github.com/mailquay/mailquay/internal/store/sqlcgen"
)

// opsWait bounds how long the background ops loop waits for the account
// session before it retries on the next tick.
const opsWait = 2 * time.Second

func (s *Service) opsWorker(ctx context.Context) {
	defer s.wg.Done()
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.processPendingOps(ctx)
		}
	}
}

func (s *Service) processPendingOps(ctx context.Context) {
	accounts, err := s.store.ListActiveAccounts(ctx)
	if err != nil {
		return
	}
	for _, acct := range accounts {
		switch acct.ReceiveProtocol {
		case "imap":
			if err := s.processAccountOps(ctx, acct); err != nil && !errors.Is(err, mailsession.ErrBusy) {
				s.logger.Debug("process pending ops", "account", acct.ID, "error", err)
			}
		case "pop3":
			if err := s.processPOP3AccountOps(ctx, acct); err != nil {
				s.logger.Debug("process pop3 ops", "account", acct.ID, "error", err)
			}
		}
	}
}

func (s *Service) processAccountOps(ctx context.Context, acct sqlcgen.Account) error {
	ops, err := s.store.ListPendingOps(ctx, sqlcgen.ListPendingOpsParams{AccountID: acct.ID, Limit: 50})
	if err != nil || len(ops) == 0 {
		return err
	}
	creds, err := s.accounts.Credentials(ctx, acct)
	if err != nil {
		return err
	}
	return s.sessions.TryDo(ctx, acct.ID, opsWait, s.imapDialer(acct, creds), func(ctx context.Context, client *imapclient.Client) error {
		return s.applyAccountOps(ctx, client, acct, ops)
	})
}

func (s *Service) applyAccountOps(ctx context.Context, client *imapclient.Client, acct sqlcgen.Account, ops []sqlcgen.PendingOp) error {
	selected := ""
	for _, op := range ops {
		if op.MailboxID == nil {
			continue
		}
		mb, err := s.store.GetMailbox(ctx, *op.MailboxID)
		if err != nil {
			_ = s.store.CompletePendingOp(ctx, op.ID)
			continue
		}
		if mb.SyncMode == "off" || mb.LocalOnly || mb.Role == "sent" {
			_ = s.store.CompletePendingOp(ctx, op.ID)
			continue
		}
		if selected != mb.Path {
			if _, err := client.Select(ctx, mb.Path); err != nil {
				s.retryOp(ctx, op, err)
				continue
			}
			selected = mb.Path
		}
		var execErr error
		switch op.Kind {
		case "flags":
			var payload struct {
				Add   bool     `json:"add"`
				Flags []string `json:"flags"`
			}
			_ = json.Unmarshal(op.Payload, &payload)
			if op.Uid == nil {
				execErr = errors.New("missing uid")
				break
			}
			execErr = client.StoreFlags(ctx, uint32(*op.Uid), payload.Flags, payload.Add)
		case "move":
			var payload struct {
				Dest string `json:"dest"`
			}
			_ = json.Unmarshal(op.Payload, &payload)
			if op.Uid == nil || payload.Dest == "" {
				execErr = errors.New("invalid move payload")
				break
			}
			if err := client.EnsureMailbox(ctx, payload.Dest); err != nil {
				execErr = err
				break
			}
			var destUID uint32
			destUID, execErr = client.Move(ctx, uint32(*op.Uid), payload.Dest)
			if execErr == nil && op.MessageID != nil {
				s.recordMovedMessage(ctx, *op.MessageID, destUID)
			}
		case "delete":
			if op.Uid == nil {
				execErr = errors.New("missing uid")
				break
			}
			if err := client.StoreFlags(ctx, uint32(*op.Uid), []string{"\\Deleted"}, true); err != nil {
				execErr = err
				break
			}
			execErr = client.Expunge(ctx, []uint32{uint32(*op.Uid)})
		default:
			execErr = fmt.Errorf("unsupported op %q", op.Kind)
		}
		if execErr != nil {
			s.retryOp(ctx, op, execErr)
			continue
		}
		if err := s.store.CompletePendingOp(ctx, op.ID); err != nil {
			s.logger.Warn("complete pending op", "op", op.ID, "error", err)
		}
	}
	return nil
}

// recordMovedMessage stores the destination UID reported by MOVE. Without it
// the moved row stays UID-less and the next destination sync inserts a second
// copy of the same message. A sync pass that ran while the move was in flight
// may already have inserted that copy, so rows sharing the destination UID are
// dropped here.
func (s *Service) recordMovedMessage(ctx context.Context, id uuid.UUID, destUID uint32) {
	if destUID == 0 {
		return
	}
	if err := s.store.UpdateMessageUID(ctx, sqlcgen.UpdateMessageUIDParams{
		ID: id, Uid: ptrInt64(int64(destUID)),
	}); err != nil {
		s.logger.Warn("record moved message uid", "message", id, "error", err)
		return
	}
	msg, err := s.store.GetMessage(ctx, id)
	if err != nil {
		s.logger.Debug("load moved message", "message", id, "error", err)
		return
	}
	dupes, err := s.store.ListMessagesByMailboxUID(ctx, sqlcgen.ListMessagesByMailboxUIDParams{
		MailboxID: msg.MailboxID, Uid: int64(destUID), ExcludeID: id,
	})
	if err != nil {
		s.logger.Warn("list moved duplicates", "message", id, "error", err)
		return
	}
	for _, dupe := range dupes {
		if err := s.messages.DeleteLocal(ctx, dupe); err != nil {
			s.logger.Warn("drop moved duplicate", "message", dupe.ID, "error", err)
		}
	}
	if len(dupes) > 0 {
		s.messages.RefreshMailboxCounts(ctx, msg.MailboxID)
	}
}

func (s *Service) retryOp(ctx context.Context, op sqlcgen.PendingOp, cause error) {
	attempts := int(op.Attempts) + 1
	if attempts >= 10 {
		_ = s.store.FailPendingOp(ctx, sqlcgen.FailPendingOpParams{
			ID: op.ID, Status: "failed", LastError: cause.Error(), NextAttemptAt: time.Now().UTC().Add(24 * time.Hour),
		})
		return
	}
	delay := platform.Backoff(attempts, 30*time.Second, 30*time.Minute)
	_ = s.store.FailPendingOp(ctx, sqlcgen.FailPendingOpParams{
		ID: op.ID, Status: "pending", LastError: cause.Error(), NextAttemptAt: time.Now().UTC().Add(delay),
	})
}

func (s *Service) startIdleWorker(parent context.Context, accountID uuid.UUID) {
	s.mu.Lock()
	if s.noIdle[accountID] || s.authBlocked[accountID] || s.autoBlocked[accountID] {
		s.mu.Unlock()
		return
	}
	if _, exists := s.idle[accountID]; exists {
		s.mu.Unlock()
		return
	}
	s.idleRunID[accountID]++
	runID := s.idleRunID[accountID]
	ctx, cancel := context.WithCancel(parent)
	s.idle[accountID] = cancel
	s.mu.Unlock()
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer func() {
			s.mu.Lock()
			if s.idleRunID[accountID] == runID {
				delete(s.idle, accountID)
			}
			s.mu.Unlock()
			cancel()
		}()
		s.idleLoop(ctx, accountID)
	}()
}

func (s *Service) idleLoop(ctx context.Context, accountID uuid.UUID) {
	acct, err := s.store.GetAccount(ctx, accountID)
	if err != nil || acct.DeletedAt != nil || !acct.SyncEnabled || acct.ReceiveProtocol != "imap" {
		return
	}
	creds, err := s.accounts.Credentials(ctx, acct)
	if err != nil {
		return
	}
	inbox, err := s.store.GetMailboxByRole(ctx, sqlcgen.GetMailboxByRoleParams{AccountID: acct.ID, Role: "inbox"})
	if err != nil {
		return
	}
	dial := s.imapDialer(acct, creds)
	backoff := 30 * time.Second
	for ctx.Err() == nil {
		values := s.settings.Current()
		if !values.RealTimeReceive {
			return
		}
		s.mu.Lock()
		blocked := s.authBlocked[accountID] || s.autoBlocked[accountID]
		s.mu.Unlock()
		if blocked {
			return
		}

		changed, _, err := s.sessions.RunIdleRound(ctx, acct.ID, inbox.Path, 25*time.Minute, dial)
		if errors.Is(err, mailsession.ErrIdleUnsupported) {
			s.markIdleUnsupported(inbox, values)
			return
		}
		if err != nil {
			if isRateLimitError(err) {
				backoff = max(backoff, s.pacer.ReportRateLimit(accountSyncAddress(acct)))
			}
			if errors.Is(err, imapclient.ErrAuthentication) {
				err = fmt.Errorf("%w; update the account credentials", err)
				s.setAccountError(ctx, accountID, err)
				s.mu.Lock()
				s.authBlocked[accountID] = true
				s.mu.Unlock()
				return
			}
			if !values.AutoReconnect {
				s.mu.Lock()
				s.autoBlocked[accountID] = true
				s.mu.Unlock()
				return
			}
			if !sleepCtx(ctx, jitterInterval(backoff)) {
				return
			}
			backoff = min(backoff*2, 10*time.Minute)
			continue
		}
		backoff = 30 * time.Second
		if changed {
			s.enqueueRequest(ctx, syncRequest{accountID: acct.ID, mailboxID: inbox.ID, priority: 2})
		}
	}
}

// markIdleUnsupported switches the account to polling with the dedicated
// interval. The probe runs while entering IDLE, so the capability is checked
// once per process; an account edit or restart probes the server again.
func (s *Service) markIdleUnsupported(inbox sqlcgen.Mailbox, values settings.Values) {
	interval := time.Duration(values.NoIdleSyncIntervalSeconds) * time.Second

	s.mu.Lock()
	s.noIdle[inbox.AccountID] = true
	next := time.Now().Add(jitterInterval(backoffDelay(interval, s.failures[inbox.AccountID])))
	if current, ok := s.nextSync[inbox.ID]; !ok || current.After(next) {
		s.nextSync[inbox.ID] = next
	}
	s.mu.Unlock()

	s.logger.Info("imap IDLE unsupported; polling inbox",
		"account", inbox.AccountID, "interval", interval)
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (s *Service) processPOP3AccountOps(ctx context.Context, acct sqlcgen.Account) error {
	ops, err := s.store.ListPendingOps(ctx, sqlcgen.ListPendingOpsParams{AccountID: acct.ID, Limit: 50})
	if err != nil || len(ops) == 0 {
		return err
	}
	deletions := make([]sqlcgen.PendingOp, 0, len(ops))
	for _, op := range ops {
		if op.Kind == "pop3_delete" {
			deletions = append(deletions, op)
		} else {
			_ = s.store.CompletePendingOp(ctx, op.ID)
		}
	}
	if len(deletions) == 0 {
		return nil
	}
	creds, err := s.accounts.Credentials(ctx, acct)
	if err != nil {
		return err
	}
	client, err := s.dialPOP3(ctx, s.pop3Config(acct, creds))
	if err != nil {
		return err
	}
	defer client.Close()
	infos, err := client.UIDL(ctx)
	if err != nil {
		return err
	}
	byUIDL := make(map[string]int, len(infos))
	for _, info := range infos {
		byUIDL[info.UIDL] = info.Number
	}
	comitted := false
	for _, op := range deletions {
		var payload struct {
			UIDL string `json:"uidl"`
		}
		_ = json.Unmarshal(op.Payload, &payload)
		number, ok := byUIDL[payload.UIDL]
		if !ok {
			_ = s.store.CompletePendingOp(ctx, op.ID)
			continue
		}
		if err := client.Delete(ctx, number); err != nil {
			s.retryOp(ctx, op, err)
			continue
		}
		comitted = true
	}
	if comitted {
		if err := client.Quit(ctx); err != nil {
			return err
		}
	}
	for _, op := range deletions {
		_ = s.store.CompletePendingOp(ctx, op.ID)
	}
	return nil
}
