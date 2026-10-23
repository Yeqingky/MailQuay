package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/mailquay/mailquay/internal/account"
	"github.com/mailquay/mailquay/internal/config"
	"github.com/mailquay/mailquay/internal/events"
	"github.com/mailquay/mailquay/internal/imapclient"
	"github.com/mailquay/mailquay/internal/mailbox"
	"github.com/mailquay/mailquay/internal/mailsession"
	"github.com/mailquay/mailquay/internal/message"
	"github.com/mailquay/mailquay/internal/netpace"
	"github.com/mailquay/mailquay/internal/platform"
	"github.com/mailquay/mailquay/internal/pop3client"
	"github.com/mailquay/mailquay/internal/settings"
	"github.com/mailquay/mailquay/internal/storage"
	"github.com/mailquay/mailquay/internal/store"
	"github.com/mailquay/mailquay/internal/store/sqlcgen"
)

// Service runs account synchronization, content fetching and remote operations.
type Service struct {
	store     *store.Store
	cfg       *config.Config
	logger    *slog.Logger
	hub       *events.Hub
	storage   *storage.Store
	accounts  *account.Service
	mailboxes *mailbox.Service
	messages  *message.Service
	settings  *settings.Service
	pacer     *netpace.Pacer
	sessions  *mailsession.Pool

	fetchLim *limiter
	syncLim  *limiter

	mu          sync.Mutex
	failures    map[uuid.UUID]int
	workers     map[uuid.UUID]context.CancelFunc
	queues      map[uuid.UUID]*accountQueue
	idle        map[uuid.UUID]context.CancelFunc
	noIdle      map[uuid.UUID]bool
	idleRunID   map[uuid.UUID]uint64
	authBlocked map[uuid.UUID]bool
	autoBlocked map[uuid.UUID]bool
	nextSync    map[uuid.UUID]time.Time
	taskIDs     map[string]uuid.UUID
	trigger     chan syncRequest
	bodyCh      chan bodyRequest
	ctx         context.Context
	stopOnce    sync.Once
	cancel      context.CancelFunc
	wg          sync.WaitGroup
}

type syncRequest struct {
	accountID uuid.UUID
	mailboxID uuid.UUID
	priority  int
	manual    bool
}

type accountQueue struct {
	pending        []syncRequest
	dirty          []syncRequest
	running        bool
	runningMailbox uuid.UUID
}

type bodyRequest struct {
	messageID uuid.UUID
	force     bool
}

// NewService wires the synchronization service.
func NewService(st *store.Store, cfg *config.Config, logger *slog.Logger, hub *events.Hub,
	blobs *storage.Store, accounts *account.Service, mailboxes *mailbox.Service,
	messages *message.Service, settingsSvc *settings.Service, pacer *netpace.Pacer,
	sessions *mailsession.Pool) *Service {
	syncN := 2
	fetchN := 4
	if snap, err := settingsSvc.Get(context.Background()); err == nil {
		syncN = snap.Effective.SyncConcurrency
		fetchN = snap.Effective.FetchConcurrency
	}
	return &Service{
		store: st, cfg: cfg, logger: logger, hub: hub, storage: blobs,
		accounts: accounts, mailboxes: mailboxes, messages: messages, settings: settingsSvc,
		pacer:    pacer,
		sessions: sessions,
		fetchLim: newLimiter(fetchN), syncLim: newLimiter(syncN),
		workers: make(map[uuid.UUID]context.CancelFunc), queues: make(map[uuid.UUID]*accountQueue),
		failures: make(map[uuid.UUID]int), idle: make(map[uuid.UUID]context.CancelFunc),
		authBlocked: make(map[uuid.UUID]bool), autoBlocked: make(map[uuid.UUID]bool),
		noIdle: make(map[uuid.UUID]bool), idleRunID: make(map[uuid.UUID]uint64),
		nextSync: make(map[uuid.UUID]time.Time), taskIDs: make(map[string]uuid.UUID),
		trigger: make(chan syncRequest, 512), bodyCh: make(chan bodyRequest, 512),
	}
}

