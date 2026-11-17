# Moving the site to another Linux machine

This zip has everything the site needs except things that are rebuilt on install
(`node_modules`, `.next`). It includes:

| What | Where | Notes |
|---|---|---|
| The code | everything | |
| **Secrets & settings** | `.env.local` | Google client ID + **secret**, session secret, admin email. **Keep this file private** — don't commit it, post it or send the zip to anyone. |
| **Users & data** | `.data/pglite-google/` | Everyone who signed up, approvals, laundry bookings. Embedded database, only for running with `pnpm dev`. |

Because the session secret is the same, people who are signed in stay signed in (if the address stays the same).

## 1. Install Node.js 24 (no sudo needed)
```bash
mkdir -p ~/.local/opt && cd ~/.local/opt
V=$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt | grep -o 'node-v[0-9.]*-linux-x64.tar.xz' | head -1)
curl -fsSLO https://nodejs.org/dist/latest-v24.x/$V
curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt | grep " $V\$" | sha256sum -c -
tar xf $V && ln -sfn ~/.local/opt/${V%.tar.xz} ~/.local/opt/node && rm $V
echo 'export PATH="$HOME/.local/opt/node/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
node -v        # v24.x
corepack enable
```
(ARM machine, e.g. Raspberry Pi: use `linux-arm64` instead of `linux-x64`.)

## 2. Unzip and install
```bash
mkdir -p ~/dev && cd ~/dev
unzip bahad_site_*.zip            # creates bahad_1_main_site/
cd bahad_1_main_site
chmod 600 .env.local
pnpm install --frozen-lockfile
```

## 3. Run
```bash
pnpm dev                          # http://localhost:3000
```
Open http://localhost:3000 on **that** machine and sign in with Google.

## 4. Opening it from another address (phone, LAN IP, a domain)
Google only returns to addresses registered on the OAuth client. Right now that is only
`http://localhost:3000/auth/google/callback`.

1. Google Cloud console → project **openclawonvm** → APIs & Services → Credentials → the OAuth client →
   add the redirect URI `<address>/auth/google/callback` (e.g. `https://portal.example.com/auth/google/callback`).
   Google requires **https** for anything other than `localhost`.
2. In `.env.local` set `NEXT_PUBLIC_SITE_URL=<address>` (no trailing slash), then restart `pnpm dev`.
3. Dev server opened from a LAN/Tailscale IP: also set `BAHAD_DEV_ORIGINS=<ip>` in `.env.local`.

## 5. Real production (later)
`pnpm dev` + the embedded database is fine for testing with a few people. For the real launch follow
`LINUX.md` (systemd service, Caddy for https, your own Postgres). In short:
`DATABASE_URL=postgres://… pnpm db:migrate --shim`, then `BAHAD_STANDALONE=1 pnpm build` and the units in `deploy/linux/`.
The users in `.data/pglite-google` do **not** move to Postgres automatically — at launch, people simply sign in again
(the admin email in `.env.local` becomes admin automatically).

## Troubleshooting
- **Page keeps reloading by itself:** stop the server, `rm -rf .next`, `pnpm dev` again.
- **"ההתחברות נכשלה":** the address isn't registered in Google (step 4), or the account isn't a Test user on the
  Google consent screen (OAuth consent screen → Test users) while the app is in "Testing".
- **Never run two servers on the same `.data/pglite-google` folder** — copy, don't share.
