# MailQuay Frontend

[简体中文](README_CN.md) | English

React single-page frontend for [MailQuay](https://github.com/Yeqingky/MailQuay), a self-hosted webmail client for existing IMAP, POP3, and SMTP mailboxes.

The frontend is stateless. It talks only to the MailQuay HTTP API, renders the three-pane mail interface, and receives realtime updates over server-sent events. It never connects to IMAP, POP3, or SMTP and never handles mailbox credentials.

The account wizard selects IMAP or POP3 and accepts a custom host, port, and TLS mode for every protocol; default ports are only hints, not constraints.

The app boots from a single `index.html` and navigates with `react-router`; switching pages never reloads the document. A static host must rewrite unknown paths to `index.html`. Account and folder pages use path parameters, but a URL never targets a specific message: message selection stays in page state, so opening a link never triggers body or attachment fetches. Search filters are not stored in the URL.

> **Status:** implemented. The single-page application builds with Vite and talks to the MailQuay API.

## Stack

| Concern | Choice |
| --- | --- |
| Runtime | React 19, TypeScript (strict) |
| Build | Vite |
| Routing | `react-router` over a single `index.html` |
| Server state | TanStack Query v5 |
| UI state | Zustand |
| Styling | Tailwind CSS v4, CSS variables, light and dark themes |
| Components | shadcn/ui (Radix primitives), lucide-react icons |
| Animation | Motion (`motion/react`) with reduced-motion support |
| Lists | TanStack Virtual |
| Editor | TipTap |
| HTML mail | DOMPurify plus a sandboxed iframe |
| i18n | i18next, English and Simplified Chinese |
| Tests | Vitest, Testing Library, Playwright |

## Layout

The shell uses a fixed left rail with a content-area top bar:

- Outside loopback and private ranges, a non-dismissible red banner appears above the whole shell when the request is not HTTPS. Additional domains and CIDRs can be allowed through deployment configuration.
- The content area has its own top bar. Left: compose. Right: search, refresh, task ring, theme toggle, signed-in user avatar. Clicking search expands a full-width inline field across the bar, replacing compose and the right-side actions until it is submitted or dismissed. The task center keeps the top bar but hides compose and search.
- The avatar is the signed-in user, not a mailbox account. Hovering or clicking opens a compact card with profile, settings, and sign out.
- Desktop rail is resizable (default `232px`, minimum `180px`): the global views are always listed, followed by the collapsed mailbox account list; the bottom shows only the SSE connection status.
- Global views are All mail, Unread, Sent, Sending, Drafts, Trash, Marked, and Local archive. Marked is hidden when empty. The global section has no Other.
- Settings open only from the avatar menu; the rail has no settings entry.
- Each mailbox account row is collapsed by default. Expanding it shows Inbox, Unread, Sent, Drafts, Trash, and Junk, with its own collapsed "Other" at the bottom. Archive, labels, and custom folders live there.
- Reply, forward, mark, local archive, and delete live in the reader toolbar, not the global top bar. Reply-all stays in the reply menu.
- The task ring is a `36px` multi-segment progress ring. Each task type uses a color token, takes an arc proportional to its workload, and fills that arc by completion percentage. With no work, the ring is white.
- Hovering or focusing the ring opens a downward task panel listing running and queued jobs with account, percentage, and counts. Colors are never the only signal.
- Settings open as a centered overlay dialog above the mail shell, with shared left navigation, search, close button, and `Escape` to return. Each group keeps its own path.
- Compose opens an in-app window. The sender row picks the mailbox account; Reply-To is a prefilled editable field.
- Action feedback uses one notification stack in the bottom-right: collapsed to the newest row with older rows offset underneath, hover expands up to three with a `4px` gap between rows, newest first, with enter and exit animations. Forms keep no inline success or error text.
- The saved theme is applied before the first paint, so dark mode does not flash light on reload.
- Below `md`, the rail moves into a `Sheet` drawer. The message list and reader become separate views in the same document instead of side-by-side panes.
- The rail, message list, and reader are resizable through vertical separators; minimum widths are `180px`, `320px`, and `360px`. Widths persist in local UI state.

```text
┌──────────────────┬─────────────────────────────────────────────────────┐
│ global views     │ [compose]     [search] [refresh] [ring] [theme] [user]│
├──────────────────┼───────────────────────┬─────────────────────────────┤
│                  │ list toolbar          │ reader toolbar [reply...]  │
│                  │ message list          │ sender / subject            │
│  All mail    12  │ (virtualized)         │ message body               │
│  Unread       3  │                       │                            │
│  Sent            │                       │                            │
│  Sending      1  │                       │                            │
│  Drafts       2  │                       │                            │
│  Trash           │                       │                            │
│  Marked       4  │                       │                            │
│  Local archive   │                       │                            │
│ ▸ account@ex...  │                       │                            │
│ ▸ me@example.com │                       │                            │
│ SSE status       │                       │                            │
└──────────────────┴───────────────────────┴─────────────────────────────┘
```

## Structure

```
src/
├── main.tsx          # bootstraps Provider and the router
├── app/              # router, mail shell, settings shell, providers, error boundary
├── pages/            # route components
├── features/         # auth, accounts, identities, mailboxes, message-list,
│                     # message-view, compose, search, tasks, settings
├── components/       # ui (shadcn), layout, common
├── lib/              # generated API client, SSE, mail HTML utilities
├── hooks/
├── stores/           # UI state only
├── locales/          # en, zh-CN
└── styles/           # Tailwind entry and theme tokens
```

The detailed module map lives in [the project structure document](https://github.com/Yeqingky/MailQuay/blob/main/docs/project-structure.md).

## Configuration

The API base URL is resolved in this order:

1. Runtime `window.__MAILQUAY_CONFIG__.apiBaseUrl`, written into `config.js` at deploy time on static hosts (or generated by the full backend build).
2. Build-time `VITE_API_BASE_URL`.
3. Same-origin `/api/v1`.

Same-origin is the recommended deployment: use the full backend build, or configure the static host to proxy `/api/` to the backend. No CORS or cross-site cookies are involved.

## Development

```sh
pnpm install
pnpm dev
```

The Vite dev server serves `/`, `/unread`, `/settings/preferences`, `/login`, `/setup`, `/compose`, and the other page routes, and proxies `/api` to `http://127.0.0.1:8080`. Other commands:

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm generate:api
```

## Deployment

The frontend has two deployment modes. It is not packaged as a container image.

1. **Static hosting (Cloudflare Pages, etc.)**
   - `pnpm build`, then upload `dist/` to the platform.
   - Set the API base URL at build time with `VITE_API_BASE_URL`, or edit `config.js` (`window.__MAILQUAY_CONFIG__.apiBaseUrl`) after upload.
   - For a cross-origin API, add the frontend origin to the server's CORS list in Settings > Server and use HTTPS.

2. **Embedded in the full backend build**
   - Copy `dist/` into the backend's `internal/webassets/dist` and build with `make build-full`, or let the backend release workflow fetch the frontend tag.
   - The `mailquay` image/binary serves both `/api/v1` and the static pages.

## Documentation

- [Architecture](https://github.com/Yeqingky/MailQuay/blob/main/docs/architecture.md)
- [Project structure](https://github.com/Yeqingky/MailQuay/blob/main/docs/project-structure.md)
- [Development guide](https://github.com/Yeqingky/MailQuay/blob/main/docs/development.md)
- [Repository rules](https://github.com/Yeqingky/MailQuay/blob/main/AGENTS.md)

## License

[MIT](LICENSE)
