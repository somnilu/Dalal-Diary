# Dalal Diary

Personal stock research diary. Notes and categories live in your own Supabase database,
guarded by a passphrase, and served from a single Cloudflare Worker.

- `public/index.html`: the website
- `src/worker.js`: the backend (passphrase check, Supabase access, daily keep-alive ping)
- `wrangler.jsonc`: Cloudflare settings

Secrets (add in Cloudflare, never in this repo):
`APP_PASSPHRASE`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
