# This machine: production on :3000, development on :3001

| | Production | Development |
|---|---|---|
| Address | `127.0.0.1:3000` → Caddy → https://bahad1-alon.duckdns.org | `127.0.0.1:3001` (local only) |
| Service | `systemctl --user … alon-prod` | `systemctl --user … alon-dev` |
| Sign-in | Google | fake users (pick one on /signin) |
| Data | `.data/pglite-google` (the real data) | `.data/pglite-dev` (throwaway) |
| Env | `.env.local` + `.env.production.local` | `.env.local` + `.env.development.local` |
| Build | `.next-prod` (built by `pnpm release`) | `.next` (hot reload) |

- **Put changes live:** commit, then `pnpm release` (builds into `.next-prod-build`, then swaps it in with a few seconds of downtime; a failed build leaves the site untouched).
- **Logs:** `journalctl --user -u alon-prod -f` · `journalctl --user -u alon-dev -f`
- **Restart:** `systemctl --user restart alon-prod` (or `alon-dev`)
- The services survive logout and reboot (`loginctl enable-linger` is on).
- Never point two processes at the same PGlite folder — dev and prod use different ones on purpose.
- Run `pnpm check` only when you don't mind the dev server needing a restart afterwards (it shares `.next`).

## Caddy (`/etc/caddy/Caddyfile`, needs sudo)
```
bahad1-alon.duckdns.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000 {
		flush_interval -1
	}
}
```
`sudo systemctl reload caddy`

## Google sign-in
Google Cloud Console → Credentials → the OAuth client → Authorized redirect URIs: `https://bahad1-alon.duckdns.org/auth/google/callback`
