# My Journal

A personal journaling application built with Cloudflare Workers, Durable Objects, R2, and Workers AI.

## Features

- **Real-time Chat**: Conversational journaling with AI assistance
- **Session Memory**: Durable Objects store conversation history for the current day
- **AI Synthesis**: Llama 3.1 8B summarizes and categorizes your journal entries
- **Automatic Archiving**: Hourly cron trigger or manual "Finalize Day" saves journals to R2
- **Archive Browser**: View past journal entries rendered as markdown

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Browser   │────▶│  Cloudflare      │────▶│  Durable    │
│   (UI)      │     │  Worker          │     │  Object     │
└─────────────┘     └──────────────────┘     │  (Session)  │
                           │                 └─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Workers  │ │    R2    │ │   Cron   │
        │   AI     │ │  Bucket  │ │  Trigger │
        └──────────┘ └──────────┘ └──────────┘
```

## Journal Structure

The AI synthesizes entries into these categories:
- **Work Related** - Projects, tasks, professional updates
- **Calls & Meetings** - Meeting notes and key takeaways
- **Personal Thoughts** - Reflections and insights
- **Tasks & Action Items** - To-dos formatted as checkboxes
- **Random Ideas** - Creative thoughts for later
- **Others** - Anything that doesn't fit above

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers, R2, and AI access
- Wrangler CLI

### Installation

```bash
npm install
```

### Create R2 Bucket

```bash
npx wrangler r2 bucket create my-journal-archive
```

### Local Development

```bash
npm run dev
```

To test the cron trigger locally:
```bash
npm run test-scheduled
# Then visit: http://localhost:8787/__scheduled?cron=*+*+*+*+*
```

### Deploy

```bash
npm run deploy
```

## API Endpoints

| Method | Path       | Description |
|--------|------------|-------------|
| GET    | `/`        | Serves the web UI |
| POST   | `/chat`    | Send a message and get AI response |
| POST   | `/finalize`| Synthesize and save today's journal |
| GET    | `/archive` | List all archived journals |
| GET    | `/archive/entry?date=YYYY-MM-DD` | Get a specific journal entry |

## Configuration

Edit `wrangler.toml` to customize:

```toml
[triggers]
crons = ["0 * * * *"]  # Every hour (adjust as needed)

[[r2_buckets]]
bucket_name = "my-journal-archive"  # Your R2 bucket name
```

## License

MIT
