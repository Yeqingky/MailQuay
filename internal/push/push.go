// Package push delivers Web Push notifications for new mail.
package push

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid"

	"github.com/Yeqingky/MailQuay/internal/events"
	"github.com/Yeqingky/MailQuay/internal/platform"
	"github.com/Yeqingky/MailQuay/internal/settings"
	"github.com/Yeqingky/MailQuay/internal/store"
	"github.com/Yeqingky/MailQuay/internal/store/sqlcgen"
)

const (
	vapidFile        = "vapid.json"
	notificationTag  = "mailquay-new-mail"
	coalesceWindow   = time.Second
	sendTimeout      = 10 * time.Second
	maxEndpointBytes = 4096
)

// ErrInvalidSubscription marks malformed push subscription input.
var ErrInvalidSubscription = errors.New("invalid push subscription")

// Keys are the base64url-encoded VAPID key pair.
type Keys struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

// Subscription is a browser push subscription.
type Subscription struct {
	Endpoint  string
	P256dh    string
	Auth      string
	Sound     bool
	UserAgent string
}

// Service stores subscriptions and delivers coalesced new-mail pushes.
type Service struct {
	store    *store.Store
	settings *settings.Service
	logger   *slog.Logger
	keys     Keys
	subject  string
	client   *http.Client
}

// New loads or creates the VAPID key pair and returns a push service.
func New(st *store.Store, settingsSvc *settings.Service, logger *slog.Logger, dataDir, subject string) (*Service, error) {
	keys, err := loadOrCreateKeys(dataDir)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(subject) == "" {
		subject = "mailto:admin@localhost"
	}
	return &Service{
		store: st, settings: settingsSvc, logger: logger, keys: keys, subject: subject,
		client: &http.Client{Timeout: sendTimeout},
	}, nil
}

// PublicKey returns the VAPID public key used by browser subscriptions.
func (s *Service) PublicKey() string { return s.keys.PublicKey }

// Subscribe stores or updates a browser push subscription.
func (s *Service) Subscribe(ctx context.Context, sub Subscription) error {
	endpoint := strings.TrimSpace(sub.Endpoint)
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil ||
		len(endpoint) > maxEndpointBytes {
		return fmt.Errorf("%w: endpoint must be an HTTPS URL", ErrInvalidSubscription)
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return fmt.Errorf("%w: endpoint host is not allowed", ErrInvalidSubscription)
	}
	if ip := net.ParseIP(host); ip != nil &&
		(ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified()) {
		return fmt.Errorf("%w: endpoint host is not allowed", ErrInvalidSubscription)
	}
	if sub.P256dh == "" || sub.Auth == "" || len(sub.P256dh) > 512 || len(sub.Auth) > 256 {
		return fmt.Errorf("%w: invalid subscription keys", ErrInvalidSubscription)
	}
	userAgent := sub.UserAgent
	if len(userAgent) > 255 {
		userAgent = userAgent[:255]
	}
	return s.store.UpsertPushSubscription(ctx, sqlcgen.UpsertPushSubscriptionParams{
		ID:        uuid.MustParse(platform.NewID()),
		Endpoint:  endpoint,
		P256dh:    sub.P256dh,
		Auth:      sub.Auth,
		Sound:     sub.Sound,
		UserAgent: userAgent,
	})
}

// Unsubscribe removes a browser push subscription.
func (s *Service) Unsubscribe(ctx context.Context, endpoint string) error {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return fmt.Errorf("%w: endpoint is required", ErrInvalidSubscription)
	}
	return s.store.DeletePushSubscription(ctx, endpoint)
}

// Run subscribes to the event hub and sends one push per coalescing window.
func (s *Service) Run(ctx context.Context, hub *events.Hub) {
	eventsCh, unsubscribe := hub.Subscribe(ctx)
	defer unsubscribe()

	var pending []notification
	var timer *time.Timer
	var timerC <-chan time.Time
	stopTimer := func() {
		if timer != nil {
			timer.Stop()
			timer = nil
		}
		timerC = nil
	}

	for {
		select {
		case <-ctx.Done():
			stopTimer()
			return
		case event, ok := <-eventsCh:
			if !ok {
				stopTimer()
				return
			}
			if event.Type != "message.new" {
				continue
			}
			item, ok := readNotification(event.Data)
			if !ok {
				continue
			}
			pending = append(pending, item)
			if timerC == nil {
				timer = time.NewTimer(coalesceWindow)
				timerC = timer.C
			}
		case <-timerC:
			stopTimer()
			items := pending
			pending = nil
			if len(items) > 0 {
				go s.send(ctx, items)
			}
		}
	}
}

type notification struct {
	AccountID string
	MailboxID string
	Sender    string
	Subject   string
}

