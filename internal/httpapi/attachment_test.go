package httpapi

import "testing"

func TestAttachmentContentType(t *testing.T) {
	cases := []struct{ in, want string }{
		{"text/plain", "text/plain"},
		{"text/plain; charset=utf-8", "text/plain; charset=utf-8"},
		{"APPLICATION/PDF", "application/pdf"},
		{"image/png; name=\"a b\"", "image/png; name=\"a b\""},
		{"", "application/octet-stream"},
		{"not a media type", "application/octet-stream"},
		{"text/html\r\nX-Injected: 1", "application/octet-stream"},
	}
	for _, tc := range cases {
		if got := attachmentContentType(tc.in); got != tc.want {
			t.Errorf("attachmentContentType(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
