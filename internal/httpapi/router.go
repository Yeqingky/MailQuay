package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/mailquay/mailquay/internal/auth"
	"github.com/mailquay/mailquay/internal/events"
	"github.com/mailquay/mailquay/internal/httpapi/oapi"
	"github.com/mailquay/mailquay/internal/webassets"
)

type requestIDKeyType int

const requestIDKey requestIDKeyType = 1

// NewRouter builds the HTTP handler with middleware and static assets.
func NewRouter(srv *Server, hub *events.Hub, logger *slog.Logger) http.Handler {
	router := chi.NewRouter()
	router.Use(requestIDMiddleware, recoveryMiddleware(logger), loggingMiddleware(logger), securityHeaders, corsMiddleware(srv.cfg.CORSOrigins))

	router.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	api := chi.NewRouter()
	api.Use(noStore, srv.sessionMiddleware)
	api.Use(srv.csrfMiddleware)
	api.Use(srv.jsonBodyMiddleware)
	oapi.HandlerFromMux(srv, api)
	notFound := func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			srv.error(w, r, http.StatusNotFound, "not_found", "Not found.")
			return
		}
		http.Error(w, "not found", http.StatusNotFound)
	}
	api.NotFound(func(w http.ResponseWriter, r *http.Request) {
		srv.error(w, r, http.StatusNotFound, "not_found", "Not found.")
	})
	router.Mount("/api/v1", api)

	if assets := webassets.Handler(); assets != nil {
		router.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				srv.error(w, r, http.StatusNotFound, "not_found", "Not found.")
				return
			}
			assets.ServeHTTP(w, r)
		}))
	} else {
		router.NotFound(notFound)
	}
	return router
}

func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			buf := make([]byte, 8)
			if _, err := rand.Read(buf); err == nil {
				id = hex.EncodeToString(buf)
			}
		}
		w.Header().Set("X-Request-ID", id)
		ctx := context.WithValue(r.Context(), requestIDKey, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func recoveryMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					logger.Error("panic", "path", r.URL.Path, "panic", rec)
					http.Error(w, `{"error":{"code":"internal_error","message":"Internal server error."}}`, http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Flush() {
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func loggingMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w, status: 200}
			next.ServeHTTP(sw, r)
			if strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Path != "/api/v1/logs" {
				logger.Info("http", "method", r.Method, "path", r.URL.Path, "status", sw.status, "duration", time.Since(start))
			}
		})
	}
}

// noStore keeps API responses out of browser history caches and shared proxies.
// Handlers that serve intentionally cacheable resources set their own header.
func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		// Remote mail images are stripped by the frontend sanitizer until the
		// user allows the sender, so img-src must permit those opt-in requests.
		// Sandboxed mail srcdoc uses about:, which must be allowed by frame-src.
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http: https:; font-src 'self' data:; connect-src 'self'; frame-src 'self' data: blob: about:; object-src 'none'; base-uri 'self'; form-action 'self'")
		next.ServeHTTP(w, r)
	})
}

func corsMiddleware(origins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			allowed := origins
			if origin != "" && len(allowed) > 0 {
				if containsString(allowed, origin) {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Access-Control-Allow-Credentials", "true")
					w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, Idempotency-Key")
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
					w.Header().Set("Vary", "Origin")
				}
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func (s *Server) sessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := apiPath(r.URL.Path)
		public := path == "/auth/setup" || path == "/auth/login" || isOAuthCallbackPath(path)
		var sess *auth.Session
		if cookie, err := r.Cookie(auth.SessionCookie); err == nil && cookie.Value != "" {
			if loaded, err := s.auth.Authenticate(r.Context(), cookie.Value); err == nil {
				sess = loaded
				r = r.WithContext(WithCSRFToken(r.Context(), s.refreshAuthCookies(w, r, loaded)))
			}
		}
		if path == "/auth/me" {
			if sess != nil {
				r = r.WithContext(WithUser(r.Context(), sess))
			}
			next.ServeHTTP(w, r)
			return
		}
		if public {
			next.ServeHTTP(w, r)
			return
		}
		if sess == nil {
			if needs, err := s.auth.NeedsSetup(r.Context()); err == nil && needs {
				s.error(w, r, http.StatusConflict, "setup_required", "The owner account has not been created yet.")
				return
			}
			s.error(w, r, http.StatusUnauthorized, "unauthorized", "Authentication is required.")
			return
		}
		next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), sess)))
	})
}

