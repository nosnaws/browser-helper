import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium, type Page, type BrowserContext } from "playwright";
import { homedir } from "os";
import { join } from "path";
import { z } from "zod";
import {
  type LogEntry,
  type ClickEntry,
  type NavigationEntry,
  addLog,
  addClick,
  addNavigation,
  processLogs,
  processClicks,
} from "./lib";

// User data directory for persistent browser context
const USER_DATA_DIR = join(homedir(), ".browser-helper", "user-data");

// Storage for captured events
const logs: LogEntry[] = [];
const clicks: ClickEntry[] = [];
const navigations: NavigationEntry[] = [];

// Playwright instances
let browser: BrowserContext;
let page: Page;

// Create MCP server
const server = new McpServer({
  name: "browser-helper",
  version: "1.0.0",
});

// Script to inject into pages for click capture
const clickCaptureScript = `
  function buildSelector(el) {
    if (el.id) return '#' + el.id;

    const parts = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.tagName.toLowerCase();
      if (el.id) {
        selector = '#' + el.id;
        parts.unshift(selector);
        break;
      } else if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\\s+/).filter(c => c).slice(0, 2);
        if (classes.length) selector += '.' + classes.join('.');
      }

      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          selector += ':nth-of-type(' + index + ')';
        }
      }

      parts.unshift(selector);
      el = parent;
      if (parts.length > 4) break;
    }
    return parts.join(' > ');
  }

  function getAttributes(el) {
    const attrs = {};
    for (const attr of el.attributes) {
      if (attr.name !== 'class' && attr.name !== 'style') {
        attrs[attr.name] = attr.value.slice(0, 200);
      }
    }
    return attrs;
  }

  function getInputValue(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      return (el.value || '').slice(0, 500);
    }
    if (tag === 'select') {
      return el.options[el.selectedIndex]?.text || '';
    }
    // Check for contenteditable
    if (el.isContentEditable) {
      return (el.textContent || '').trim().slice(0, 500);
    }
    // Check for nested input in light DOM
    let input = el.querySelector('input, textarea');
    if (input) {
      return (input.value || '').slice(0, 500);
    }
    // Check shadow DOM for inputs
    if (el.shadowRoot) {
      input = el.shadowRoot.querySelector('input, textarea');
      if (input) {
        return (input.value || '').slice(0, 500);
      }
    }
    // Recursively check children with shadow roots
    const childrenWithShadow = el.querySelectorAll('*');
    for (const child of childrenWithShadow) {
      if (child.shadowRoot) {
        input = child.shadowRoot.querySelector('input, textarea');
        if (input) {
          return (input.value || '').slice(0, 500);
        }
      }
    }
    return undefined;
  }

  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

    const clickData = {
      selector: buildSelector(el),
      tagName: el.tagName.toLowerCase(),
      attributes: getAttributes(el),
      textContent: (el.textContent || '').trim().slice(0, 200)
    };

    const inputValue = getInputValue(el);
    if (inputValue !== undefined) {
      clickData.inputValue = inputValue;
    }

    window.__reportClick(clickData);
  }, true);
`;

// Setup click capture on a page
async function setupClickCapture(p: Page) {
  await p.exposeFunction("__reportClick", (data: Omit<ClickEntry, "timestamp">) => {
    addClick(clicks, {
      ...data,
      timestamp: Date.now(),
    });
  });
  await p.addInitScript(clickCaptureScript);
}

// Setup console log capture on a page
function setupLogCapture(p: Page) {
  p.on("console", (msg) => {
    addLog(logs, {
      timestamp: Date.now(),
      type: msg.type(),
      text: msg.text(),
    });
  });

  p.on("pageerror", (error) => {
    addLog(logs, {
      timestamp: Date.now(),
      type: "error",
      text: `[Uncaught] ${error.message}`,
    });
  });
}

// Helper to get parent chain of an element
function getParentChainScript(depth: number) {
  return `
    (selector) => {
      const el = document.querySelector(selector);
      if (!el) return [];

      const parents = [];
      let current = el.parentElement;
      let d = ${depth};

      while (current && d > 0 && current !== document.body) {
        parents.push({
          tagName: current.tagName.toLowerCase(),
          id: current.id || null,
          className: current.className || null,
        });
        current = current.parentElement;
        d--;
      }
      return parents;
    }
  `;
}

// Helper to get children of an element
function getChildrenScript(depth: number) {
  return `
    (selector) => {
      const el = document.querySelector(selector);
      if (!el) return [];

      function getChildren(node, d) {
        if (d <= 0) return null;
        const children = [];
        for (const child of node.children) {
          children.push({
            tagName: child.tagName.toLowerCase(),
            id: child.id || null,
            className: child.className || null,
            textContent: (child.textContent || '').trim().slice(0, 100),
            children: getChildren(child, d - 1)
          });
        }
        return children.length > 0 ? children : null;
      }

      return getChildren(el, ${depth});
    }
  `;
}