// Start launches the scheduler, operation workers and background loops.
func (s *Service) Start(parent context.Context) {
	ctx, cancel := context.WithCancel(parent)
	s.mu.Lock()
	s.ctx = ctx
	s.cancel = cancel
	s.mu.Unlock()
	s.messages.SetContent(s)
	s.wg.Add(1)
	go s.scheduler(ctx)
	s.wg.Add(1)
	go s.bodyWorker(ctx)
	s.wg.Add(1)
	go s.opsWorker(ctx)
}

// Stop terminates all workers.
func (s *Service) Stop() {
	s.stopOnce.Do(func() {
		if s.cancel != nil {
			s.cancel()
		}
		s.mu.Lock()
		for _, cancel := range s.workers {
			cancel()
		}
		for _, cancel := range s.idle {
			cancel()
		}
		s.mu.Unlock()
		s.wg.Wait()
	})
}

// SyncNow synchronizes one account synchronously (used by integration tests).
func (s *Service) SyncNow(ctx context.Context, accountID uuid.UUID) error {
	return s.runSyncRequest(ctx, syncRequest{accountID: accountID, priority: 2, manual: true})
}

// ProcessOpsNow applies queued remote operations for one account
// synchronously (used by integration tests and manual triggers).
func (s *Service) ProcessOpsNow(ctx context.Context, accountID uuid.UUID) error {
	acct, err := s.store.GetAccount(ctx, accountID)
	if err != nil {
		return err
	}
	switch acct.ReceiveProtocol {
	case "imap":
		if err := s.processAccountOps(ctx, acct); err != nil && !errors.Is(err, mailsession.ErrBusy) {
			return err
		}
	case "pop3":
		if err := s.processPOP3AccountOps(ctx, acct); err != nil {
			return err
		}
	}
	return nil
}

// TriggerAccount requests an immediate full sync.
func (s *Service) TriggerAccount(id uuid.UUID) {
	s.mu.Lock()
	ctx := s.ctx
	s.mu.Unlock()
	if ctx == nil {
		return
	}
	select {
	case s.trigger <- syncRequest{accountID: id, priority: 2, manual: true}:
	case <-ctx.Done():
	}
}

// TriggerMailbox requests a high-priority sync of one mailbox.
func (s *Service) TriggerMailbox(ctx context.Context, mailboxID uuid.UUID) error {
	mb, err := s.store.GetMailbox(ctx, mailboxID)
	if err != nil {
		return err
	}
	s.mu.Lock()
	root := s.ctx
	s.mu.Unlock()
	if root == nil {
		return errors.New("sync service is not started")
	}
	select {
	case s.trigger <- syncRequest{accountID: mb.AccountID, mailboxID: mailboxID, priority: 3, manual: true}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-root.Done():
		return root.Err()
	}
}

// ForgetAccount closes its connections and cancels queued work.
func (s *Service) ForgetAccount(accountID uuid.UUID) {
	s.stopIdleWorker(accountID)
	s.mu.Lock()
	cancel := s.workers[accountID]
	delete(s.authBlocked, accountID)
	delete(s.autoBlocked, accountID)
	delete(s.noIdle, accountID)
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	s.sessions.Drop(accountID)
}

// AccountUpdated drops stale credentials and retries the account sync.
func (s *Service) AccountUpdated(accountID uuid.UUID) {
	s.stopIdleWorker(accountID)
	s.sessions.Drop(accountID)
	s.mu.Lock()
	delete(s.authBlocked, accountID)
	delete(s.autoBlocked, accountID)
	delete(s.noIdle, accountID)
	s.mu.Unlock()
	s.TriggerAccount(accountID)
}

// ReconcileScope applies range and download-scope changes after an account edit.
func (s *Service) ReconcileScope(ctx context.Context, accountID uuid.UUID) {
	s.sessions.Drop(accountID)
	if err := s.startTask(ctx, "scope_reconcile", &accountID, 0, 0, "reconciling scope"); err != nil {
		s.logger.Warn("start reconcile task", "account", accountID, "error", err)
	}
	s.TriggerAccount(accountID)
}

