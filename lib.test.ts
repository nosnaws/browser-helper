import { describe, test, expect } from "bun:test";
import {
  addLog,
  addClick,
  processLogs,
  processClicks,
  MAX_STORED_CLICKS,
  MAX_STORED_LOGS,
  DEFAULT_LOGS_RETURN,
  type LogEntry,
  type ClickEntry,
} from "./lib";

// Helper to create mock log entries
function createLog(id: number): LogEntry {
  return {
    timestamp: id,
    type: "log",
    text: `Log message ${id}`,
  };
}

// Helper to create mock click entries
function createClick(id: number): ClickEntry {
  return {
    timestamp: id,
    selector: `#element-${id}`,
    tagName: "button",
    attributes: { id: `element-${id}` },
    textContent: `Click ${id}`,
  };
}

describe("addLog", () => {
  test("appends log to end of array", () => {
    const logs: LogEntry[] = [];
    const log = createLog(1);
    addLog(logs, log);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual(log);
  });

  test("maintains insertion order (oldest first)", () => {
    const logs: LogEntry[] = [];
    addLog(logs, createLog(1));
    addLog(logs, createLog(2));
    addLog(logs, createLog(3));
    expect(logs[0].timestamp).toBe(1);
    expect(logs[1].timestamp).toBe(2);
    expect(logs[2].timestamp).toBe(3);
  });

  test("enforces MAX_STORED_LOGS limit", () => {
    const logs: LogEntry[] = [];
    for (let i = 0; i < MAX_STORED_LOGS + 10; i++) {
      addLog(logs, createLog(i));
    }
    expect(logs).toHaveLength(MAX_STORED_LOGS);
  });

  test("removes oldest logs when limit exceeded", () => {
    const logs: LogEntry[] = [];
    for (let i = 0; i < MAX_STORED_LOGS + 5; i++) {
      addLog(logs, createLog(i));
    }
    // Oldest 5 should be removed, so first log should have timestamp 5
    expect(logs[0].timestamp).toBe(5);
    expect(logs[logs.length - 1].timestamp).toBe(MAX_STORED_LOGS + 4);
  });
});

describe("addClick", () => {
  test("prepends click to start of array (most recent first)", () => {
    const clicks: ClickEntry[] = [];
    addClick(clicks, createClick(1));
    addClick(clicks, createClick(2));
    expect(clicks[0].timestamp).toBe(2);
    expect(clicks[1].timestamp).toBe(1);
  });

  test("enforces MAX_STORED_CLICKS limit", () => {
    const clicks: ClickEntry[] = [];
    for (let i = 0; i < MAX_STORED_CLICKS + 10; i++) {
      addClick(clicks, createClick(i));
    }
    expect(clicks).toHaveLength(MAX_STORED_CLICKS);
  });

  test("removes oldest clicks when limit exceeded", () => {
    const clicks: ClickEntry[] = [];
    for (let i = 0; i < MAX_STORED_CLICKS + 5; i++) {
      addClick(clicks, createClick(i));
    }
    // Most recent 50 should be kept (timestamps 54 down to 5)
    expect(clicks[0].timestamp).toBe(MAX_STORED_CLICKS + 4); // newest
    expect(clicks[clicks.length - 1].timestamp).toBe(5); // oldest kept
  });
});

describe("processLogs", () => {
  const logs = Array.from({ length: 20 }, (_, i) => createLog(i));

  test("returns last DEFAULT_LOGS_RETURN logs by default", () => {
    const result = processLogs(logs, {});
    expect(result).toHaveLength(DEFAULT_LOGS_RETURN);
    expect(result[0].timestamp).toBe(10);
    expect(result[result.length - 1].timestamp).toBe(19);
  });

  test("returns first N logs with head", () => {
    const result = processLogs(logs, { head: 5 });
    expect(result).toHaveLength(5);
    expect(result[0].timestamp).toBe(0);
    expect(result[4].timestamp).toBe(4);
  });

  test("returns last N logs with tail", () => {
    const result = processLogs(logs, { tail: 5 });
    expect(result).toHaveLength(5);
    expect(result[0].timestamp).toBe(15);
    expect(result[4].timestamp).toBe(19);
  });

  test("head takes precedence over tail", () => {
    const result = processLogs(logs, { head: 3, tail: 5 });
    expect(result).toHaveLength(3);
    expect(result[0].timestamp).toBe(0);
  });

  test("returns empty array for empty input", () => {
    const result = processLogs([], {});
    expect(result).toEqual([]);
  });

  test("head: 0 returns empty array", () => {
    const result = processLogs(logs, { head: 0 });
    expect(result).toEqual([]);
  });

  test("tail: 0 returns empty array", () => {
    const result = processLogs(logs, { tail: 0 });
    expect(result).toEqual([]);
  });

  test("head greater than length returns all", () => {
    const result = processLogs(logs, { head: 100 });
    expect(result).toHaveLength(20);
  });

  test("tail greater than length returns all", () => {
    const result = processLogs(logs, { tail: 100 });
    expect(result).toHaveLength(20);
  });
});

describe("processClicks", () => {
  const clicks = Array.from({ length: 10 }, (_, i) => createClick(i));

  test("returns all clicks by default (no limit)", () => {
    const result = processClicks(clicks, {});
    expect(result).toHaveLength(10);
  });

  test("returns first N clicks with head", () => {
    const result = processClicks(clicks, { head: 3 });
    expect(result).toHaveLength(3);
    expect(result[0].timestamp).toBe(0);
    expect(result[2].timestamp).toBe(2);
  });

  test("returns last N clicks with tail", () => {
    const result = processClicks(clicks, { tail: 3 });
    expect(result).toHaveLength(3);
    expect(result[0].timestamp).toBe(7);
    expect(result[2].timestamp).toBe(9);
  });

  test("head takes precedence over tail", () => {
    const result = processClicks(clicks, { head: 2, tail: 5 });
    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe(0);
  });

  test("returns empty array for empty input", () => {
    const result = processClicks([], {});
    expect(result).toEqual([]);
  });
});