// Register get_logs tool
server.tool(
  "get_logs",
  "Retrieves console logs from the browser",
  {
    head: z.number().optional().describe("Return only the first N logs"),
    tail: z.number().optional().describe("Return only the last N logs"),
  },
  async ({ head, tail }) => {
    const result = processLogs(logs, { head, tail });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Register get_clicks tool
server.tool(
  "get_clicks",
  "Retrieves captured click events from user interactions. Returns most recent clicks first.",
  {
    head: z.number().optional().describe("Return only the first N clicks (most recent)"),
    tail: z.number().optional().describe("Return only the last N clicks (oldest)"),
    parent_depth: z.number().optional().describe("Include N parent nodes above clicked element"),
    child_depth: z.number().optional().describe("Include N levels of child nodes below clicked element"),
  },
  async ({ head, tail, parent_depth, child_depth }) => {
    const result = processClicks(clicks, { head, tail });

    // Enrich with DOM context if requested
    if ((parent_depth || child_depth) && result.length > 0) {
      const enriched = await Promise.all(
        result.map(async (click) => {
          const enrichedClick: Record<string, unknown> = { ...click };

          try {
            if (parent_depth && parent_depth > 0) {
              const parents = await page.evaluate(
                getParentChainScript(parent_depth),
                click.selector
              );
              enrichedClick.parents = parents;
            }

            if (child_depth && child_depth > 0) {
              const children = await page.evaluate(
                getChildrenScript(child_depth),
                click.selector
              );
              enrichedClick.children = children;
            }
          } catch {
            // Element may no longer exist in DOM
          }

          return enrichedClick;
        })
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(enriched, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Register get_page_info tool
server.tool(
  "get_page_info",
  "Returns current page URL and title",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              url: page.url(),
              title: await page.title(),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Register get_navigations tool
server.tool(
  "get_navigations",
  "Returns navigation history (most recent first)",
  {
    head: z
      .number()
      .optional()
      .describe("Return only the first N navigations"),
  },
  async ({ head }) => {
    const result = head ? navigations.slice(0, head) : navigations;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Register browser-helper prompt
server.prompt(
  "browser-helper",
  "Explains how the browser helper works and provides usage examples",
  async () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `# Browser Helper MCP Server

This MCP server opens a persistent Chromium browser window and captures user interactions. You can observe what the user clicks and what the page logs to the console.

## Available Tools

### get_logs
Retrieves console logs from the browser page.

**Examples:**
- \`get_logs()\` - Returns the last 10 console logs
- \`get_logs({ tail: 5 })\` - Returns the 5 most recent logs
- \`get_logs({ head: 20 })\` - Returns the first 20 logs

### get_clicks
Retrieves user click events with CSS selectors and DOM context.

**Examples:**
- \`get_clicks()\` - Returns recent clicks (most recent first)
- \`get_clicks({ head: 3 })\` - Returns the 3 most recent clicks
- \`get_clicks({ parent_depth: 2 })\` - Include 2 parent elements for context
- \`get_clicks({ child_depth: 1 })\` - Include immediate children of clicked elements

### get_page_info
Returns the current page URL and title.

### get_navigations
Returns navigation history (most recent first).

**Examples:**
- \`get_navigations()\` - Returns all navigation history
- \`get_navigations({ head: 5 })\` - Returns the 5 most recent navigations

## Typical Workflow

1. User navigates to a page in the browser window
2. User interacts with the page (clicks buttons, fills forms, etc.)
3. Use \`get_clicks()\` to see what elements they clicked
4. Use \`get_logs()\` to check for errors or debug output`,
          },
        },
      ],
    };
  }
);

// Main function
async function main() {
  // Parse optional URL from command line
  const startUrl = process.argv[2];

  // Launch persistent browser context (retains cookies, localStorage, etc.)
  browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null, // Disable viewport emulation - browser matches actual window size
  });

  // Get the default page or create one
  page = browser.pages()[0] || await browser.newPage();

  // Setup captures
  setupLogCapture(page);
  await setupClickCapture(page);

  // Track navigation history
  page.on("framenavigated", async (frame) => {
    if (frame === page.mainFrame()) {
      addNavigation(navigations, {
        timestamp: Date.now(),
        url: frame.url(),
        title: await page.title().catch(() => ""),
      });
    }
  });

  // Navigate to URL if provided
  if (startUrl) {
    await page.goto(startUrl);
  }

  // Handle page navigation - re-inject click script
  page.on("load", async () => {
    try {
      // The addInitScript handles new page loads automatically
      // but we need to re-run for same-page navigations
      await page.evaluate(clickCaptureScript);
    } catch {
      // Page might have navigated away
    }
  });

  // Create and connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is used for MCP)
  console.error("[browser-helper] MCP server running");
  console.error(`[browser-helper] User data: ${USER_DATA_DIR}`);
  if (startUrl) {
    console.error(`[browser-helper] Navigated to: ${startUrl}`);
  }

  // Handle browser disconnection (user closed browser window)
  browser.on("close", () => {
    console.error("[browser-helper] Browser closed, exiting...");
    process.exit(0);
  });

  // Handle shutdown signals
  process.on("SIGINT", async () => {
    console.error("[browser-helper] Shutting down...");
    await browser.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.error("[browser-helper] Shutting down...");
    await browser.close();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on("uncaughtException", async (error) => {
    console.error("[browser-helper] Uncaught exception:", error);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason) => {
    console.error("[browser-helper] Unhandled rejection:", reason);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  });
}

main().catch(async (error) => {
  console.error("[browser-helper] Fatal error:", error);
  if (browser) await browser.close().catch(() => {});
  process.exit(1);
});