func (s *Service) scheduler(ctx context.Context) {
	defer s.wg.Done()
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	purgeTicker := time.NewTicker(time.Hour)
	defer purgeTicker.Stop()
	s.purgeExpiredTasks(ctx)
	s.triggerDue(ctx, true)
	for {
		select {
		case <-ctx.Done():
			return
		case req := <-s.trigger:
			s.enqueueRequest(ctx, req)
		case <-ticker.C:
			s.triggerDue(ctx, false)
		case <-purgeTicker.C:
			s.purgeExpiredTasks(ctx)
		}
	}
}

// purgeExpiredTasks drops task records older than the 24 hour log window.
func (s *Service) purgeExpiredTasks(ctx context.Context) {
	if err := s.store.PurgeExpiredTasks(ctx); err != nil {
		s.logger.Warn("purge expired tasks", "error", err)
	}
}

func (s *Service) triggerDue(ctx context.Context, startup bool) {
	accounts, err := s.store.ListActiveAccounts(ctx)
	if err != nil {
		s.logger.Warn("list active accounts", "error", err)
		return
	}
	values := s.settings.Current()
	idleAccountsByHost := make(map[string]int)
	for _, acct := range accounts {
		if acct.SyncEnabled && acct.ReceiveProtocol == "imap" {
			idleAccountsByHost[accountSyncHost(acct)]++
		}
	}
	now := time.Now()
	for _, acct := range accounts {
		if !acct.SyncEnabled {
			continue
		}
		if values.AutoReconnect {
			s.mu.Lock()
			delete(s.autoBlocked, acct.ID)
			s.mu.Unlock()
		}
		if acct.ReceiveProtocol == "imap" {
			if values.RealTimeReceive && idleCapacityFits(
				idleAccountsByHost[accountSyncHost(acct)],
				values.MaxIMAPConnectionsPerAccount,
				values.MaxIMAPConnectionsPerServer,
				values.MaxConcurrentSyncsPerServer,
			) {
				s.startIdleWorker(ctx, acct.ID)
			} else {
				s.stopIdleWorker(acct.ID)
			}
			mailboxes, err := s.mailboxes.List(ctx, acct.ID)
			if err != nil {
				s.logger.Warn("list mailboxes for sync", "account", acct.ID, "error", err)
				continue
			}
			if startup {
				for _, mb := range mailboxes {
					if !eligibleMailbox(mb, values) {
						continue
					}
					s.setNextMailboxSync(mb, values, now)
				}
				if values.StartupSync {
					s.enqueueRequest(ctx, syncRequest{accountID: acct.ID, priority: 2})
				}
				continue
			}
			if !values.AutoSync {
				continue
			}
			for _, mb := range mailboxes {
				if !eligibleMailbox(mb, values) || !s.mailboxDue(mb, values, now) {
					continue
				}
				s.setNextMailboxSync(mb, values, now)
				s.enqueueRequest(ctx, syncRequest{accountID: acct.ID, mailboxID: mb.ID, priority: 1})
			}
			continue
		}

		if startup {
			s.setNextAccountSync(acct.ID, time.Duration(values.POP3IntervalSeconds)*time.Second, now)
			if values.StartupSync {
				s.enqueueRequest(ctx, syncRequest{accountID: acct.ID, priority: 2})
			}
			continue
		}
		if !values.AutoSync || !s.accountDue(acct.ID, now) {
			continue
		}
		s.setNextAccountSync(acct.ID, time.Duration(values.POP3IntervalSeconds)*time.Second, now)
		s.enqueueRequest(ctx, syncRequest{accountID: acct.ID, priority: 1})
	}
}

func eligibleMailbox(mb sqlcgen.Mailbox, values settings.Values) bool {
	return !mb.LocalOnly && mb.SyncMode != "off" && mb.Role != "drafts" &&
		(mb.Role != "sent" || values.SentSyncMode != "off")
}

