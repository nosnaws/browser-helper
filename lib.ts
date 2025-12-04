// Types for captured data
export interface LogEntry {
  timestamp: number;
  type: string;
  text: string;
}

export interface ClickEntry {
  timestamp: number;
  selector: string;
  tagName: string;
  attributes: Record<string, string>;
  textContent: string;
  inputValue?: string;
}

export interface NavigationEntry {
  timestamp: number;
  url: string;
  title: string;
}

// Storage limits
export const MAX_STORED_CLICKS = 50;
export const MAX_STORED_LOGS = 50_000;
export const MAX_STORED_NAVIGATIONS = 50;
export const DEFAULT_LOGS_RETURN = 10;

// Generic capped array utilities
function pushCapped<T>(arr: T[], item: T, max: number): void {
  arr.push(item);
  if (arr.length > max) {
    arr.splice(0, arr.length - max);
  }
}

function unshiftCapped<T>(arr: T[], item: T, max: number): void {
  arr.unshift(item);
  if (arr.length > max) {
    arr.splice(max);
  }
}

// Storage functions with limit enforcement
export function addLog(logs: LogEntry[], log: LogEntry): void {
  pushCapped(logs, log, MAX_STORED_LOGS);
}

export function addClick(clicks: ClickEntry[], click: ClickEntry): void {
  unshiftCapped(clicks, click, MAX_STORED_CLICKS);
}

export function addNavigation(navs: NavigationEntry[], nav: NavigationEntry): void {
  unshiftCapped(navs, nav, MAX_STORED_NAVIGATIONS);
}

// Processing functions for tool handlers
export function processLogs(
  logs: LogEntry[],
  options: { head?: number; tail?: number }
): LogEntry[] {
  if (options.head !== undefined) {
    return logs.slice(0, options.head);
  } else if (options.tail !== undefined) {
    // Handle tail: 0 explicitly since slice(-0) returns entire array
    return options.tail === 0 ? [] : logs.slice(-options.tail);
  }
  return logs.slice(-DEFAULT_LOGS_RETURN);
}

export function processClicks(
  clicks: ClickEntry[],
  options: { head?: number; tail?: number }
): ClickEntry[] {
  if (options.head !== undefined) {
    return clicks.slice(0, options.head);
  } else if (options.tail !== undefined) {
    // Handle tail: 0 explicitly since slice(-0) returns entire array
    return options.tail === 0 ? [] : clicks.slice(-options.tail);
  }
  return clicks;
}
