export type ThemeName = 'phosphor' | 'amber' | 'ice';

export interface CodexSettings {
  apiKey: string;
  model: string;
  theme: ThemeName;
  fontScale: number;
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    messagingSenderId: string;
  };
}

export interface TokenStats {
  total: number;
  input: number;
  output: number;
  requests: number;
  updatedAt: number;
  cooldownUntil: number;
  todayTotal: number;
  todayInput: number;
  todayOutput: number;
  weeklyTotal: number;
  weeklyInput: number;
  weeklyOutput: number;
  dayKey: string;
  weekKey: string;
}

export interface TerminalEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

export interface UserMemory {
  displayName: string;
  hobbies: string;
  interests: string;
  notes: string;
  updatedAt: number;
}

export interface ArchivedChat {
  id: string;
  title: string;
  updatedAt: number;
  entries: TerminalEntry[];
}

export type PluginId =
  | 'visionReader' | 'documentReader' | 'zipExplorer' | 'projectPackager'
  | 'codeCanvas' | 'longTermMemory' | 'codeVault' | 'modelInspector'
  | 'jsonInspector' | 'commandKit' | 'responseStream' | 'safePreview'
  | 'chatArchive' | 'workspaceSearch' | 'responseExport';

export type PluginSettings = Record<PluginId, boolean>;

export const DAILY_TOKEN_LIMIT = 20000;
export const WEEKLY_TOKEN_LIMIT = 100000;

const SETTINGS_KEY = 'codex.settings.v2';
const LEGACY_SETTINGS_KEY = 'codex.settings.v1';
const DEFAULT_SETTINGS: CodexSettings = {
  apiKey: '',
  model: 'gemini-3.8-flash',
  theme: 'phosphor',
  fontScale: 1,
  firebaseConfig: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? ''
  }
};

export const DEFAULT_PLUGINS: PluginSettings = {
  visionReader: true,
  documentReader: true,
  zipExplorer: true,
  projectPackager: true,
  codeCanvas: true,
  longTermMemory: true,
  codeVault: true,
  modelInspector: true,
  jsonInspector: true,
  commandKit: true,
  responseStream: true,
  safePreview: true,
  chatArchive: true,
  workspaceSearch: true,
  responseExport: true
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function accountKey(prefix: string, scope: string): string {
  const safe = scope.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `${prefix}.${safe}`;
}

function readGlobalSettings(): CodexSettings {
  let legacy: Partial<CodexSettings> = {};
  try {
    const old = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (old) legacy = JSON.parse(old) as Partial<CodexSettings>;
  } catch {
    legacy = {};
  }
  const global = readJson<CodexSettings>(SETTINGS_KEY, {
    ...DEFAULT_SETTINGS,
    theme: legacy.theme ?? DEFAULT_SETTINGS.theme,
    fontScale: legacy.fontScale ?? DEFAULT_SETTINGS.fontScale,
    firebaseConfig: { ...DEFAULT_SETTINGS.firebaseConfig, ...(legacy.firebaseConfig ?? {}) }
  });
  // Never migrate a legacy global Gemini key. It may have belonged to another account.
  global.apiKey = '';
  try {
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(global));
  } catch {
    // Storage may be unavailable in private browsing; in-memory settings still work.
  }
  return global;
}

export function getSettings(accountScope?: string): CodexSettings {
  const global = readGlobalSettings();
  if (!accountScope) return global;
  const account = readJson<Partial<CodexSettings>>(accountKey('codex.account.settings.v1', accountScope), {});
  return {
    ...global,
    ...account,
    apiKey: account.apiKey ?? '',
      firebaseConfig: global.firebaseConfig
  };
}

export function saveSettings(settings: CodexSettings, accountScope?: string): void {
  const global = {
    ...readGlobalSettings(),
    theme: settings.theme,
    fontScale: settings.fontScale,
    model: DEFAULT_SETTINGS.model,
    apiKey: '',
      firebaseConfig: settings.firebaseConfig
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(global));
    if (accountScope) {
      const account = {
        apiKey: settings.apiKey,
        model: settings.model,
        theme: settings.theme,
        fontScale: settings.fontScale,
      };
      localStorage.setItem(accountKey('codex.account.settings.v1', accountScope), JSON.stringify(account));
    }
  } catch {
    // In-memory use remains available if browser storage is disabled.
  }
}

function jakartaParts(date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value)
  };
}

export function getJakartaPeriodKeys(date = new Date()): { dayKey: string; weekKey: string } {
  const { year, month, day } = jakartaParts(date);
  const dayDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = dayDate.getUTCDay();
  const monday = new Date(dayDate);
  monday.setUTCDate(dayDate.getUTCDate() - ((weekday + 6) % 7));
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    dayKey: `${year}-${pad(month)}-${pad(day)}`,
    weekKey: `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`
  };
}

export function getJakartaResetTimes(date = new Date()): { dayResetAt: number; weekResetAt: number } {
  const { year, month, day } = jakartaParts(date);
  const nowMs = date.getTime();
  const jakartaOffsetMs = 7 * 60 * 60 * 1000;
  const nextDayUtc = Date.UTC(year, month - 1, day + 1);
  const dayResetAt = nextDayUtc - jakartaOffsetMs;
  const dayDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = dayDate.getUTCDay();
  const daysUntilMonday = ((8 - weekday) % 7) || 7;
  const nextMondayUtc = Date.UTC(year, month - 1, day + daysUntilMonday);
  let weekResetAt = nextMondayUtc - jakartaOffsetMs;
  if (weekResetAt <= nowMs) weekResetAt += 7 * 24 * 60 * 60 * 1000;
  return { dayResetAt, weekResetAt };
}

