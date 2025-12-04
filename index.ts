import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium, type Page, type Browser } from "playwright";
import { z } from "zod";
import {
  type LogEntry,
  type ClickEntry,
  addLog,
  addClick,
  processLogs,
  processClicks,
} from "./lib";

// Storage for captured events
const logs: LogEntry[] = [];
const clicks: ClickEntry[] = [];

// Playwright instances
let browser: Browser;
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

  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

    window.__reportClick({
      selector: buildSelector(el),
      tagName: el.tagName.toLowerCase(),
      attributes: getAttributes(el),
      textContent: (el.textContent || '').trim().slice(0, 200)
    });
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

// Main function
async function main() {
  // Parse optional URL from command line
  const startUrl = process.argv[2];

  // Launch browser
  browser = await chromium.launch({
    headless: false,
  });

  // Create page
  page = await browser.newPage();

  // Setup captures
  setupLogCapture(page);
  await setupClickCapture(page);

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
  if (startUrl) {
    console.error(`[browser-helper] Navigated to: ${startUrl}`);
  }

  // Handle shutdown
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
}

main().catch((error) => {
  console.error("[browser-helper] Fatal error:", error);
  process.exit(1);
});