// refreshAuthCookies slides the session and CSRF cookies to the same expiry and
// returns the CSRF token now in force. The CSRF cookie keeps its existing value
// so tabs holding the token keep working; it is reissued only when the browser
// no longer sends it.
func (s *Server) refreshAuthCookies(w http.ResponseWriter, r *http.Request, sess *auth.Session) string {
	secure, sameSite := s.cookiePolicy(r)
	maxAge := cookieMaxAge(sess.ExpiresAt)
	csrf := ""
	if cookie, err := r.Cookie(auth.CSRFCookie); err == nil {
		csrf = cookie.Value
	}
	if csrf == "" {
		if token, err := auth.NewCSRFToken(); err == nil {
			csrf = token
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name: auth.SessionCookie, Value: sess.Token, Path: "/", HttpOnly: true,
		Secure: secure, SameSite: sameSite, MaxAge: maxAge, Expires: sess.ExpiresAt.UTC(),
	})
	if csrf != "" {
		http.SetCookie(w, &http.Cookie{
			Name: auth.CSRFCookie, Value: csrf, Path: "/", HttpOnly: false,
			Secure: secure, SameSite: sameSite, MaxAge: maxAge, Expires: sess.ExpiresAt.UTC(),
		})
	}
	return csrf
}

func (s *Server) cookiePolicy(r *http.Request) (bool, http.SameSite) {
	secure := auth.RequestScheme(r, s.cfg.TrustedProxies) == "https"
	sameSite := http.SameSiteLaxMode
	if len(s.cfg.CORSOrigins) > 0 {
		secure = true
		sameSite = http.SameSiteNoneMode
	}
	return secure, sameSite
}

func cookieMaxAge(expires time.Time) int {
	maxAge := int(time.Until(expires).Seconds())
	if maxAge < 0 {
		return 0
	}
	return maxAge
}

// jsonBodyMiddleware rejects non-JSON request bodies so a handler can never
// decode form or text payloads by accident. Multipart uploads and requests
// without a body are exempt.
func (s *Server) jsonBodyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if r.ContentLength == 0 {
			next.ServeHTTP(w, r)
			return
		}
		switch apiPath(r.URL.Path) {
		case "/attachments", "/accounts/import/emclient":
			next.ServeHTTP(w, r)
			return
		}
		mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || !strings.EqualFold(mediaType, "application/json") {
			s.error(w, r, http.StatusUnsupportedMediaType, "unsupported_media_type", "Content-Type must be application/json.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) csrfMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		path := apiPath(r.URL.Path)
		if path == "/auth/setup" || path == "/auth/login" || isOAuthCallbackPath(path) {
			next.ServeHTTP(w, r)
			return
		}
		if !sameOrigin(r, s.cfg.CORSOrigins) {
			s.error(w, r, http.StatusForbidden, "origin_rejected", "The request origin is not allowed.")
			return
		}
		cookie, err := r.Cookie(auth.CSRFCookie)
		if err != nil || !auth.ValidCSRF(cookie.Value, r.Header.Get("X-CSRF-Token")) {
			s.error(w, r, http.StatusForbidden, "csrf_failed", "The CSRF token is missing or invalid.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func sameOrigin(r *http.Request, corsOrigins []string) bool {
	origin := r.Header.Get("Origin")
	if origin != "" {
		parsed, err := url.Parse(origin)
		if err != nil {
			return false
		}
		if strings.EqualFold(parsed.Host, r.Host) {
			return true
		}
		if containsString(corsOrigins, origin) {
			return true
		}
		return false
	}
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" {
		return site == "same-origin" || site == "none"
	}
	return true
}

func apiPath(path string) string {
	return strings.TrimPrefix(path, "/api/v1")
}

// isOAuthCallbackPath reports whether path is a provider callback route.
// Only the callback is public: the provider redirects the browser there without
// a MailQuay session, while start must run inside an authenticated session so
// nobody can mint a state bound to an arbitrary account id.
func isOAuthCallbackPath(path string) bool {
	rest, ok := strings.CutPrefix(path, "/oauth/")
	if !ok {
		return false
	}
	provider, ok := strings.CutSuffix(rest, "/callback")
	return ok && provider != "" && !strings.Contains(provider, "/")
}
