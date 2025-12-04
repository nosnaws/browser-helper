
# Browser Helper MCP Server

An MCP server that opens a Playwright browser window and captures user interactions (clicks, console logs, navigation).

## Development

```bash
bun install                        # Install dependencies
bunx playwright install chromium   # Install browser
bun run index.ts [url]             # Run the MCP server
bun test                           # Run tests
```

## Project Structure

- `index.ts` - MCP server, tools, and Playwright setup
- `lib.ts` - Types and capped storage utilities
- `lib.test.ts` - Tests for lib functions

## MCP Tools

- `get_logs` - Console logs and JS errors
- `get_clicks` - Click events with CSS selectors and DOM context
- `get_page_info` - Current URL and title
- `get_navigations` - Navigation history

## Adding New Tools

Use `server.tool()` with zod schemas:

```ts
server.tool(
  "tool_name",
  "Description",
  { param: z.string().describe("Param description") },
  async ({ param }) => {
    return { content: [{ type: "text", text: "result" }] };
  }
);
```

## Testing with Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "browser": {
      "command": "bun",
      "args": ["run", "/path/to/browser-helper/index.ts"]
    }
  }
}
```
