# PR review prompt (plan 08)

Paste into Claude Code (or any AI) in a checkout of the repo, with the PR fetched (`gh pr checkout N`, or `git fetch origin pull/N/head:pr-N && git checkout pr-N`):

> Review PR #N against CLAUDE.md and CONTRIBUTING.md. Check: (1) only touches its app folders; (2) uses only the Platform API for user/data; (3) requests the minimum scopes and justifies `contact`/`push`; (4) collection rules don't expose data more widely than needed; (5) no external network calls, no tracking, no secrets; (6) no sensitive military information in content; (7) Hebrew RTL, mobile layout, accessible; (8) builds and works in the preview. List blocking issues first, then suggestions, then a fixed version of anything trivial.

Extra things worth asking the AI for, for this repo:
- Show the output of `pnpm check:paths --base origin/main --head HEAD`, `pnpm scope-diff --base origin/main --head HEAD` and `pnpm check:scan`.
- For a simple app: is every piece of user-supplied text inserted with `textContent` or escaped before `innerHTML`? (XSS inside the sandbox can't steal the session, but it can deface the app and spam the user's data.)
- For a full app: does it import anything from `@/platform/server/*` other than `platformFor`, read cookies, query the database, or call `fetch` to another host? Does it use only its own slug?
- Does `README.md` explain every `contact` / `push` scope?

Then the owner's merge checklist (in the PR template): checks green · preview tested on a phone · scopes justified · content OK under OPSEC · authors listed. After merging a new app: `pnpm codeowners` and commit.
