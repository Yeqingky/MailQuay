package app

import "testing"

func TestValidateSetupToken(t *testing.T) {
	cases := []struct {
		name    string
		needs   bool
		token   string
		wantErr bool
	}{
		{"uninitialized without token", true, "", false},
		{"uninitialized with long token", true, "0123456789abcdef", false},
		{"uninitialized with short token", true, "changeme", true},
		{"initialized with short token", false, "changeme", false},
	}
	for _, tc := range cases {
		err := validateSetupToken(tc.needs, tc.token)
		if (err != nil) != tc.wantErr {
			t.Errorf("%s: error = %v, want error=%v", tc.name, err, tc.wantErr)
		}
	}
}