export function normalizeTokenStats(stats: TokenStats, date = new Date()): TokenStats {
  const keys = getJakartaPeriodKeys(date);
  const hasPeriodSchema = Boolean(stats.dayKey && stats.weekKey);
  const normalized: TokenStats = {
    ...stats,
    // Old lifetime counters must not silently become today's or this week's usage.
    todayTotal: hasPeriodSchema ? (stats.todayTotal ?? 0) : 0,
    todayInput: hasPeriodSchema ? (stats.todayInput ?? 0) : 0,
    todayOutput: hasPeriodSchema ? (stats.todayOutput ?? 0) : 0,
    weeklyTotal: hasPeriodSchema ? (stats.weeklyTotal ?? 0) : 0,
    weeklyInput: hasPeriodSchema ? (stats.weeklyInput ?? 0) : 0,
    weeklyOutput: hasPeriodSchema ? (stats.weeklyOutput ?? 0) : 0,
    dayKey: hasPeriodSchema ? stats.dayKey : keys.dayKey,
    weekKey: hasPeriodSchema ? stats.weekKey : keys.weekKey
  };
  if (normalized.dayKey !== keys.dayKey) {
    normalized.todayTotal = 0;
    normalized.todayInput = 0;
    normalized.todayOutput = 0;
    normalized.dayKey = keys.dayKey;
  }
  if (normalized.weekKey !== keys.weekKey) {
    normalized.weeklyTotal = 0;
    normalized.weeklyInput = 0;
    normalized.weeklyOutput = 0;
    normalized.weekKey = keys.weekKey;
  }
  normalized.cooldownUntil = stats.cooldownUntil ?? 0;
  if (normalized.cooldownUntil > 0 && date.getTime() >= normalized.cooldownUntil) {
    normalized.todayTotal = 0; normalized.todayInput = 0; normalized.todayOutput = 0;
    normalized.weeklyTotal = 0; normalized.weeklyInput = 0; normalized.weeklyOutput = 0;
    normalized.cooldownUntil = 0;
  }
  normalized.updatedAt = date.getTime();
  return normalized;
}

export function getTokenStats(username: string): TokenStats {
  const keys = getJakartaPeriodKeys();
  const fallback: TokenStats = {
    total: 0, input: 0, output: 0, requests: 0, updatedAt: Date.now(), cooldownUntil: 0,
    todayTotal: 0, todayInput: 0, todayOutput: 0,
    weeklyTotal: 0, weeklyInput: 0, weeklyOutput: 0,
    dayKey: keys.dayKey, weekKey: keys.weekKey
  };
  return normalizeTokenStats(readJson<TokenStats>(statsKey(username), fallback));
}

export function statsKey(username: string): string {
  return accountKey('codex.stats', username);
}

export function saveTokenStats(username: string, stats: TokenStats): void {
  localStorage.setItem(statsKey(username), JSON.stringify(stats));
}

export function historyKey(username: string): string {
  return accountKey('codex.history', username);
}

export function getHistory(username: string): TerminalEntry[] {
  try {
    const raw = localStorage.getItem(historyKey(username));
    return raw ? JSON.parse(raw) as TerminalEntry[] : [];
  } catch {
    return [];
  }
}

export function saveHistory(username: string, entries: TerminalEntry[]): void {
  localStorage.setItem(historyKey(username), JSON.stringify(entries.slice(-160)));
}

export function getLocalSnippets(username: string): Array<{ name: string; code: string; updatedAt: number }> {
  try {
    return JSON.parse(localStorage.getItem(accountKey('codex.snippets', username)) ?? '[]') as Array<{ name: string; code: string; updatedAt: number }>;
  } catch {
    return [];
  }
}

export function saveLocalSnippets(username: string, snippets: Array<{ name: string; code: string; updatedAt: number }>): void {
  localStorage.setItem(accountKey('codex.snippets', username), JSON.stringify(snippets));
}

export function clearLocalHistory(username: string): void {
  localStorage.removeItem(historyKey(username));
}

export function getUserMemory(username: string): UserMemory {
  return readJson<UserMemory>(accountKey('codex.memory', username), {
    displayName: username,
    hobbies: '', interests: '', notes: '', updatedAt: 0
  });
}

export function saveUserMemory(username: string, memory: UserMemory): void {
  localStorage.setItem(accountKey('codex.memory', username), JSON.stringify(memory));
}

export function getPluginSettings(username: string): PluginSettings {
  return readJson<PluginSettings>(accountKey('codex.plugins', username), DEFAULT_PLUGINS);
}

export function savePluginSettings(username: string, plugins: PluginSettings): void {
  localStorage.setItem(accountKey('codex.plugins', username), JSON.stringify(plugins));
}

export function getArchivedChats(username: string): ArchivedChat[] {
  try {
    return JSON.parse(localStorage.getItem(accountKey('codex.chat.archive', username)) ?? '[]') as ArchivedChat[];
  } catch {
    return [];
  }
}

export function archiveChat(username: string, entries: TerminalEntry[]): ArchivedChat[] {
  const key = accountKey('codex.chat.archive', username);
  try {
    const previous = getArchivedChats(username);
    const conversational = entries.filter((entry) => entry.role === 'user' || entry.role === 'assistant');
    if (!conversational.length) return previous;
    const title = conversational.find((entry) => entry.role === 'user')?.text.slice(0, 52) ?? 'Previous chat';
    const next = [{ id: crypto.randomUUID(), title, updatedAt: Date.now(), entries: entries.slice(-80) }, ...previous].slice(0, 40);
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

/** Random lock time (20 to 120 minutes) so the limit pause is never the same twice. */
export function randomLockMs(): number {
  return Math.floor((20 + Math.random() * 100) * 60 * 1000);
}
