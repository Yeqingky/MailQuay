package settings

import "testing"

func TestValidateDraftAndTimezone(t *testing.T) {
	cases := []struct {
		name  string
		patch func(*Values)
		ok    bool
	}{
		{"defaults", func(*Values) {}, true},
		{"valid timezone", func(v *Values) { v.Timezone = "Europe/Berlin" }, true},
		{"empty timezone", func(v *Values) { v.Timezone = "" }, false},
		{"unknown timezone", func(v *Values) { v.Timezone = "Mars/Olympus" }, false},
		{"negative draft pull interval", func(v *Values) { v.DraftPullIntervalSeconds = -1 }, false},
		{"tiny draft pull interval", func(v *Values) { v.DraftPullIntervalSeconds = 1 }, false},
		{"huge draft pull interval", func(v *Values) { v.DraftPullIntervalSeconds = 1 << 20 }, false},
		{"negative draft push delay", func(v *Values) { v.DraftPushDelaySeconds = -30 }, false},
		{"huge draft push delay", func(v *Values) { v.DraftPushDelaySeconds = 86400 }, false},
	}
	for _, tc := range cases {
		values := Defaults()
		tc.patch(&values)
		if err := validate(values); (err == nil) != tc.ok {
			t.Errorf("%s: validate error = %v, want accepted=%v", tc.name, err, tc.ok)
		}
	}
}
