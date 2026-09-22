export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'sync';
  category: string;
  message: string;
  data?: unknown;
}

class AppLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;
  private listeners: Array<() => void> = [];

  constructor() {
    this.info('SYSTEM', 'AppLogger initialized');
  }

  private add(level: LogEntry['level'], category: string, message: string, data?: unknown) {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      category,
      message,
      data,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.notify();
  }

  info(category: string, message: string, data?: unknown) {
    this.add('info', category, message, data);
    console.log(`[${category}] ${message}`, data ?? '');
  }

  warn(category: string, message: string, data?: unknown) {
    this.add('warn', category, message, data);
    console.warn(`[${category}] ${message}`, data ?? '');
  }

  error(category: string, message: string, data?: unknown) {
    this.add('error', category, message, data);
    console.error(`[${category}] ${message}`, data ?? '');
  }

  sync(message: string, data?: unknown) {
    this.add('sync', 'SYNC', message, data);
    console.log(`[SYNC] ${message}`, data ?? '');
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
    this.notify();
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  exportAsText(): string {
    const header = `=== Smart Fridge TMA Diagnostics ===\nTime: ${new Date().toISOString()}\nPlatform: ${window.Telegram?.WebApp?.platform || 'browser'}\nTG Version: ${window.Telegram?.WebApp?.version || 'N/A'}\nUser ID: ${window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'anonymous'}\n\n`;
    const body = this.logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message} ${l.data ? JSON.stringify(l.data) : ''}`)
      .join('\n');
    return header + body;
  }
}

export const logger = new AppLogger();