func (s *Service) mailboxDue(mb sqlcgen.Mailbox, values settings.Values, now time.Time) bool {
	s.mu.Lock()
	next, scheduled := s.nextSync[mb.ID]
	failures := s.failures[mb.AccountID]
	s.mu.Unlock()
	if scheduled {
		return !now.Before(next)
	}
	if mb.LastSyncedAt == nil {
		return true
	}
	return now.Sub(*mb.LastSyncedAt) >= backoffDelay(mailboxInterval(mb, values), failures)
}

func mailboxInterval(mb sqlcgen.Mailbox, values settings.Values) time.Duration {
	if mb.Role == "inbox" {
		return time.Duration(values.SyncIntervalSeconds) * time.Second
	}
	return time.Duration(values.OtherMailboxSyncIntervalSeconds) * time.Second
}

func (s *Service) setNextMailboxSync(mb sqlcgen.Mailbox, values settings.Values, now time.Time) {
	s.mu.Lock()
	interval := backoffDelay(mailboxInterval(mb, values), s.failures[mb.AccountID])
	s.nextSync[mb.ID] = now.Add(jitterInterval(interval))
	s.mu.Unlock()
}

func (s *Service) accountDue(accountID uuid.UUID, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	next, ok := s.nextSync[accountID]
	return !ok || !now.Before(next)
}

func (s *Service) setNextAccountSync(accountID uuid.UUID, interval time.Duration, now time.Time) {
	s.mu.Lock()
	interval = backoffDelay(interval, s.failures[accountID])
	s.nextSync[accountID] = now.Add(jitterInterval(interval))
	s.mu.Unlock()
}

func jitterInterval(interval time.Duration) time.Duration {
	if interval <= 0 {
		return 0
	}
	spread := interval / 10
	if spread <= 0 {
		return interval
	}
	return interval - spread + time.Duration(rand.Int64N(int64(2*spread)+1))
}

