# Crawl Parity MCP

An MCP (Model Context Protocol) server for analyzing Googlebot vs AI crawler parity from Nginx access logs and Google Search Console (GSC) data. Determines how consistently AI crawlers access your content relative to Googlebot.

## Installation

```bash
npm install
```

Requires Node.js 18+.

## Usage

### Start the Server

```bash
npm start
```

Or directly:

```bash
node src/index.js
```

### Tool: analyze_logs

Parse an Nginx combined log format file and classify requests by crawler type.

**Input:**
- `log_path` (string, required): Path to Nginx access log file

**Output:**
```json
{
  "googlebot_requests": 1234,
  "ai_crawler_requests": 456,
  "parity_ratio": 37.0,
  "parity_level": "low_parity",
  "paths_googlebot": 89,
  "paths_ai_crawler": 42,
  "unique_paths": 120
}
```

### Tool: gsc_crossref

Cross-reference log analysis results with GSC search analytics data.

**Input:**
- `logs_analysis` (object, required): Output from analyze_logs or similar structure
- `gsc_data` (array, required): GSC analytics records with `page`, `impressions`, `clicks`, `ctr`, `position`

**Output:**
```json
{
  "both": 45,
  "logs_only": 20,
  "gsc_only": 35,
  "total_analyzed": 100
}
```

### Tool: parity_report

Generate a comprehensive crawl parity report combining logs and GSC data.

**Input:**
- `log_path` (string, required): Path to Nginx access log file
- `gsc_data` (array, required): GSC analytics records

**Output:**
```json
{
  "timestamp": "2026-03-26T14:30:00.000Z",
  "logs_analysis": { ... },
  "gsc_crossref": { ... },
  "summary": {
    "googlebot_activity": "detected",
    "ai_crawler_activity": "detected",
    "parity_status": "low_parity",
    "parity_percentage": 37.0,
    "recommendation": "Low parity - AI crawlers are significantly underrepresented"
  }
}
```

## Parity Levels

| Level | Ratio | Meaning |
|-------|-------|---------|
| `high_parity` | ≥80% | AI crawlers access your content nearly as often as Googlebot |
| `medium_parity` | 40-79% | Moderate parity; consider optimizing AI crawler discoverability |
| `low_parity` | <40% | AI crawlers significantly underrepresented; review robots.txt and crawlability |
| `insufficient_data` | N/A | Googlebot requests = 0; cannot calculate parity |

## Bot Signatures

### Googlebot Detection
- `Googlebot` (with space, slash, or end-of-string)
- `Googlebot-Image`
- `AdsBot-Google`

### AI Crawler Detection
- `GPTBot` (OpenAI)
- `ClaudeBot` (Anthropic)
- `PerplexityBot` (Perplexity)
- `YouBot` (You.com)
- `Bytespider` (ByteDance)
- `Google-Extended` (Google AI)
- `CCBot` (Common Crawl)
- `PetalBot` (Alibaba)
- `Applebot-Extended` (Apple)

## Nginx Log Format

Expects combined log format:
```
ip - - [timestamp] "METHOD /path HTTP/1.1" status bytes "referer" "user-agent"
```

## License

MIT — See LICENSE file

## Author

Artur Ferreira / The GEO Lab
