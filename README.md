# browser-helper

A Model Context Protocol (MCP) server that provides browser logging and click capture capabilities. Uses Playwright to open a persistent browser window that users can interact with while the MCP server captures events.

## Getting Started

1. Download the latest executable from the [Releases page](../../releases)
2. Install Chromium for Playwright:
   ```bash
   bunx playwright install chromium
   ```
3. Run the executable:
   ```bash
   ./browser-helper [optional-url]
   ```

## Installation
You will need [Bun](https://bun.sh/) installed to run this project.

```bash
bun install
```

## Usage

Run directly with Bun:
```bash
bun run index.ts [optional-url]
```

## Building

Build a standalone executable:
```bash
bun run build
```

This creates a standalone `browser-helper` executable. Run it with:
```bash
./browser-helper [optional-url]
```

Note: Playwright browsers must be installed on the system:
```bash
bunx playwright install chromium
```

## MCP Tools

### `get_logs`

Retrieves console logs from the browser.

**Arguments:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `head` | `number` | No | Return only the first N logs |
| `tail` | `number` | No | Return only the last N logs |

If neither `head` nor `tail` is specified, returns all logs.

---

### `get_clicks`

Retrieves captured click events from user interactions. Returns a list with the most recent click first.

**Arguments:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `head` | `number` | No | Return only the first N clicks (most recent) |
| `tail` | `number` | No | Return only the last N clicks (oldest) |
| `parent_depth` | `number` | No | Include N parent nodes above clicked element |
| `child_depth` | `number` | No | Include N levels of child nodes below clicked element |

**Returns:** Array of click events containing element selectors, tag names, attributes, and optionally the surrounding DOM context based on parent/child depth.
