# Advisory Board

Your personal AI advisory board with six distinct advisors, persistent session storage, and four conversation modes. Built with Next.js 14, deployed on Vercel.

## What it does

Six AI advisors with sharp, distinct personalities debate your ideas, research topics, review documents, or hold private 1-on-1s with you:

- 🎩 **Arjun Mehta** — Chairman. Thinks in decades, finds historical parallels.
- ⚡ **Priya Krishnan** — CTO. Technical feasibility and architecture.
- 📊 **Marcus Chen** — CFO. Numbers, unit economics, fundraising. Knows crypto.
- 🎯 **Yuki Tanaka** — Strategist. Competitive landscape, positioning, timing.
- 🔥 **Diana Volkov** — Devil's Advocate. Breaks ideas before reality does.
- 🎨 **Sam Rivera** — CPO. User-centric. Pushes ruthless prioritization.

All sessions are saved automatically. Search, export to Markdown or JSON, and restore them across devices via import/export.

## Live Demo & Deploy

### One-click deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=YOUR_GITHUB_URL_HERE&env=ANTHROPIC_API_KEY&envDescription=Get%20your%20API%20key%20from%20console.anthropic.com)

After deploy, set `ANTHROPIC_API_KEY` in your Vercel project settings.

### Manual deploy

```bash
# Clone and install
git clone YOUR_REPO_URL advisory-board
cd advisory-board
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY

# Run locally
npm run dev
# Open http://localhost:3000

# Deploy to Vercel
npx vercel
# Or push to GitHub and import in Vercel dashboard
```

## Setup

### 1. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account (you get $5 free credit)
3. Generate an API key
4. Copy it (starts with `sk-ant-`)

### 2. Add the key to Vercel

In your Vercel project dashboard:

1. Go to Settings → Environment Variables
2. Add `ANTHROPIC_API_KEY` with your key as the value
3. Redeploy (Vercel does this automatically on env var changes)

### 3. Optional: Choose a cheaper model

Add `ANTHROPIC_MODEL=claude-haiku-4-5-20251001` to use Haiku instead of Sonnet. Roughly **5x cheaper** for similar quality on this use case.

## Cost estimate

Per board meeting (6 advisors responding):

| Model | Cost per session |
|-------|------------------|
| Sonnet 4.5 | ~$0.10 - $0.20 |
| Haiku 4.5 | ~$0.02 - $0.05 |

The $5 free Anthropic credit gets you 25-50 Sonnet sessions or 100-250 Haiku sessions.

## Features

### Conversation modes
- **🏛️ Board Meeting** — All 6 advisors respond and reference each other
- **🔍 Research** — Board researches a topic from each domain
- **📄 Doc Review** — Paste a document, board critiques it
- **🤝 1-on-1** — Private conversation with a single advisor

### Session management
- Auto-save to browser localStorage (no backend needed)
- Search across all past sessions and their content
- Export individual sessions as Markdown or JSON
- Backup all sessions to a single JSON file
- Import sessions back from JSON

### What's stored locally
Sessions are saved in your browser only. They survive reloads and tab closes, but **not** browser data clears or device switches. Use Export All regularly for backup. Or upgrade to cloud storage (see below).

## Project structure

```
advisory-board/
├── app/
│   ├── api/chat/route.ts    # Server-side API call to Anthropic
│   ├── globals.css          # Theme variables and styles
│   ├── layout.tsx           # Root layout with fonts
│   └── page.tsx             # Main app UI
├── lib/
│   ├── board.ts             # Advisor personas and modes
│   ├── storage.ts           # localStorage-based session storage
│   └── types.ts             # TypeScript types
├── package.json
├── tsconfig.json
├── next.config.js
└── vercel.json
```

## Customization

### Add or modify advisors

Edit `lib/board.ts`. Each advisor has:
- `id` — unique identifier
- `name`, `role`, `emoji` — display
- `color`, `bg` — theme colors
- `persona` — system prompt that defines their voice and approach

Persona writing tips:
- Define a clear point of view and bias
- Specify length ("3-4 paragraphs")
- Include relationship to other advisors ("engage with their points")

### Change the founder name

In `app/page.tsx`, search for "Jayesh" and replace with your name.

### Switch storage to cloud

For cross-device sync, replace `lib/storage.ts` with a backend-backed implementation. Options:

- **Vercel KV** — Easiest. Free tier: 30K commands/month
- **Supabase** — Free tier: 500MB database, includes auth
- **PostgreSQL on Neon** — Free tier: 0.5GB

The `Session` and `Message` types in `lib/types.ts` are simple JSON, so any KV or document store works.

## Troubleshooting

### "ANTHROPIC_API_KEY not configured"
Set the env var in Vercel project settings → redeploy.

### "Anthropic API error (401)"
Your API key is invalid or expired. Generate a new one.

### "Anthropic API error (429)"
Rate limited. Wait a minute or upgrade your Anthropic plan.

### Empty responses or hangs on Vercel
The `maxDuration` in the API route is 60s. If responses take longer, increase it in `app/api/chat/route.ts` (Pro plan only) or switch to Haiku for faster generation.

### Sessions not saving
Check browser localStorage isn't disabled. In Safari Private Mode, localStorage is wiped when the tab closes.

## Tech stack

- **Next.js 14** — App Router, Edge runtime for API
- **TypeScript** — Strict mode
- **Anthropic API** — Sonnet 4.5 by default
- **No CSS framework** — Just CSS variables and inline styles
- **No state library** — React hooks only
- **Storage** — localStorage with JSON export/import

## License

MIT — do whatever you want with it.