func (s *Service) stopIdleWorker(accountID uuid.UUID) {
	s.mu.Lock()
	cancel := s.idle[accountID]
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (s *Service) enqueueRequest(parent context.Context, req syncRequest) {
	if req.accountID == uuid.Nil || parent.Err() != nil {
		return
	}
	s.mu.Lock()
	queue := s.queues[req.accountID]
	if queue == nil {
		queue = &accountQueue{}
		s.queues[req.accountID] = queue
	}
	if req.manual {
		delete(s.authBlocked, req.accountID)
		delete(s.autoBlocked, req.accountID)
	}
	if queue.running && (req.mailboxID == queue.runningMailbox || queue.runningMailbox == uuid.Nil || req.mailboxID == uuid.Nil) {
		mergeSyncRequest(&queue.dirty, req)
	} else {
		mergeSyncRequest(&queue.pending, req)
	}
	if _, running := s.workers[req.accountID]; running {
		s.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(parent)
	s.workers[req.accountID] = cancel
	s.mu.Unlock()
	s.wg.Add(1)
	go s.runAccountQueue(ctx, req.accountID)
}

func mergeSyncRequest(queue *[]syncRequest, req syncRequest) {
	for i, pending := range *queue {
		if pending.mailboxID == uuid.Nil {
			if req.priority > pending.priority {
				(*queue)[i].priority = req.priority
			}
			(*queue)[i].manual = pending.manual || req.manual
			return
		}
		if pending.mailboxID == req.mailboxID {
			if req.priority > pending.priority {
				(*queue)[i].priority = req.priority
			}
			(*queue)[i].manual = pending.manual || req.manual
			return
		}
	}
	if req.mailboxID == uuid.Nil {
		for _, pending := range *queue {
			if pending.priority > req.priority {
				req.priority = pending.priority
			}
			req.manual = req.manual || pending.manual
		}
		*queue = []syncRequest{req}
		return
	}
	*queue = append(*queue, req)
}

func popSyncRequest(queue *[]syncRequest) (syncRequest, bool) {
	if len(*queue) == 0 {
		return syncRequest{}, false
	}
	best := 0
	for i := 1; i < len(*queue); i++ {
		if (*queue)[i].priority > (*queue)[best].priority {
			best = i
		}
	}
	req := (*queue)[best]
	copy((*queue)[best:], (*queue)[best+1:])
	*queue = (*queue)[:len(*queue)-1]
	return req, true
}

func (s *Service) runAccountQueue(ctx context.Context, accountID uuid.UUID) {
	defer s.wg.Done()
	for ctx.Err() == nil {
		s.mu.Lock()
		queue := s.queues[accountID]
		if queue == nil {
			cancel := s.workers[accountID]
			delete(s.workers, accountID)
			s.mu.Unlock()
			if cancel != nil {
				cancel()
			}
			return
		}
		req, ok := popSyncRequest(&queue.pending)
		if !ok {
			cancel := s.workers[accountID]
			delete(s.workers, accountID)
			delete(s.queues, accountID)
			s.mu.Unlock()
			if cancel != nil {
				cancel()
			}
			return
		}
		queue.running = true
		queue.runningMailbox = req.mailboxID
		blocked := !req.manual && (s.authBlocked[accountID] || s.autoBlocked[accountID])
		s.mu.Unlock()

		if !blocked {
			if snap, err := s.settings.Get(ctx); err == nil {
				s.syncLim.setLimit(snap.Effective.SyncConcurrency)
				s.fetchLim.setLimit(snap.Effective.FetchConcurrency)
			}
			if s.syncLim.acquire(ctx) {
				err := s.runSyncRequest(ctx, req)
				s.syncLim.release()
				if err != nil {
					s.logger.Warn("sync account", "account", accountID, "error", err)
					s.recordSyncFailure(accountID)
					s.updateRetryState(ctx, accountID, req, err)
				} else {
					s.recordSyncSuccess(accountID)
					s.updateNextSync(ctx, req)
				}
			}
		}

		s.mu.Lock()
		queue.running = false
		queue.runningMailbox = uuid.Nil
		for _, dirty := range queue.dirty {
			mergeSyncRequest(&queue.pending, dirty)
		}
		queue.dirty = nil
		s.mu.Unlock()
	}

	s.mu.Lock()
	cancel := s.workers[accountID]
	delete(s.workers, accountID)
	delete(s.queues, accountID)
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (s *Service) updateRetryState(ctx context.Context, accountID uuid.UUID, req syncRequest, cause error) {
	if ctx.Err() != nil {
		return
	}
	s.mu.Lock()
	if errors.Is(cause, imapclient.ErrAuthentication) {
		s.authBlocked[accountID] = true
	} else if !s.settings.Current().AutoReconnect {
		s.autoBlocked[accountID] = true
	}
	s.mu.Unlock()
	s.updateNextSync(ctx, req)
}

func (s *Service) updateNextSync(ctx context.Context, req syncRequest) {
	values := s.settings.Current()
	now := time.Now()
	if req.mailboxID != uuid.Nil {
		if mb, err := s.mailboxes.Get(ctx, req.mailboxID); err == nil {
			s.setNextMailboxSync(mb, values, now)
		}
		return
	}
	acct, err := s.store.GetAccount(ctx, req.accountID)
	if err != nil {
		return
	}
	if acct.ReceiveProtocol == "pop3" {
		s.setNextAccountSync(req.accountID, time.Duration(values.POP3IntervalSeconds)*time.Second, now)
		return
	}
	mailboxes, err := s.mailboxes.List(ctx, req.accountID)
	if err != nil {
		return
	}
	for _, mb := range mailboxes {
		if eligibleMailbox(mb, values) {
			s.setNextMailboxSync(mb, values, now)
		}
	}
}

func (s *Service) recordSyncFailure(accountID uuid.UUID) {
	s.mu.Lock()
	if s.failures[accountID] < 8 {
		s.failures[accountID]++
	}
	s.mu.Unlock()
}

func (s *Service) recordSyncSuccess(accountID uuid.UUID) {
	s.mu.Lock()
	delete(s.failures, accountID)
	s.mu.Unlock()
}

// backoffDelay stretches the scheduled sync interval after consecutive
// failures so an unreachable or throttled provider is not reconnected on every
// tick. The multiplier is capped at 8x the configured interval.
func backoffDelay(interval time.Duration, failures int) time.Duration {
	if failures <= 0 {
		return interval
	}
	if failures > 3 {
		failures = 3
	}
	return interval * time.Duration(1<<failures)
}

func (s *Service) runSyncRequest(ctx context.Context, req syncRequest) error {
	acct, err := s.store.GetAccount(ctx, req.accountID)
	if err != nil {
		return fmt.Errorf("load account: %w", err)
	}
	if acct.DeletedAt != nil || !acct.SyncEnabled {
		return nil
	}
	host := accountSyncAddress(acct)
	values := s.settings.Current()
	release, err := s.pacer.AcquireSync(ctx, host, values.MaxConcurrentSyncsPerServer)
	if err != nil {
		return err
	}
	defer release()

	creds, err := s.accounts.Credentials(ctx, acct)
	if err != nil {
		s.setAccountError(ctx, acct.ID, err)
		return err
	}
	s.runScopeReconcile(ctx, acct)
	var syncErr error
	switch acct.ReceiveProtocol {
	case "imap":
		syncErr = s.syncIMAPAccount(ctx, acct, creds, req.mailboxID)
	case "pop3":
		if req.mailboxID != uuid.Nil {
			return errors.New("POP3 accounts do not have remote mailboxes")
		}
		syncErr = s.syncPOP3(ctx, acct, creds)
	default:
		syncErr = fmt.Errorf("unsupported protocol %q", acct.ReceiveProtocol)
	}
	if syncErr != nil {
		if isRateLimitError(syncErr) {
			delay := s.pacer.ReportRateLimit(host)
			s.logger.Warn("mail server throttled sync", "account", acct.ID, "retry_after", delay, "error", syncErr)
		}
		if errors.Is(syncErr, imapclient.ErrAuthentication) {
			syncErr = fmt.Errorf("%w; update the account credentials", syncErr)
		}
		s.setAccountError(ctx, acct.ID, syncErr)
		s.failTaskForAccount(ctx, "initial_sync", acct.ID, syncErr)
		s.failTaskForAccount(ctx, "mailbox_sync", acct.ID, syncErr)
		return syncErr
	}
	s.pacer.ReportSuccess(host)
	_ = s.store.SetAccountState(ctx, sqlcgen.SetAccountStateParams{ID: acct.ID, SyncState: "connected", LastError: ""})
	return nil
}

func accountSyncAddress(acct sqlcgen.Account) string {
	if acct.ReceiveProtocol == "imap" && acct.ImapAddr != nil {
		return *acct.ImapAddr
	}
	if acct.Pop3Addr != nil {
		return *acct.Pop3Addr
	}
	return ""
}

func accountSyncHost(acct sqlcgen.Account) string {
	addr := accountSyncAddress(acct)
	if host, _, err := net.SplitHostPort(addr); err == nil {
		addr = host
	}
	return strings.ToLower(addr)
}

// idleCapacityFits reserves one listener per account plus the configured
// concurrent worker slots when dedicated worker connections are available.
func idleCapacityFits(accountCount, perAccountLimit, perServerLimit, syncLimit int) bool {
	if accountCount < 1 || perServerLimit < accountCount {
		return false
	}
	if perAccountLimit < 2 {
		return true
	}
	workerSlots := min(accountCount, syncLimit)
	return accountCount+workerSlots <= perServerLimit
}

func isRateLimitError(err error) bool {
	message := strings.ToLower(err.Error())
	for _, phrase := range []string{"too many connections", "connection limit", "rate limit", "rate exceeded", "throttl"} {
		if strings.Contains(message, phrase) {
			return true
		}
	}
	return false
}

// syncIMAPAccount retries a dropped connection once after randomized backoff.
func (s *Service) syncIMAPAccount(ctx context.Context, acct sqlcgen.Account, creds account.Credentials, mailboxID uuid.UUID) error {
	dial := s.imapDialer(acct, creds)
	attempt := func(retryable bool) error {
		return s.sessions.Do(ctx, acct.ID, false, dial, func(ctx context.Context, client *imapclient.Client) error {
			return s.syncIMAP(ctx, client, acct, mailboxID, retryable)
		})
	}
	err := attempt(true)
	if err == nil || !errors.Is(err, errConnectionLost) || ctx.Err() != nil || !s.settings.Current().AutoReconnect {
		return err
	}
	s.mu.Lock()
	failures := s.failures[acct.ID]
	s.mu.Unlock()
	delay := jitterInterval(backoffDelay(2*time.Second, failures))
	s.logger.Info("imap connection lost during sync; retrying", "account", acct.ID, "retry_after", delay)
	if !sleepCtx(ctx, delay) {
		return ctx.Err()
	}
	return attempt(false)
}

// imapDialer routes both listener and worker connections through server-wide
// connection accounting and connection-attempt pacing.
func (s *Service) imapDialer(acct sqlcgen.Account, creds account.Credentials) mailsession.DialFunc {
	cfg := s.imapConfig(acct, creds)
	return func(ctx context.Context, _ bool) (*imapclient.Client, error) {
		return s.dialIMAP(ctx, cfg)
	}
}

func (s *Service) dialIMAP(ctx context.Context, cfg imapclient.Config) (*imapclient.Client, error) {
	limit := s.settings.Current().MaxIMAPConnectionsPerServer
	release, err := s.pacer.AcquireConnection(ctx, cfg.Address, limit)
	if err != nil {
		return nil, err
	}
	client, err := imapclient.Dial(ctx, cfg)
	if err != nil {
		release()
		return nil, err
	}
	client.SetCloseHook(release)
	return client, nil
}

// dialPOP3 is the POP3 counterpart of dialIMAP.
func (s *Service) dialPOP3(ctx context.Context, cfg pop3client.Config) (*pop3client.Client, error) {
	if !netpace.IsInteractive(ctx) {
		if err := s.pacer.Wait(ctx, cfg.Address); err != nil {
			return nil, err
		}
	}
	return pop3client.Dial(ctx, cfg)
}

func (s *Service) setAccountError(ctx context.Context, accountID uuid.UUID, cause error) {
	_ = s.store.SetAccountState(ctx, sqlcgen.SetAccountStateParams{ID: accountID, SyncState: "error", LastError: cause.Error()})
	s.hub.Publish("account.updated", map[string]any{"accountId": accountID.String(), "state": "error", "error": cause.Error()})
}

func (s *Service) taskKey(typ string, accountID *uuid.UUID) string {
	if accountID == nil {
		return typ
	}
	return typ + ":" + accountID.String()
}

func (s *Service) startTask(ctx context.Context, typ string, accountID *uuid.UUID, done, total int32, msg string) error {
	now := time.Now().UTC()
	task, err := s.store.RestartFailedTask(ctx, sqlcgen.RestartFailedTaskParams{
		Done: done, Total: total, Message: msg, StartedAt: &now, Type: typ, AccountID: accountID,
	})
	if err != nil {
		task, err = s.store.UpsertTask(ctx, sqlcgen.UpsertTaskParams{
			ID: uuid.MustParse(platform.NewID()), Type: typ, AccountID: accountID,
			Status: "running", Done: done, Total: total, Unit: "messages", Message: msg, StartedAt: &now,
		})
	}
	if err != nil {
		return fmt.Errorf("upsert task: %w", err)
	}
	s.mu.Lock()
	s.taskIDs[s.taskKey(typ, accountID)] = task.ID
	s.mu.Unlock()
	s.publishTask(task)
	return nil
}

func (s *Service) updateTask(ctx context.Context, typ string, accountID *uuid.UUID, done, total int32, msg string) {
	s.mu.Lock()
	id, ok := s.taskIDs[s.taskKey(typ, accountID)]
	s.mu.Unlock()
	if !ok {
		if err := s.startTask(ctx, typ, accountID, done, total, msg); err != nil {
			s.logger.Debug("start task", "type", typ, "error", err)
		}
		return
	}
	if err := s.store.UpdateTaskProgress(ctx, sqlcgen.UpdateTaskProgressParams{ID: id, Done: done, Total: total, Message: msg}); err != nil {
		s.logger.Debug("update task", "type", typ, "error", err)
		return
	}
	s.publishTaskID(ctx, id)
}

func (s *Service) completeTask(ctx context.Context, typ string, accountID *uuid.UUID) {
	s.mu.Lock()
	id, ok := s.taskIDs[s.taskKey(typ, accountID)]
	delete(s.taskIDs, s.taskKey(typ, accountID))
	s.mu.Unlock()
	if !ok {
		return
	}
	if err := s.store.CompleteTask(ctx, id); err != nil {
		s.logger.Debug("complete task", "error", err)
		return
	}
	s.publishTaskID(ctx, id)
	s.hub.Publish("task.removed", map[string]any{"taskId": id.String()})
}

func (s *Service) failTaskForAccount(ctx context.Context, typ string, accountID uuid.UUID, cause error) {
	s.mu.Lock()
	id, ok := s.taskIDs[s.taskKey(typ, &accountID)]
	delete(s.taskIDs, s.taskKey(typ, &accountID))
	s.mu.Unlock()
	if !ok {
		return
	}
	_ = s.store.FailTask(ctx, sqlcgen.FailTaskParams{ID: id, Error: cause.Error()})
	s.publishTaskID(ctx, id)
}

func (s *Service) publishTask(task sqlcgen.Task) {
	s.hub.Publish("task.updated", taskPayload(task))
}

func (s *Service) publishTaskID(ctx context.Context, id uuid.UUID) {
	task, err := s.store.GetTask(ctx, id)
	if err != nil {
		return
	}
	s.publishTask(task)
}

func taskPayload(task sqlcgen.Task) map[string]any {
	payload := map[string]any{
		"taskId": task.ID.String(), "type": task.Type, "status": task.Status,
		"done": task.Done, "total": task.Total, "unit": task.Unit, "message": task.Message,
	}
	if task.AccountID != nil {
		payload["accountId"] = task.AccountID.String()
	}
	if task.Error != "" {
		payload["error"] = task.Error
	}
	return payload
}

func (s *Service) enqueueBody(messageID uuid.UUID, force bool) {
	select {
	case s.bodyCh <- bodyRequest{messageID: messageID, force: force}:
	default:
	}
}

func (s *Service) bodyWorker(ctx context.Context) {
	defer s.wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case req := <-s.bodyCh:
			if snap, err := s.settings.Get(ctx); err == nil {
				s.fetchLim.setLimit(snap.Effective.FetchConcurrency)
			}
			if !s.fetchLim.acquire(ctx) {
				return
			}
			go func(req bodyRequest) {
				defer s.fetchLim.release()
				fctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
				defer cancel()
				if _, err := s.messages.Body(fctx, req.messageID, req.force); err != nil {
					s.logger.Debug("prefetch body", "message", req.messageID, "error", err)
				}
			}(req)
		}
	}
}

func (s *Service) enqueueSearch(ctx context.Context, messageID uuid.UUID, op string) {
	if _, err := s.store.EnqueueSearchJob(ctx, sqlcgen.EnqueueSearchJobParams{
		ID: uuid.MustParse(platform.NewID()), MessageID: messageID, Op: op,
	}); err != nil {
		s.logger.Warn("enqueue search job", "message", messageID, "error", err)
	}
}

func encodePayload(v any) json.RawMessage {
	raw, _ := json.Marshal(v)
	return raw
}
