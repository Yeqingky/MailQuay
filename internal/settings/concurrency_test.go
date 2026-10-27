package settings

import (
	"testing"

	"github.com/mailquay/mailquay/internal/platform"
)

func TestEffectiveConcurrency(t *testing.T) {
	cases := []struct {
		res           platform.Resources
		sync, fetch   int
		search, batch int
	}{
		{platform.Resources{CPUs: 1, MemoryBytes: 4 << 30}, 2, 2, 1, 50},
		{platform.Resources{CPUs: 2, MemoryBytes: 8 << 30}, 2, 2, 1, 100},
		{platform.Resources{CPUs: 4, MemoryBytes: 8 << 30}, 2, 2, 2, 200},
		{platform.Resources{CPUs: 8, MemoryBytes: 16 << 30}, 2, 2, 4, 250},
		{platform.Resources{CPUs: 0, MemoryBytes: 0}, 2, 2, 1, 50},
	}
	for _, tc := range cases {
		got := EffectiveConcurrency(Defaults(), tc.res)
		if got.SyncConcurrency != tc.sync || got.FetchConcurrency != tc.fetch ||
			got.SearchConcurrency != tc.search || got.IndexBatchSize != tc.batch {
			t.Errorf("EffectiveConcurrency(%+v) = %+v", tc.res, got)
		}
	}
	v := Defaults()
	v.SyncConcurrency = 5
	v.FetchConcurrency = 7
	got := EffectiveConcurrency(v, platform.Resources{CPUs: 4})
	if got.SyncConcurrency != 5 || got.FetchConcurrency != 7 {
		t.Fatalf("operator values were overridden: %+v", got)
	}
}

func TestEffectiveConcurrencyHonorsOperatorValues(t *testing.T) {
	v := Defaults()
	v.AutoLocalConcurrency = false
	v.SearchConcurrency = 3
	v.IndexBatchSize = 120
	got := EffectiveConcurrency(v, platform.Resources{CPUs: 8})
	if got.SearchConcurrency != 3 || got.IndexBatchSize != 120 {
		t.Fatalf("manual local pools were overridden: %+v", got)
	}
	v.AutoLocalConcurrency = true
	got = EffectiveConcurrency(v, platform.Resources{CPUs: 8})
	if got.SearchConcurrency != 4 || got.IndexBatchSize != 250 {
		t.Fatalf("automatic local pools did not follow resources: %+v", got)
	}
}

func TestValidate(t *testing.T) {
	v := Defaults()
	if err := validate(v); err != nil {
		t.Fatal(err)
	}
	v.SendRetryLimit = 11
	if err := validate(v); err == nil {
		t.Fatal("expected retry limit rejection")
	}
	v = Defaults()
	v.DefaultDownloadScope = "everything"
	if err := validate(v); err == nil {
		t.Fatal("expected scope rejection")
	}
	v = Defaults()
	v.SearchConcurrency = 9
	if err := validate(v); err == nil {
		t.Fatal("expected search concurrency rejection")
	}
	v = Defaults()
	v.IndexBatchSize = 5
	if err := validate(v); err == nil {
		t.Fatal("expected index batch rejection")
	}
}
func TestIMAPSyncSettingsDefaultsAndBounds(t *testing.T) {
	values := Defaults()
	if values.SyncIntervalSeconds != 600 || values.NoIdleSyncIntervalSeconds != 180 ||
		values.OtherMailboxSyncIntervalSeconds != 900 ||
		!values.AutoSync || !values.RealTimeReceive || !values.StartupSync ||
		values.MaxIMAPConnectionsPerAccount != 2 || values.IMAPWorkIdleTimeoutSeconds != 600 ||
		values.MaxIMAPConnectionsPerServer != 8 || values.MaxConcurrentSyncsPerServer != 2 ||
		!values.AutoReconnect {
		t.Fatalf("unexpected IMAP sync defaults: %+v", values)
	}
	if err := validate(values); err != nil {
		t.Fatalf("default settings rejected: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*Values)
	}{
		{"inbox interval below minimum", func(v *Values) { v.SyncIntervalSeconds = 29 }},
		{"no-idle interval below minimum", func(v *Values) { v.NoIdleSyncIntervalSeconds = 29 }},
		{"no-idle interval above maximum", func(v *Values) { v.NoIdleSyncIntervalSeconds = 86401 }},
		{"other folder interval above maximum", func(v *Values) { v.OtherMailboxSyncIntervalSeconds = 86401 }},
		{"account connections below minimum", func(v *Values) { v.MaxIMAPConnectionsPerAccount = 0 }},
		{"account connections above maximum", func(v *Values) { v.MaxIMAPConnectionsPerAccount = 4 }},
		{"worker timeout below minimum", func(v *Values) { v.IMAPWorkIdleTimeoutSeconds = 59 }},
		{"worker timeout above maximum", func(v *Values) { v.IMAPWorkIdleTimeoutSeconds = 3601 }},
		{"server connections below minimum", func(v *Values) { v.MaxIMAPConnectionsPerServer = 0 }},
		{"server connections above maximum", func(v *Values) { v.MaxIMAPConnectionsPerServer = 65 }},
		{"server syncs below minimum", func(v *Values) { v.MaxConcurrentSyncsPerServer = 0 }},
		{"server syncs above maximum", func(v *Values) { v.MaxConcurrentSyncsPerServer = 33 }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := Defaults()
			test.mutate(&candidate)
			if err := validate(candidate); err == nil {
				t.Fatal("invalid setting accepted")
			}
		})
	}
}
