package httpapi

import (
	"errors"
	"net/http"

	"github.com/Yeqingky/MailQuay/internal/httpapi/oapi"
	"github.com/Yeqingky/MailQuay/internal/push"
)

// GetPushVapidKey returns the public VAPID key used for push subscriptions.
func (s *Server) GetPushVapidKey(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, oapi.PushVapidKey{PublicKey: s.push.PublicKey()})
}

// SubscribePush stores or updates a browser push subscription.
func (s *Server) SubscribePush(w http.ResponseWriter, r *http.Request) {
	var body oapi.PushSubscriptionRequest
	if err := decodeJSON(r, &body); err != nil {
		s.error(w, r, http.StatusBadRequest, "invalid_request", "Malformed request body.")
		return
	}
	sound := body.Sound != nil && *body.Sound
	err := s.push.Subscribe(r.Context(), push.Subscription{
		Endpoint:  body.Endpoint,
		P256dh:    body.Keys.P256dh,
		Auth:      body.Keys.Auth,
		Sound:     sound,
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		if errors.Is(err, push.ErrInvalidSubscription) {
			s.error(w, r, http.StatusBadRequest, "invalid_subscription", "Invalid push subscription.")
			return
		}
		s.internal(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UnsubscribePush removes a browser push subscription.
func (s *Server) UnsubscribePush(w http.ResponseWriter, r *http.Request, params oapi.UnsubscribePushParams) {
	if err := s.push.Unsubscribe(r.Context(), params.Endpoint); err != nil {
		if errors.Is(err, push.ErrInvalidSubscription) {
			s.error(w, r, http.StatusBadRequest, "invalid_subscription", "Invalid push subscription.")
			return
		}
		s.internal(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