func readNotification(data any) (notification, bool) {
	payload, ok := data.(map[string]any)
	if !ok {
		return notification{}, false
	}
	unread, _ := payload["unread"].(bool)
	if !unread {
		return notification{}, false
	}
	accountID, _ := payload["accountId"].(string)
	mailboxID, _ := payload["mailboxId"].(string)
	message, ok := payload["message"].(map[string]any)
	if !ok || accountID == "" || mailboxID == "" {
		return notification{}, false
	}
	subject, _ := message["subject"].(string)
	sender := ""
	if from, ok := message["from"].(map[string]any); ok {
		if name, _ := from["name"].(string); name != "" {
			sender = name
		} else {
			sender, _ = from["email"].(string)
		}
	}
	if sender == "" {
		sender, _ = message["accountEmail"].(string)
	}
	return notification{
		AccountID: accountID,
		MailboxID: mailboxID,
		Sender:    sender,
		Subject:   subject,
	}, true
}

func composeNotification(items []notification, language string) (title, body, path string) {
	latest := items[len(items)-1]
	chinese := strings.HasPrefix(strings.ToLower(language), "zh")
	switch {
	case len(items) > 1 && chinese:
		title = fmt.Sprintf("%d 封新邮件", len(items))
	case len(items) > 1:
		title = fmt.Sprintf("%d new messages", len(items))
	case latest.Sender != "":
		title = latest.Sender
	default:
		title = "MailQuay"
	}
	body = latest.Subject
	if body == "" {
		if chinese {
			body = "(无主题)"
		} else {
			body = "(No subject)"
		}
	}
	path = "/accounts/" + url.PathEscape(latest.AccountID) + "/mailboxes/" + url.PathEscape(latest.MailboxID)
	return title, body, path
}

type pushPayload struct {
	Title  string `json:"title"`
	Body   string `json:"body"`
	URL    string `json:"url"`
	Tag    string `json:"tag"`
	Silent bool   `json:"silent"`
	Count  int    `json:"count,omitempty"`
}

func (s *Service) send(ctx context.Context, items []notification) {
	subs, err := s.store.ListPushSubscriptions(ctx)
	if err != nil {
		s.logger.Warn("list push subscriptions", "error", err)
		return
	}
	if len(subs) == 0 {
		return
	}
	title, body, path := composeNotification(items, s.settings.Current().Language)

	for _, sub := range subs {
		payload, err := json.Marshal(pushPayload{
			Title: title, Body: body, URL: path, Tag: notificationTag,
			Silent: !sub.Sound, Count: len(items),
		})
		if err != nil {
			continue
		}
		sendCtx, cancel := context.WithTimeout(ctx, sendTimeout)
		response, err := webpush.SendNotificationWithContext(sendCtx, payload, &webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys:     webpush.Keys{Auth: sub.Auth, P256dh: sub.P256dh},
		}, &webpush.Options{
			Subscriber:      s.subject,
			TTL:             300,
			Urgency:         webpush.UrgencyNormal,
			VAPIDPublicKey:  s.keys.PublicKey,
			VAPIDPrivateKey: s.keys.PrivateKey,
			HTTPClient:      s.client,
		})
		cancel()
		if err != nil {
			// The underlying error can contain the subscription endpoint, which
			// is a bearer capability. Log only that delivery failed.
			s.logger.Warn("send push notification failed")
			continue
		}
		if response == nil {
			continue
		}
		_ = response.Body.Close()
		switch {
		case response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusGone:
			if err := s.store.DeletePushSubscription(ctx, sub.Endpoint); err != nil {
				s.logger.Warn("delete expired push subscription", "error", err)
			}
		case response.StatusCode >= 300:
			s.logger.Warn("push endpoint rejected notification", "status", response.StatusCode)
		}
	}
}

func loadOrCreateKeys(dataDir string) (Keys, error) {
	path := filepath.Join(dataDir, vapidFile)
	raw, err := os.ReadFile(path)
	if err == nil {
		var keys Keys
		if err := json.Unmarshal(raw, &keys); err != nil {
			return Keys{}, fmt.Errorf("parse vapid keys: %w", err)
		}
		if keys.PublicKey == "" || keys.PrivateKey == "" {
			return Keys{}, errors.New("vapid keys are incomplete")
		}
		return keys, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return Keys{}, fmt.Errorf("read vapid keys: %w", err)
	}

	privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return Keys{}, fmt.Errorf("generate vapid keys: %w", err)
	}
	keys := Keys{PublicKey: publicKey, PrivateKey: privateKey}
	raw, err = json.MarshalIndent(keys, "", "  ")
	if err != nil {
		return Keys{}, fmt.Errorf("encode vapid keys: %w", err)
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return Keys{}, fmt.Errorf("write vapid keys: %w", err)
	}
	return keys, nil
}
