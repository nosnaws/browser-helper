# browser-helper

A Model Context Protocol (MCP) server that provides browser logging and click capture capabilities. Uses Playwright to open a persistent browser window that users can interact with while the MCP server captures events.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [MCP Tools](#mcp-tools)
  - [get_logs](#get_logs)
  - [get_clicks](#get_clicks)
  - [get_page_info](#get_page_info)
  - [get_navigations](#get_navigations)

## Installation

You will need [Bun](https://bun.sh/) installed to run this project.

```bash
bun install
```

Install Chromium for Playwright:
```bash
bunx playwright install chromium
```

## Usage

Run directly with Bun:
```bash
bun run index.ts [optional-url]
```

### Adding to Claude Code
```bash
claude mcp add browser-helper -- bun run /path/to/browser-helper/index.ts [optional-url]
```

## MCP Tools

### `get_logs`

Retrieves console logs and uncaught JavaScript errors from the browser.

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

**Returns:** Array of click events containing:
- `selector` - CSS selector for the clicked element
- `tagName` - HTML tag name
- `attributes` - Element attributes (excluding class/style)
- `textContent` - Text content of the element (truncated to 200 chars)
- `inputValue` - Value of input/textarea/select elements, or contenteditable content (truncated to 500 chars). Only present for form elements.
- `parents` / `children` - Optional DOM context if `parent_depth` or `child_depth` is specified

---

### `get_page_info`

Returns the current page URL and title.

**Arguments:** None

**Returns:** Object with `url` and `title` properties.

---

### `get_navigations`

Returns navigation history with the most recent navigation first.

**Arguments:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `head` | `number` | No | Return only the first N navigations (most recent) |

**Returns:** Array of navigation events containing `timestamp`, `url`, and `title`.
