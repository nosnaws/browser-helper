# browser-helper

A Model Context Protocol (MCP) server that provides browser logging and click capture capabilities. Uses Playwright to open a persistent browser window that users can interact with while the MCP server captures events.

## Installation

```bash
bun install
```

## Usage

```bash
bun run index.ts
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
