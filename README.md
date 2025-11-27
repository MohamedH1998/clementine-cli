# 🍊 Clementine

Instant setup for Cloudflare Workers projects. Get Workers and Queues running in seconds.

## Quick Start

```bash
npx clementine-cli
```

## What You Get

**Interactive menu** to create:
- **Worker with Queues** - Full queue demo with interactive dashboard
- **Worker only** - Basic Worker project

**Smart detection** of existing projects:
- Automatically adds Queues to existing Workers
- Preserves your config format (JSONC or TOML)

**One-command deployment** (optional):
- Auto-creates queues in Cloudflare
- Deploys your Worker
- Handles everything for you

## Examples

### Create a new Worker with Queues

```bash
$ clementine
? What would you like to create? › Worker with Queues
? Project name? › my-app
? Queue name? › my-queue
? Deploy to Cloudflare now? › Yes

✓ Queue created
✓ Deployed!
🎉 Your queue worker is live!
```

### Create a basic Worker

```bash
$ clementine
? What would you like to create? › Worker only
? Project name? › my-worker
✓ Created!
```

### Add Queues to existing Worker

```bash
$ cd my-existing-worker
$ clementine
? What would you like to add? › Queues
✓ Queue configuration added!
```

## Queue Demo Features

The queue demo includes:
- **Interactive dashboard** at `/` - watch messages flow in real-time
- **Producer** - enqueue messages via POST
- **Consumer** - processes batches automatically
- **Event tracking** - see every phase (pending → batched → processing → acked)
- **Retry simulation** - 20% failure rate to demonstrate retries
- **Durable Objects** - stores events for the dashboard

Try it:
```bash
npm run dev
# Open http://localhost:8787
# Click "Enqueue Message" or POST to /
```

## Options

```bash
clementine              # Interactive mode
clementine queues       # Direct to queues
clementine --new        # Force new project
clementine --add        # Force add to existing
clementine --help       # Show help
```

## Requirements

- Node.js 18+
- Internet connection
- Cloudflare account (for deployment)

## License

MIT

---