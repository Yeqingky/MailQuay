package integration

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Yeqingky/MailQuay/internal/store"
	"github.com/Yeqingky/MailQuay/internal/store/sqlcgen"
)

func TestPushSubscriptionStore(t *testing.T) {
	dsn := os.Getenv("MAILQUAY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("MAILQUAY_TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	resetSchema(t, ctx, dsn)
	if err := store.Migrate(ctx, dsn); err != nil {
		t.Fatal(err)
	}
	st, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	endpoint := "https://push.example.test/subscription/1"
	params := sqlcgen.UpsertPushSubscriptionParams{
		ID:        uuid.New(),
		Endpoint:  endpoint,
		P256dh:    "p256dh",
		Auth:      "auth",
		Sound:     false,
		UserAgent: "test",
	}
	if err := st.UpsertPushSubscription(ctx, params); err != nil {
		t.Fatal(err)
	}
	subs, err := st.ListPushSubscriptions(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(subs) != 1 || subs[0].Endpoint != endpoint || subs[0].Sound {
		t.Fatalf("subscriptions = %+v", subs)
	}

	params.ID = uuid.New()
	params.P256dh = "updated"
	params.Sound = true
	if err := st.UpsertPushSubscription(ctx, params); err != nil {
		t.Fatal(err)
	}
	subs, err = st.ListPushSubscriptions(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(subs) != 1 || subs[0].P256dh != "updated" || !subs[0].Sound {
		t.Fatalf("updated subscriptions = %+v", subs)
	}

	if err := st.DeletePushSubscription(ctx, endpoint); err != nil {
		t.Fatal(err)
	}
	subs, err = st.ListPushSubscriptions(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(subs) != 0 {
		t.Fatalf("subscriptions after delete = %+v", subs)
	}
}
