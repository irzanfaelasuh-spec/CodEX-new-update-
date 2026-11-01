import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, RefObject } from 'react';
import gsap from 'gsap';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Check,
  CheckCircle,
  Clock,
  ClockCounterClockwise,
  CodeBlock,
  Command,
  CopySimple,
  Cube,
  DownloadSimple,
  Eye,
  EyeSlash,
  FileText,
  FolderOpen,
  Gauge,
  GearSix,
  Info,
  Key,
  List,
  LockKey,
  PaperPlaneRight,
  Plus,
  Question,
  SignOut,
  SlidersHorizontal,
  Sparkle,
  TerminalWindow,
  Trash,
  UserCircle,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import {
  extractCodeBlocks,
  fetchGeminiModels,
  generateGeminiReply,
  type GeminiModel,
  type GeminiTurn,
} from './lib/gemini';
import {
  getHistory,
  getLocalSnippets,
  getSettings,
  getTokenStats,
  saveHistory,
  saveLocalSnippets,
  saveSettings,
  saveTokenStats,
  type CodexSettings,
  type TerminalEntry,
  type ThemeName,
  type TokenStats,
  DAILY_TOKEN_LIMIT,
  WEEKLY_TOKEN_LIMIT,
  getJakartaPeriodKeys,
  getJakartaResetTimes,
  normalizeTokenStats,
  randomLockMs,
  getUserMemory,
  saveUserMemory,
  getPluginSettings,
  savePluginSettings,
  archiveChat,
  getArchivedChats,
  DEFAULT_PLUGINS,
  type UserMemory,
  type PluginSettings,
  type PluginId,
  type ArchivedChat,
} from './lib/storage';
import { prepareUploads } from './lib/uploads';
import type { GeminiAttachment } from './lib/gemini';
import { createZip } from './lib/zip';
import { textToPdf } from './lib/pdf';
import { saveFile, mimeFor, ensureNotify, notifyDone, onNotifyTap, isAppActive, waitUntilActive, voiceSupported, recordVoice } from './lib/native';
import { transcribeAudio } from './lib/gemini';
import { Microphone } from '@phosphor-icons/react';
import {
  isFirebaseConfigured,
  loginAccount,
  logoutAccount,
  registerAccount,
  restoreSession,
  type SignedInUser,
} from './lib/auth';
import './styles.css';

type Stage = 'boot' | 'login' | 'welcome' | 'terminal';
type AuthMode = 'login' | 'register';
type Panel = 'overview' | 'console' | 'usage' | 'models' | 'status' | 'settings' | 'config' | 'history' | 'files' | 'snippets' | 'plugins' | 'memory' | 'canvas' | 'help';
type SavedFile = { name: string; code: string; language: string; updatedAt: number };
type SavedSnippet = { name: string; code: string; updatedAt: number };
type PendingUpload = { id: string; file: File; previewUrl?: string };
type AppStyle = CSSProperties & { '--font-scale': number };
const NAV_ITEMS: Array<{ id: Panel; label: string; icon: typeof TerminalWindow; group: string }> = [
  { id: 'overview', label: 'Overview', icon: Gauge, group: 'WORKSPACE' },
  { id: 'console', label: 'Console', icon: TerminalWindow, group: 'WORKSPACE' },
  { id: 'usage', label: 'Usage', icon: Gauge, group: 'INSPECT' },
  { id: 'models', label: 'Models', icon: Cube, group: 'INSPECT' },
  { id: 'status', label: 'Status', icon: List, group: 'INSPECT' },
  { id: 'history', label: 'History', icon: ClockCounterClockwise, group: 'TOOLS' },
  { id: 'files', label: 'Files', icon: FolderOpen, group: 'TOOLS' },
  { id: 'snippets', label: 'Snippets', icon: CodeBlock, group: 'TOOLS' },
  { id: 'canvas', label: 'Canvas', icon: Eye, group: 'TOOLS' },
  { id: 'plugins', label: 'Plugins', icon: Sparkle, group: 'TOOLS' },
  { id: 'memory', label: 'Memory', icon: UserCircle, group: 'TOOLS' },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal, group: 'SYSTEM' },
  { id: 'config', label: 'Config', icon: GearSix, group: 'SYSTEM' },
  { id: 'help', label: 'Help', icon: Question, group: 'SYSTEM' },
];

const PLUGIN_CATALOG: Array<{ id: PluginId; name: string; description: string; category: string }> = [
  { id: 'visionReader', name: 'Vision Reader', description: 'Send photos to Gemini for image understanding.', category: 'MULTIMODAL' },
  { id: 'documentReader', name: 'Document Reader', description: 'Read text, source code, Markdown, CSV, JSON, PDF and DOCX files.', category: 'FILES' },
  { id: 'zipExplorer', name: 'Archive Explorer', description: 'Extract ZIP archives locally and inspect readable file contents.', category: 'FILES' },
  { id: 'projectPackager', name: 'Project Packager', description: 'Package generated files and nested folders into a downloadable ZIP.', category: 'FILES' },
  { id: 'codeCanvas', name: 'Live Canvas', description: 'Preview generated HTML automatically in a sandboxed frame.', category: 'DEVELOPER' },
  { id: 'longTermMemory', name: 'Profile Memory', description: 'Include your saved name, hobbies and interests in AI context.', category: 'PERSONAL' },
  { id: 'codeVault', name: 'Code Vault', description: 'Keep generated files in your account-local file library.', category: 'DEVELOPER' },
  { id: 'modelInspector', name: 'Model Inspector', description: 'Load real model IDs returned by the Gemini API.', category: 'AI' },
  { id: 'jsonInspector', name: 'JSON Inspector', description: 'Attach JSON files as readable text for inspection.', category: 'FILES' },
  { id: 'commandKit', name: 'Command Kit', description: 'Use built-in commands such as help, new, files and usage.', category: 'TERMINAL' },
  { id: 'responseStream', name: 'Typewriter Output', description: 'Reveal assistant responses progressively in the console.', category: 'INTERFACE' },
  { id: 'safePreview', name: 'Sandbox Guard', description: 'Run HTML previews inside an isolated browser frame.', category: 'SECURITY' },
  { id: 'chatArchive', name: 'Chat Archive', description: 'Keep previous conversations when starting a fresh chat.', category: 'PERSONAL' },
  { id: 'workspaceSearch', name: 'Workspace Search', description: 'Find words and symbols across generated project files.', category: 'DEVELOPER' },
  { id: 'responseExport', name: 'Response Export', description: 'Download the current terminal conversation as a text transcript.', category: 'FILES' }
];

const SYSTEM_GREETING: TerminalEntry = {
  id: 'codex-start',
  role: 'system',
  text: 'CodEX AI terminal ready. Type `help` to view available commands.\nGemini connection is waiting for an API key.',
  timestamp: Date.now(),
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour12: false });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, '0')).join(':');
}

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('codex-toast', { detail: message }));
}

function downloadText(name: string, content: string): void {
  downloadBlob(name, name.toLowerCase().endsWith('.pdf') ? textToPdf(content) : new Blob([content], { type: mimeFor(name) }));
}

async function copyText(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Continue to the selection-based fallback for older browser shells.
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('Clipboard access is unavailable in this browser.');
}

function downloadBlob(name: string, blob: Blob): void {
  saveFile(name, blob).then(toast).catch((error) => toast(`Download failed: ${error instanceof Error ? error.message : 'unknown error'}`));
}

function safeRelativePath(name: string): string {
  return name.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.' && part !== '..')
    .map((part) => part.replace(/[<>:"|?*\\]/g, '-').slice(0, 100)).join('/') || 'codex-output.txt';
}

function buildCanvasDocument(htmlFile: SavedFile | undefined, allFiles: SavedFile[], safeScripts: boolean): string {
  if (!htmlFile) return '<!doctype html><html><body style="background:#080b09;color:#d7e4da;font:14px monospace;padding:24px">No HTML file selected.</body></html>';
  let html = htmlFile.code;
  for (const file of allFiles) {
    if (/\.css$/i.test(file.name)) {
      const escaped = file.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(`<link([^>]+)href=["'][^"']*${escaped}["']([^>]*)>`, 'gi'), `<style>\n${file.code}\n</style>`);
    }
  }
  for (const file of allFiles) {
    if (/\.(js|mjs)$/i.test(file.name)) {
      const escaped = file.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(`<script([^>]+)src=["'][^"']*${escaped}["']([^>]*)><\/script>`, 'gi'), `<script>\n${file.code}\n<\/script>`);
    }
  }
  if (!/<meta[^>]+charset=/i.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1><meta charset="utf-8">');
  if (!/<meta[^>]+name=["']viewport/i.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1><meta name="viewport" content="width=device-width, initial-scale=1">');
  if (!safeScripts) return html;
  return html;
}

function makeProfileContext(user: SignedInUser | null, memory: UserMemory, enabled: boolean): string {
  if (!user) return '';
  const lines = [`Account name: ${user.username}.`];
  if (enabled) {
    if (memory.displayName.trim()) lines.push(`Preferred name: ${memory.displayName.trim()}.`);
    if (memory.hobbies.trim()) lines.push(`Hobbies: ${memory.hobbies.trim()}.`);
    if (memory.interests.trim()) lines.push(`Interests: ${memory.interests.trim()}.`);
    if (memory.notes.trim()) lines.push(`User-provided notes: ${memory.notes.trim()}.`);
  }
  return lines.join('\n');
}

function jakartaResetLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp)) + ' WIB';
}

function parseMessage(text: string): Array<{ type: 'text' | 'code'; value: string; language: string; filename: string }> {
  const parts: Array<{ type: 'text' | 'code'; value: string; language: string; filename: string }> = [];
  const inferredFiles = extractCodeBlocks(text);
  const expression = /```([\w+#.-]*)(?:\s+filename=["']([^"']+)["'])?\s*\n([\s\S]*?)```/g;
  let cursor = 0;
  let index = 1;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    if (match.index > cursor) parts.push({ type: 'text', value: text.slice(cursor, match.index), language: '', filename: '' });
    parts.push({ type: 'code', value: match[3].replace(/\n$/, ''), language: match[1] || 'text', filename: match[2] || inferredFiles[index - 1]?.filename || `codex-output-${index}.txt` });
    cursor = expression.lastIndex;
    index += 1;
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor), language: '', filename: '' });
  return parts.length ? parts : [{ type: 'text', value: text, language: '', filename: '' }];
}

function BootScreen({ onComplete }: { onComplete: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const timeline = gsap.timeline({ onComplete });
    timeline
      .fromTo('.boot-symbol', { opacity: 0, scale: 0.74, rotate: -12, filter: 'blur(12px)' }, { opacity: 1, scale: 1, rotate: 0, filter: 'blur(0px)', duration: 1.15, ease: 'power3.out' })
      .fromTo('.boot-title', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out' }, '-=0.35')
      .fromTo('.boot-subtitle', { opacity: 0 }, { opacity: 1, duration: 0.7 }, '-=0.1')
      .fromTo('.boot-progress-fill', { scaleX: 0 }, { scaleX: 1, duration: 4.4, ease: 'power1.inOut' }, '-=0.1')
      .to('.boot-status', { opacity: 0.42, duration: 0.4 }, '-=0.3')
      .to('.boot-content', { opacity: 0, y: -12, duration: 0.45, ease: 'power2.in' }, '+=0.15')
      .to('.boot-status', { opacity: 0.12, duration: 0.75 });
    return () => { timeline.kill(); };
  }, [onComplete]);

  return (
    <div className="boot-screen" ref={rootRef}>
      <div className="boot-grid" />
      <div className="boot-content">
        <div className="boot-symbol"><span> C<span className="boot-cross">×</span></span><i /></div>
        <div className="boot-title">CodEX <span>AI</span></div>
        <div className="boot-subtitle">Welcome to CodEX ai</div>
        <div className="boot-progress"><span className="boot-progress-fill" /></div>
        <div className="boot-status"><span className="pulse-dot" /> INITIALIZING TERMINAL ENVIRONMENT</div>
        <div className="boot-version">BUILD 1.1.0 / GEMINI INTERFACE</div>
      </div>
      <div className="boot-corner boot-corner-top">CDEX / SYS</div>
      <div className="boot-corner boot-corner-bottom">STARTUP SEQUENCE</div>
    </div>
  );
}

function LoginScreen({ onLogin, onRegister, cloudMode }: {
  onLogin: (name: string, password: string) => Promise<void>;
  onRegister: (name: string, password: string) => Promise<void>;
  cloudMode: boolean;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await onLogin(name, password);
      else await onRegister(name, password);
    } catch (value) {
      const message = value instanceof Error ? value.message : 'Something went wrong.';
      setError(message);
      gsap.fromTo(formRef.current, { x: -7 }, { x: 0, duration: 0.52, ease: 'elastic.out(1, 0.3)', clearProps: 'x' });
      gsap.fromTo('.login-panel', { borderColor: 'rgba(255, 73, 83, .92)', boxShadow: '0 0 0 1px rgba(255, 73, 83, .25), 0 0 30px rgba(255, 73, 83, .12)' }, { borderColor: 'rgba(125, 163, 135, .19)', boxShadow: '0 0 0 1px rgba(125, 163, 135, .05)', duration: 1.1, ease: 'power2.out' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-screen">
      <div className="login-ambient" />
      <div className="login-topline"><span>CODEX / AUTH GATE</span><span>SECURE SESSION</span></div>
      <section className="login-layout">
        <div className="login-intro">
          <div className="mini-mark">C<span>×</span></div>
          <div className="eyebrow"><span className="pulse-dot" /> TERMINAL ACCESS</div>
          <h1>Welcome to<br /><span>CodEX ai</span></h1>
          <p>A quiet workspace for code, systems and ideas.</p>
          <div className="intro-rule"><span /> <small>EST. 2026 / BUILD 01</small></div>
        </div>
        <div className="login-panel">
          <div className="panel-top"><span>AUTHENTICATION</span><span className="panel-code">0x01</span></div>
          <div className="auth-switch" role="tablist" aria-label="Account mode">
            <button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(''); }}>LOGIN</button>
            <button type="button" className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError(''); }}>CREATE ACCOUNT</button>
          </div>
          <form ref={formRef} onSubmit={submit}>
            <label htmlFor="account-name">NAME</label>
            <div className="login-input-wrap"><UserCircle size={17} weight="light" /><input id="account-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="your_name" autoComplete="username" required minLength={3} maxLength={20} /></div>
            <label htmlFor="account-password">PASSWORD</label>
            <div className="login-input-wrap"><LockKey size={17} weight="light" /><input id="account-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} /><button className="reveal-button" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeSlash size={17} /> : <Eye size={17} />}</button></div>
            {error && <div className="login-error" role="alert"><WarningCircle size={16} /> <span>{error}</span></div>}
            <button className="enter-button" type="submit" disabled={busy}>
              <span>{busy ? 'PLEASE WAIT' : mode === 'login' ? 'ENTER TERMINAL' : 'CREATE ACCOUNT'}</span>
              <span className="enter-arrow">{busy ? <span className="mini-loader" /> : '↗'}</span>
            </button>
          </form>
          <div className="auth-foot"><span>{cloudMode ? 'FIREBASE CLOUD AUTH' : 'LOCAL DEVICE AUTH'}</span><span><i /> {cloudMode ? 'CLOUD READY' : 'DEVICE ONLY'}</span></div>
        </div>
      </section>
      <div className="login-bottom"><span>CODEx AI TERMINAL</span><span>NO EMAIL REQUIRED / NAME + PASSWORD</span></div>
    </main>
  );
}

function WelcomeScreen({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    gsap.fromTo(ref.current, { opacity: 0, y: 24, filter: 'blur(9px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.85, ease: 'power3.out' });
  }, []);
  return (
    <div className="welcome-screen" ref={ref}>
      <div className="welcome-mark">C<span>×</span></div>
      <div className="welcome-line">SESSION ESTABLISHED</div>
      <h1>Welcome, <span>{name}</span></h1>
      <p>Preparing your terminal environment</p>
      <div className="welcome-loader"><span /></div>
    </div>
  );
}

function ClockBlock({ now }: { now: Date }) {
  return (
    <div className="clock-block" aria-label={`Current time ${formatTime(now)}`}>
      <div className="clock-time">{formatTime(now)}</div>
      <div className="clock-date">{formatDate(now)}</div>
    </div>
  );
}

function MessageBody({ text, onSaveFile }: { text: string; onSaveFile: (name: string, code: string, language: string) => void }) {
  const segments = useMemo(() => parseMessage(text), [text]);
  return (
    <div className="message-body">
      {segments.map((segment, index) => segment.type === 'code' ? (
        <div className="code-window" key={`${index}-${segment.filename}`}>
          <div className="code-window-head"><span className="code-file"><CodeBlock size={14} /> {segment.filename}</span><span className="code-lang">{segment.language}</span></div>
          <pre><code>{segment.value}</code></pre>
          <div className="code-window-actions">
            <button type="button" onClick={() => void copyText(segment.value)}><CopySimple size={14} /> COPY CODE</button>
            <button type="button" onClick={() => onSaveFile(segment.filename, segment.value, segment.language)}><DownloadSimple size={14} /> SAVE FILE</button>
          </div>
        </div>
      ) : <p className="message-text" key={index}>{segment.value}</p>)}
    </div>
  );
}

function ThinkingLog({ phases }: { phases: string[] }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSec((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="thinking-log" aria-live="polite">
      <div className="thinking-row"><span className="thinking-mark">[ AI ]</span><span className="thinking-text">working<span>.</span><span>.</span><span>.</span></span><span className="thinking-cursor" /><span className="thinking-elapsed">{sec}s</span></div>
      {phases.map((phase, index) => <div className="thinking-step" key={`${index}-${phase}`}><span className="prompt-symbol">{index === phases.length - 1 ? '▸' : '✓'}</span> {phase}</div>)}
    </div>
  );
}

function ConsolePanel({
  entries,
  busy,
  prompt,
  setPrompt,
  onSubmit,
  onSaveFile,
  model,
  apiReady,
  inputRef,
  onHistoryKey,
  pendingUploads,
  onPickFiles,
  onRemoveUpload,
  onStop,
  onRetry,
  onTranscribe,
  phases,
}: {
  entries: TerminalEntry[];
  busy: boolean;
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: () => void;
  onSaveFile: (name: string, code: string, language: string) => void;
  model: string;
  apiReady: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onHistoryKey: (key: 'ArrowUp' | 'ArrowDown') => string | null;
  pendingUploads: PendingUpload[];
  onPickFiles: (files: FileList | null) => void;
  onRemoveUpload: (id: string) => void;
  onStop: () => void;
  onRetry: (text: string) => void;
  onTranscribe: (blob: Blob) => Promise<string>;
  phases: string[];
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const [voice, setVoice] = useState<'idle' | 'rec' | 'busy'>('idle');
  const recRef = useRef<{ stop: () => Promise<Blob> } | null>(null);
  const toggleVoice = async () => {
    if (voice === 'busy') return;
    if (voice === 'rec' && recRef.current) {
      const rec = recRef.current;
      recRef.current = null;
      setVoice('busy');
      try {
        const text = await onTranscribe(await rec.stop());
        setPrompt(prompt ? `${prompt.trimEnd()} ${text}` : text);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Voice transcription failed.');
      } finally {
        setVoice('idle');
      }
      return;
    }
    try {
      recRef.current = await recordVoice();
      setVoice('rec');
      toast('Recording... tap the mic again to turn speech into text.');
    } catch {
      toast('Microphone permission was denied or is unavailable.');
    }
  };
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries, busy]);
  const promptSuggestions = ['Create a responsive landing page', 'Explain this JavaScript error', 'Build a Python file organizer'];

  return (
    <section className="console-panel">
      <div className="console-toolbar">
        <div className="console-tab"><span className="window-dot red" /><span className="window-dot amber" /><span className="window-dot green" /><span className="tab-divider" /> <TerminalWindow size={15} /> <span>codex-console</span></div>
        <div className="console-toolbar-right"><span className="model-chip">{model || 'NO MODEL'}</span><span className={`connection-chip ${apiReady ? 'online' : 'offline'}`}><i /> {apiReady ? 'LINK READY' : 'KEY REQUIRED'}</span></div>
      </div>
      <div className="terminal-log" ref={logRef}>
        <div className="terminal-welcome-line"><span className="prompt-symbol">$</span> codex --initialize</div>
        {entries.map((entry) => (
          <article className={`terminal-entry ${entry.role}`} key={entry.id}>
            <div className="entry-meta"><span className="entry-role">{entry.role === 'user' ? 'YOU' : entry.role === 'assistant' ? 'CODEX AI' : 'SYSTEM'}</span><span>{new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour12: false })}</span>{entry.model && <span className="entry-model">{entry.model}</span>}</div>
            {entry.role === 'user' ? <p className="user-command"><span className="prompt-symbol">›</span> {entry.text}</p> : <MessageBody text={entry.text} onSaveFile={onSaveFile} />}
            {entry.role === 'user' && !busy && <div className="entry-actions"><button type="button" onClick={() => onRetry(entry.text.replace(/\n\[ATTACHMENTS: [^\]]*\]$/, ''))}>↻ RETRY</button><button type="button" onClick={() => setPrompt(`> ${entry.text.split('\n')[0]}\n`)}>« REPLY</button></div>}
            {entry.role === 'assistant' && entry.text && <div className="entry-actions"><button type="button" onClick={() => void copyText(entry.text)}><CopySimple size={13} /> COPY RESPONSE</button>{typeof entry.inputTokens === 'number' && <span>{formatNumber(entry.inputTokens + (entry.outputTokens ?? 0))} TOKENS</span>}</div>}
          </article>
        ))}
        {busy && <ThinkingLog phases={phases} />}
        {entries.length <= 1 && !busy && <div className="console-suggestions"><div className="suggestion-heading">QUICK START</div>{promptSuggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setPrompt(suggestion)}><span>↳</span>{suggestion}</button>)}</div>}
      </div>
      <div className="console-input-area">
        {pendingUploads.length > 0 && <div className="upload-tray" aria-label="Pending attachments">{pendingUploads.map((item) => <div className="upload-chip" key={item.id}>{item.previewUrl ? <img src={item.previewUrl} alt="" /> : <FileText size={14} />}<span>{item.file.name}</span><button type="button" onClick={() => onRemoveUpload(item.id)} aria-label={`Remove ${item.file.name}`}>×</button></div>)}</div>}
        <div className="input-hint"><span>INPUT</span><span>ENTER TO SEND <kbd>CTRL</kbd> + <kbd>ENTER</kbd> ALSO WORKS</span></div>
        <div className="terminal-input-box">
          <span className="input-prefix">{busy ? '…' : '›'}</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                const recalled = onHistoryKey(event.key);
                if (recalled !== null) { event.preventDefault(); setPrompt(recalled); }
                return;
              }
              if (event.key === 'Enter' && (event.ctrlKey || !event.shiftKey)) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Enter a command or ask CodEX AI..."
            disabled={busy}
            aria-label="Terminal command input"
          />
          <label className="attach-button" htmlFor="codex-file-upload" title="Attach image, document, source file or ZIP"><Plus size={19} /><span>ATTACH</span></label>
          <input id="codex-file-upload" className="hidden-file-input" type="file" multiple disabled={busy} accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf,.txt,.md,.csv,.tsv,.json,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.php,.go,.rs,.kt,.swift,.sh,.sql,.yaml,.yml,.toml,.ini,.log,.svg,.zip,.docx" onChange={(event) => { onPickFiles(event.target.files); event.currentTarget.value = ''; }} />
          {voiceSupported() && <button type="button" className={`send-button mic-button${voice === 'rec' ? ' listening' : ''}`} onClick={() => void toggleVoice()} disabled={busy || voice === 'busy'} aria-label={voice === 'rec' ? 'Stop recording and transcribe' : 'Start voice input'} title="Voice to text">{voice === 'busy' ? <span className="mini-loader" /> : <Microphone size={18} />}</button>}
          {busy ? <button type="button" className="send-button stop-button" onClick={onStop} aria-label="Stop generating" title="Stop"><span className="stop-glyph">■</span></button> : <button type="button" className="send-button" onClick={onSubmit} disabled={!prompt.trim() && pendingUploads.length === 0} aria-label="Send command"><PaperPlaneRight size={18} weight="regular" /></button>}
        </div>
        <div className="input-footer"><span><kbd>↑</kbd><kbd>↓</kbd> COMMAND HISTORY</span><span>SHIFT + ENTER FOR NEW LINE</span></div>
      </div>
    </section>
  );
}

function emptyTokenStats(): TokenStats {
  const keys = getJakartaPeriodKeys();
  return {
    total: 0, input: 0, output: 0, requests: 0, updatedAt: Date.now(), cooldownUntil: 0,
    todayTotal: 0, todayInput: 0, todayOutput: 0,
    weeklyTotal: 0, weeklyInput: 0, weeklyOutput: 0,
    dayKey: keys.dayKey, weekKey: keys.weekKey
  };
}

function StatBlock({ label, value, suffix, detail }: { label: string; value: string; suffix?: string; detail?: string }) {
  return <div className="stat-block"><div className="stat-label">{label}</div><div className="stat-value">{value}{suffix && <small>{suffix}</small>}</div>{detail && <div className="stat-detail">{detail}</div>}</div>;
}

function App() {
  const [settings, setSettings] = useState<CodexSettings>(() => getSettings());
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [stage, setStage] = useState<Stage>('boot');
  const [panel, setPanel] = useState<Panel>('overview');
  const [entries, setEntries] = useState<TerminalEntry[]>([SYSTEM_GREETING]);
  const [stats, setStats] = useState<TokenStats>(() => emptyTokenStats());
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const abortRef = useRef<AbortController | null>(null);
  const [phases, setPhases] = useState<string[]>([]);
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [files, setFiles] = useState<SavedFile[]>([]);
  const [snippets, setSnippets] = useState<SavedSnippet[]>([]);
  const [archivedChats, setArchivedChats] = useState<ArchivedChat[]>([]);
  const [snippetName, setSnippetName] = useState('');
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [bootDone, setBootDone] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [memory, setMemory] = useState<UserMemory>({ displayName: '', hobbies: '', interests: '', notes: '', updatedAt: 0 });
  const [plugins, setPlugins] = useState<PluginSettings>(DEFAULT_PLUGINS);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [isPackaging, setIsPackaging] = useState(false);
  const [selectedHtmlName, setSelectedHtmlName] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const apiReady = settings.apiKey.trim().length > 10;
  const cloudMode = isFirebaseConfigured(settings.firebaseConfig);
  const usagePercentToday = Math.min(100, (stats.todayTotal / DAILY_TOKEN_LIMIT) * 100);
  const usagePercentWeekly = Math.min(100, (stats.weeklyTotal / WEEKLY_TOKEN_LIMIT) * 100);
  const usagePercent = Math.max(usagePercentToday, usagePercentWeekly);
  const quotaBlocked = stats.todayTotal >= DAILY_TOKEN_LIMIT || stats.weeklyTotal >= WEEKLY_TOKEN_LIMIT;
  const resetTimes = getJakartaResetTimes(now);
  const blockedUntil = stats.cooldownUntil > now.getTime() ? stats.cooldownUntil : (stats.weeklyTotal >= WEEKLY_TOKEN_LIMIT ? resetTimes.weekResetAt : resetTimes.dayResetAt);
  const cooldownActive = quotaBlocked;
  const resetCountdown = Math.max(0, blockedUntil - now.getTime());
  const htmlFiles = files.filter((file) => /\.html?$/i.test(file.name));
  const selectedHtml = htmlFiles.find((file) => file.name === selectedHtmlName) ?? htmlFiles[0];

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const restored = await restoreSession(settings.firebaseConfig);
      if (!active) return;
      if (restored) {
        setUser(restored);
        const accountSettings = getSettings(restored.uid);
        setSettings(accountSettings);
        setMemory(getUserMemory(restored.username));
        setPlugins(getPluginSettings(restored.username));
        setEntries(getHistory(restored.username).length ? getHistory(restored.username) : [SYSTEM_GREETING]);
        setArchivedChats(getArchivedChats(restored.username));
        setStats(getTokenStats(restored.username));
        setSnippets(getLocalSnippets(restored.username));
        setStage('terminal');
        setPanel(accountSettings.apiKey.trim() ? 'overview' : 'settings');
      } else {
        setStage('boot');
      }
      setBootDone(true);
    };
    void restore();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (stage !== 'terminal' || !user || busy) return;
    saveHistory(user.username, entries);
    saveTokenStats(user.username, stats);
    saveLocalSnippets(user.username, snippets);
  }, [entries, stats, snippets, stage, user, busy]);

  useEffect(() => {
    if (!user) return;
    const normalized = normalizeTokenStats(stats, now);
    if (normalized.dayKey !== stats.dayKey || normalized.weekKey !== stats.weekKey || (stats.cooldownUntil > 0 && normalized.cooldownUntil === 0)) {
      setStats(normalized);
    }
  }, [now, user, stats]);


  useEffect(() => {
    if (!user || stage !== 'terminal') return;
    saveUserMemory(user.username, memory);
  }, [memory, user, stage]);

  useEffect(() => {
    if (!user || stage !== 'terminal') return;
    savePluginSettings(user.username, plugins);
  }, [plugins, user, stage]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const finishBoot = useCallback(() => setStage('login'), []);

  const updateSettings = useCallback((next: CodexSettings) => {
    setSettings(next);
    saveSettings(next, user?.uid);
  }, [user?.uid]);

  const enterTerminal = useCallback((signedIn: SignedInUser) => {
    const accountSettings = getSettings(signedIn.uid);
    setUser(signedIn);
    setSettings(accountSettings);
    setMemory(getUserMemory(signedIn.username));
    setPlugins(getPluginSettings(signedIn.username));
    setEntries(getHistory(signedIn.username).length ? getHistory(signedIn.username) : [
      { ...SYSTEM_GREETING, timestamp: Date.now() },
      { id: crypto.randomUUID(), role: 'system', text: `Welcome back, ${signedIn.username}. Your account memory is ready.`, timestamp: Date.now() }
    ]);
    setArchivedChats(getArchivedChats(signedIn.username));
    setStats(getTokenStats(signedIn.username));
    setSnippets(getLocalSnippets(signedIn.username));
    setPendingUploads([]);
    setPanel(accountSettings.apiKey.trim() ? 'overview' : 'settings');
    setStage('welcome');
    window.setTimeout(() => setStage('terminal'), 1450);
  }, []);

  const handleLogin = useCallback(async (name: string, password: string) => {
    const signedIn = await loginAccount(name, password, settings.firebaseConfig);
    enterTerminal(signedIn);
  }, [settings.firebaseConfig, enterTerminal]);

  const handleRegister = useCallback(async (name: string, password: string) => {
    const signedIn = await registerAccount(name, password, settings.firebaseConfig);
    enterTerminal(signedIn);
  }, [settings.firebaseConfig, enterTerminal]);

  const saveGeneratedFile = useCallback((name: string, code: string, language: string) => {
    const safeName = safeRelativePath(name);
    const nextFile = { name: safeName, code, language, updatedAt: Date.now() };
    if (!plugins.codeVault) {
      setToast('Enable Code Vault to save generated files into the workspace.');
      return;
    }
    setFiles((current) => {
      const next = [nextFile, ...current.filter((file) => file.name !== safeName)].slice(0, 100);
      if (user) localStorage.setItem(`codex.files.${user.username.toLowerCase()}`, JSON.stringify(next));
      return next;
    });
    if (/\.html?$/i.test(safeName) && plugins.codeCanvas) {
      setSelectedHtmlName(safeName);
      setPanel('canvas');
    }
    setToast(`Added ${safeName} to the project file tree.`);
  }, [user, plugins.codeVault, plugins.codeCanvas]);

  const reloadFiles = useCallback((username: string) => {
    try {
      setFiles(JSON.parse(localStorage.getItem(`codex.files.${username.toLowerCase()}`) ?? '[]') as SavedFile[]);
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    if (user) reloadFiles(user.username);
  }, [user, reloadFiles]);

  function handlePickFiles(fileList: FileList | null) {
    const incoming = Array.from(fileList ?? []);
    if (!incoming.length) return;
    const accepted = incoming.filter((file) => {
      if (file.size > 12 * 1024 * 1024) {
        setToast(`${file.name} is too large. Maximum size is 12 MB per file.`);
        return false;
      }
      return true;
    });
    const additions = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) ? URL.createObjectURL(file) : undefined
    }));
    const availableSlots = Math.max(0, 8 - pendingUploads.length);
    const kept = additions.slice(0, availableSlots);
    additions.slice(availableSlots).forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
    setPendingUploads([...pendingUploads, ...kept]);
    if (additions.length > kept.length) setToast('Maximum 8 files can be attached at once.');
    else if (kept.length) setToast(`${kept.length} file(s) attached.`);
  }

  function removePendingUpload(id: string) {
    setPendingUploads((current) => {
      const item = current.find((upload) => upload.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((upload) => upload.id !== id);
    });
  }

  function createNewChat() {
    if (user && plugins.chatArchive) setArchivedChats(archiveChat(user.username, entries));
    const fresh: TerminalEntry[] = [
      { ...SYSTEM_GREETING, id: crypto.randomUUID(), timestamp: Date.now() },
      { id: crypto.randomUUID(), role: 'system', text: `New chat started. Hello, ${user?.username ?? 'user'}. Your saved profile memory remains available.`, timestamp: Date.now() }
    ];
    setEntries(fresh);
    setPrompt('');
    setPendingUploads((current) => {
      current.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
      return [];
    });
    setPanel('console');
    setMenuOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }

  async function downloadProjectZip() {
    if (!plugins.projectPackager) {
      setToast('Enable Project Packager to create a ZIP archive.');
      return;
    }
    if (!files.length || isPackaging) return;
    setIsPackaging(true);
    setToast('Building project archive…');
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      const archive = createZip(files.map((file) => ({ name: safeRelativePath(file.name), content: file.code })));
      const blob = new Blob([archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer], { type: 'application/zip' });
      const fileName = `codex-project-${(user?.username ?? 'workspace').toLowerCase()}-${Date.now()}.zip`;
      downloadBlob(fileName, blob);
      setToast(`Project ZIP created: ${fileName}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not create the project ZIP.');
    } finally {
      setIsPackaging(false);
    }
  }

  const stopGeneration = () => { abortRef.current?.abort(); };
  const transcribe = async (blob: Blob): Promise<string> => {
    if (!apiReady) throw new Error('Add your Gemini API key in Settings first.');
    return transcribeAudio(settings.apiKey.trim(), settings.model, blob);
  };
  useEffect(() => {
    const onToast = (event: Event) => setToast(String((event as CustomEvent).detail));
    window.addEventListener('codex-toast', onToast);
    onNotifyTap(() => setPanel('console'));
    return () => window.removeEventListener('codex-toast', onToast);
  }, []);

  const sendToAI = async (rawPrompt: string) => {
    if (!user || busy) return;
    if (!apiReady) {
      setPanel('settings');
      setToast('Add your own Gemini API key in this account’s Settings first.');
      return;
    }

    const currentStats = normalizeTokenStats(stats);
    const currentResetTimes = getJakartaResetTimes();
    const dailyBlocked = currentStats.todayTotal >= DAILY_TOKEN_LIMIT;
    const weeklyBlocked = currentStats.weeklyTotal >= WEEKLY_TOKEN_LIMIT;
    if (dailyBlocked || weeklyBlocked) {
      if (!currentStats.cooldownUntil) currentStats.cooldownUntil = Date.now() + randomLockMs();
      const unlockAt = currentStats.cooldownUntil > Date.now() ? currentStats.cooldownUntil : (weeklyBlocked ? currentResetTimes.weekResetAt : currentResetTimes.dayResetAt);
      setStats(currentStats);
      setPanel('usage');
      setToast(`Usage limit reached. Reset: ${jakartaResetLabel(unlockAt)}.`);
      return;
    }

    const cleanPrompt = rawPrompt.trim() || 'Please inspect the attached file(s) and explain what they contain.';
    const selectedFiles = pendingUploads.map((item) => item.file);
    setCommandHistory((current) => [cleanPrompt, ...current].slice(0, 60));
    setHistoryIndex(-1);
    const uploadLabel = selectedFiles.length ? `\n[ATTACHMENTS: ${selectedFiles.map((file) => file.name).join(', ')}]` : '';
    const userEntry: TerminalEntry = { id: crypto.randomUUID(), role: 'user', text: cleanPrompt + uploadLabel, timestamp: Date.now() };
    const previousEntries = entries;
    const nextEntries = [...previousEntries, userEntry];
    setEntries(nextEntries);
    setPrompt('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    setPhases(['parse prompt']);
    const mark = (step: string) => setPhases((current) => [...current, step]);
    void ensureNotify();

    try {
      if (selectedFiles.some((file) => file.name.toLowerCase().endsWith('.zip')) && !plugins.zipExplorer) {
        throw new Error('Enable the Archive Explorer plugin before uploading ZIP files.');
      }
      if (selectedFiles.some((file) => file.type.startsWith('image/')) && !plugins.visionReader) {
        throw new Error('Enable the Vision Reader plugin before sending images.');
      }
      if (selectedFiles.length && !plugins.documentReader && selectedFiles.some((file) => !file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.zip'))) {
        throw new Error('Enable the Document Reader plugin before attaching documents.');
      }
      if (selectedFiles.some((file) => file.name.toLowerCase().endsWith('.json')) && !plugins.jsonInspector) {
        throw new Error('Enable the JSON Inspector plugin before attaching JSON files.');
      }

      mark(selectedFiles.length ? `read ${selectedFiles.length} attachment(s)` : 'check context and memory');
      const prepared = await prepareUploads(selectedFiles);
      if (prepared.attachments.some((item) => item.mimeType.startsWith('image/')) && !plugins.visionReader) {
        throw new Error('Enable the Vision Reader plugin before sending images, including images inside ZIP files.');
      }
      if (prepared.attachments.some((item) => item.mimeType === 'application/pdf') && !plugins.documentReader) {
        throw new Error('Enable the Document Reader plugin before sending PDF documents.');
      }
      if (prepared.extractedNames.some((name) => name.toLowerCase().endsWith('.json')) && !plugins.jsonInspector) {
        throw new Error('This upload contains JSON files. Enable the JSON Inspector plugin to read them.');
      }
      const history: GeminiTurn[] = previousEntries
        .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
        .slice(-20)
        .map((entry) => ({ role: entry.role === 'assistant' ? 'model' : 'user', text: entry.text }));
      const promptWithFiles = cleanPrompt + prepared.textContext;
      const profileContext = makeProfileContext(user, memory, plugins.longTermMemory);
      mark(`call ${settings.model}`);
      const requestReply = async () => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await generateGeminiReply(
              settings.apiKey.trim(), settings.model, history, promptWithFiles,
              prepared.attachments as GeminiAttachment[], profileContext, controller.signal
            );
          } catch (error) {
            if (controller.signal.aborted || !(error instanceof TypeError) || attempt >= 2) throw error;
            mark('connection interrupted, waiting to retry');
            await waitUntilActive();
            mark(`retry ${attempt + 1}`);
          }
        }
      };
      const reply = await requestReply();
      mark(`reply received (${formatNumber(reply.totalTokens)} tokens)`);
      const assistantEntry: TerminalEntry = {
        id: crypto.randomUUID(), role: 'assistant', text: '', timestamp: Date.now(),
        inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, model: reply.model
      };
      setEntries([...nextEntries, assistantEntry]);
      mark('render output');
      let shown = reply.text;
      if (plugins.responseStream) {
        const step = Math.max(1, Math.ceil(reply.text.length / 620));
        for (let index = 0; index < reply.text.length; index += step) {
          if (!isAppActive()) break;
          if (controller.signal.aborted) { shown = reply.text.slice(0, index); break; }
          const visible = reply.text.slice(0, index + step);
          setEntries([...nextEntries, { ...assistantEntry, text: visible }]);
          await new Promise((resolve) => window.setTimeout(resolve, 9));
        }
      }
      const stopped = controller.signal.aborted && shown.length < reply.text.length;
      const completed = [...nextEntries, { ...assistantEntry, text: stopped ? `${shown}\n\n[■ STOPPED BY USER]` : reply.text }];
      setEntries(completed);
      if (!isAppActive()) void notifyDone('CodEX AI', stopped ? 'Generation stopped.' : reply.text.replace(/\s+/g, ' ').slice(0, 140));

      const keys = getJakartaPeriodKeys();
      const updatedStats: TokenStats = {
        ...currentStats,
        total: currentStats.total + reply.totalTokens,
        input: currentStats.input + reply.inputTokens,
        output: currentStats.output + reply.outputTokens,
        todayTotal: currentStats.todayTotal + reply.totalTokens,
        todayInput: currentStats.todayInput + reply.inputTokens,
        todayOutput: currentStats.todayOutput + reply.outputTokens,
        weeklyTotal: currentStats.weeklyTotal + reply.totalTokens,
        weeklyInput: currentStats.weeklyInput + reply.inputTokens,
        weeklyOutput: currentStats.weeklyOutput + reply.outputTokens,
        requests: currentStats.requests + 1,
        updatedAt: Date.now(),
        cooldownUntil: 0,
        dayKey: keys.dayKey,
        weekKey: keys.weekKey
      };
      const limitHit = updatedStats.todayTotal >= DAILY_TOKEN_LIMIT || updatedStats.weeklyTotal >= WEEKLY_TOKEN_LIMIT;
      if (limitHit) updatedStats.cooldownUntil = Date.now() + randomLockMs();
      setStats(updatedStats);
      if (limitHit) {
        const unlockAt = updatedStats.cooldownUntil;
        setToast(`Usage limit reached. CodEX is paused until ${jakartaResetLabel(unlockAt)}.`);
      }

      const detected = plugins.codeVault && !stopped ? extractCodeBlocks(reply.text) : [];
      if (detected.length) {
        const additions = detected.map((file) => ({ name: safeRelativePath(file.filename), code: file.code, language: file.language, updatedAt: Date.now() }));
        const updatedFiles = [...additions, ...files]
          .filter((file, index, all) => all.findIndex((item) => item.name === file.name) === index)
          .slice(0, 100);
        setFiles(updatedFiles);
        localStorage.setItem(`codex.files.${user.username.toLowerCase()}`, JSON.stringify(updatedFiles));
        const generatedHtml = additions.find((file) => /\.html?$/i.test(file.name));
        if (generatedHtml && plugins.codeCanvas) {
          setSelectedHtmlName(generatedHtml.name);
          setPanel('canvas');
          setToast(`Project files generated. Live Canvas opened for ${generatedHtml.name}.`);
        }
      }

      setPendingUploads((current) => {
        current.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
        return [];
      });
    } catch (error) {
      const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
      const text = error instanceof Error ? error.message : 'Unknown Gemini error.';
      setEntries((current) => [...current, { id: crypto.randomUUID(), role: 'system', text: aborted ? '[■] Generation stopped before the model answered.' : `Request failed: ${text}`, timestamp: Date.now() }]);
    } finally {
      setPhases([]);
      abortRef.current = null;
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  const runLocalCommand = (raw: string): boolean => {
    if (!plugins.commandKit) return false;
    const [command, ...args] = raw.trim().split(/\s+/);
    const value = command?.toLowerCase().replace(/^\//, '');
    const argument = args.join(' ');
    const nowText = formatTime(now);
    const output = (text: string) => setEntries((current) => [...current, { id: crypto.randomUUID(), role: 'system', text, timestamp: Date.now() }]);
    switch (value) {
      case 'overview': setPanel('overview'); output('Opening workspace overview.'); return true;
      case 'console': setPanel('console'); output('Opening AI console.'); return true;
      case 'help':
        output('CODEX COMMAND REFERENCE\n\nhelp                 Show this command list\noverview             Open workspace overview\nconsole              Open AI console\nclear                Clear the current console\nusage                Show token usage\nmodels               Open model manager\nmodels refresh       Fetch available Gemini models\nstatus               Show connection and account status\nsettings             Open settings\nconfig               Open cloud configuration\nhistory              Open session history\nfiles                Open generated files\nsnippets             Open saved snippets\ntime                 Show current time\ndate                 Show current date\nwhoami               Show signed-in account\ntheme [name]         Set phosphor, amber or ice theme\nexport               Download the console transcript\nfind <text>          Search generated project files\nnew                  Start a fresh conversation\nlogout               Sign out of CodEX AI\n\nAny other input is sent to Gemini.');
        return true;
      case 'clear':
        setEntries([{ id: crypto.randomUUID(), role: 'system', text: 'Console cleared. Type `help` for commands.', timestamp: Date.now() }]);
        return true;
      case 'usage':
        output(`TOKEN USAGE\nToday: ${formatNumber(stats.todayTotal)} / ${formatNumber(DAILY_TOKEN_LIMIT)} (${usagePercentToday.toFixed(1)}%)\nWeekly: ${formatNumber(stats.weeklyTotal)} / ${formatNumber(WEEKLY_TOKEN_LIMIT)} (${usagePercentWeekly.toFixed(1)}%)\nRequests: ${stats.requests}`);
        return true;
      case 'models':
        setPanel('models');
        if (argument === 'refresh') void loadModels();
        output(argument === 'refresh' ? 'Opening model manager and refreshing the model catalogue.' : `Selected model: ${settings.model}\nOpening model manager.`);
        return true;
      case 'status':
        setPanel('status');
        output(`CODEX STATUS\nAccount: ${user?.username ?? 'unknown'}\nAuth: ${user?.mode.toUpperCase() ?? 'OFFLINE'}\nGemini key: ${apiReady ? 'CONFIGURED' : 'MISSING'}\nModel: ${settings.model}\nToday: ${usagePercentToday.toFixed(1)}% / Week: ${usagePercentWeekly.toFixed(1)}%`);
        return true;
      case 'settings': setPanel('settings'); output('Opening settings.'); return true;
      case 'config': setPanel('config'); output('Opening configuration.'); return true;
      case 'history': setPanel('history'); output('Opening command history.'); return true;
      case 'files': setPanel('files'); output('Opening generated files.'); return true;
      case 'snippets': setPanel('snippets'); output('Opening snippets.'); return true;
      case 'plugins': setPanel('plugins'); output('Opening plugin manager.'); return true;
      case 'memory': setPanel('memory'); output('Opening saved profile memory.'); return true;
      case 'canvas': setPanel('canvas'); output('Opening Live Canvas.'); return true;
      case 'time': output(`LOCAL TIME  ${nowText}`); return true;
      case 'date': output(`LOCAL DATE  ${formatDate(now)}`); return true;
      case 'whoami': output(`SIGNED IN AS  ${user?.username ?? 'unknown'}\nAUTH MODE  ${user?.mode.toUpperCase() ?? 'UNKNOWN'}`); return true;
      case 'theme': {
        const allowed = ['phosphor', 'amber', 'ice'];
        if (!argument) output(`Current theme: ${settings.theme}\nAvailable: ${allowed.join(', ')}`);
        else if (allowed.includes(argument)) {
          updateSettings({ ...settings, theme: argument as ThemeName });
          output(`Theme changed to ${argument}.`);
        } else output(`Unknown theme. Choose: ${allowed.join(', ')}`);
        return true;
      }
      case 'export': {
        if (!plugins.responseExport) { output('Response Export plugin is disabled.'); return true; }
        const transcript = entries.map((entry) => `[${new Date(entry.timestamp).toISOString()}] ${entry.role.toUpperCase()}\n${entry.text}`).join('\n\n');
        downloadText(`codex-session-${Date.now()}.txt`, transcript);
        output('Transcript exported to a text file.');
        return true;
      }
      case 'find': {
        if (!plugins.workspaceSearch) { output('Workspace Search plugin is disabled.'); return true; }
        if (!argument.trim()) { output('Usage: find <text>'); return true; }
        const query = argument.toLowerCase();
        const matches = files.flatMap((file) => file.code.split('\n').flatMap((line, index) => line.toLowerCase().includes(query) ? [`${file.name}:${index + 1}  ${line.trim().slice(0, 140)}`] : []));
        output(matches.length ? `WORKSPACE SEARCH / ${matches.length} MATCHES\n\n${matches.slice(0, 100).join('\n')}` : `No matches found for: ${argument}`);
        return true;
      }
      case 'new':
        createNewChat();
        return true;
      case 'logout': setLogoutConfirm(true); return true;
      default: return false;
    }
  };

  async function submitPrompt() {
    const value = prompt.trim();
    if ((!value && pendingUploads.length === 0) || busy) return;
    setPrompt('');
    if (!value || !runLocalCommand(value)) await sendToAI(value);
    else setCommandHistory((current) => [value, ...current].slice(0, 60));
  }

  async function loadModels() {
    if (!plugins.modelInspector) { setModelError('Enable the Model Inspector plugin to refresh the official model catalogue.'); return; }
    if (!apiReady) {
      setModelError('Add a Gemini API key in Settings before loading models.');
      return;
    }
    setModelsLoading(true);
    setModelError('');
    try {
      const result = await fetchGeminiModels(settings.apiKey.trim());
      setModels(result);
      if (result.length && !result.some((model) => model.name.replace(/^models\//, '') === settings.model)) {
        const recommended = result.find((model) => /flash/i.test(model.name)) ?? result[0];
        updateSettings({ ...settings, model: recommended.name.replace(/^models\//, '') });
      }
      setToast(`${result.length} Gemini models loaded.`);
    } catch (error) {
      setModelError(error instanceof Error ? error.message : 'Could not load models.');
    } finally {
      setModelsLoading(false);
    }
  }

  async function handleLogout() {
    if (leaving) return;
    setLeaving(true);
    await new Promise<void>((resolve) => {
      const target = document.querySelector('.app-shell');
      if (!target) { resolve(); return; }
      gsap.to(target, { opacity: 0, y: 10, filter: 'blur(7px)', duration: 0.42, ease: 'power2.in', onComplete: resolve });
    });
    pendingUploads.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
    try {
      await logoutAccount(user, settings.firebaseConfig);
    } catch (error) {
      setLeaving(false);
      setToast(error instanceof Error ? error.message : 'Could not sign out. Please try again.');
      gsap.set('.app-shell', { clearProps: 'all' });
      return;
    }
    setLogoutConfirm(false);
    setUser(null);
    setSettings(getSettings());
    setMemory({ displayName: '', hobbies: '', interests: '', notes: '', updatedAt: 0 });
    setPlugins(DEFAULT_PLUGINS);
    setPendingUploads([]);
    setFiles([]);
    setSnippets([]);
    setArchivedChats([]);
    setPrompt('');
    setKeyVisible(false);
    setPanel('overview');
    setStage('login');
    setLeaving(false);
  }

  function changePanel(next: Panel) {
    setPanel(next);
    setMenuOpen(false);
  }

  function onHistoryKey(key: 'ArrowUp' | 'ArrowDown'): string | null {
    if (!commandHistory.length) return null;
    const nextIndex = key === 'ArrowUp'
      ? Math.min(historyIndex + 1, commandHistory.length - 1)
      : Math.max(historyIndex - 1, -1);
    setHistoryIndex(nextIndex);
    return nextIndex === -1 ? '' : commandHistory[nextIndex] ?? '';
  }

  function updateConfigField(field: keyof CodexSettings['firebaseConfig'], value: string) {
    updateSettings({ ...settings, firebaseConfig: { ...settings.firebaseConfig, [field]: value } });
  }

  if (!bootDone) return <div className="boot-screen"><div className="boot-content"><div className="boot-symbol">C<span className="boot-cross">×</span></div><div className="boot-status">RESTORING SESSION</div></div></div>;
  if (stage === 'boot') return <BootScreen onComplete={finishBoot} />;
  if (stage === 'login') return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} cloudMode={cloudMode} />;
  if (stage === 'welcome') return <WelcomeScreen name={user?.username ?? 'user'} />;

  const userName = user?.username ?? 'user';
  const currentModel = settings.model;

  return (
    <div className={`app-shell theme-${settings.theme}`} style={{ '--font-scale': settings.fontScale } as AppStyle}>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark">C<span>×</span></div><div className="brand-name">CodEX <b>AI</b><small>TERMINAL ENVIRONMENT</small></div><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19} /></button></div>
        <div className="sidebar-account"><div className="account-avatar">{userName.slice(0, 1).toUpperCase()}</div><div className="account-copy"><strong>{userName}</strong><span>{user?.mode === 'firebase' ? 'CLOUD ACCOUNT' : 'LOCAL ACCOUNT'}</span></div><span className="account-state" /> </div>
        <nav className="side-nav" aria-label="Main navigation">
          {(['WORKSPACE', 'INSPECT', 'TOOLS', 'SYSTEM'] as const).map((group) => (
            <div className="nav-group" key={group}><div className="nav-group-label">{group}</div>{NAV_ITEMS.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              return <button className={`nav-item ${panel === item.id ? 'active' : ''}`} key={item.id} onClick={() => changePanel(item.id)}><Icon size={18} weight={panel === item.id ? 'fill' : 'light'} /><span>{item.label}</span>{panel === item.id && <i />}</button>;
            })}</div>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-version"><span>CORE</span><b>v1.1.0</b></div><button className="logout-button" onClick={() => setLogoutConfirm(true)}><SignOut size={17} /> <span>Sign out</span></button></div>
      </aside>
      {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><List size={20} /></button><div className="breadcrumb"><span>CODEX</span><b>/</b>{panel.toUpperCase()}</div></div>
          <div className="topbar-right"><button type="button" className="new-chat-button" onClick={createNewChat}><Plus size={14} /> NEW CHAT</button><div className="top-status"><i /> SYSTEM OPERATIONAL</div><div className="topbar-divider" /><Clock size={15} weight="light" /><span className="topbar-clock">{formatTime(now)}</span><button className="topbar-avatar" title={userName}>{userName.slice(0, 1).toUpperCase()}</button></div>
        </header>
        <div className="content-scroll">
          <div className="page-heading"><div><div className="page-kicker"><span className="pulse-dot" /> TERMINAL / {panel.toUpperCase()}</div><h1>{NAV_ITEMS.find((item) => item.id === panel)?.label ?? 'Terminal'}</h1><p>{panel === 'overview' ? 'Your workspace, at a glance.' : panel === 'console' ? 'Run commands and work with CodEX AI.' : panel === 'usage' ? 'Track token consumption in this local workspace.' : panel === 'models' ? 'Choose the Gemini model for your session.' : panel === 'status' ? 'Live diagnostics for your terminal environment.' : panel === 'settings' ? 'Personal preferences and Gemini connection.' : panel === 'config' ? 'Connect cloud identity and manage app configuration.' : panel === 'history' ? 'Your recent terminal conversation.' : panel === 'files' ? 'Code files generated during this session.' : panel === 'snippets' ? 'Keep useful code close at hand.' : panel === 'plugins' ? 'Enable the tools attached to this terminal.' : panel === 'memory' ? 'Choose what CodEX can remember about your profile.' : panel === 'canvas' ? 'Preview generated HTML without running it manually.' : 'Commands, shortcuts and terminal reference.'}</p></div><div className="page-clock"><ClockBlock now={now} /></div></div>

          {panel === 'overview' && <>
            <section className="overview-hero">
              <div className="hero-scan" />
              <div className="hero-copy"><div className="hero-overline"><span>SESSION ACTIVE</span><b>01 / READY</b></div><h2>Welcome back,<br /><span>{userName}.</span></h2><p>CodEX is standing by. Enter a command, build something, or explore your workspace.</p><button onClick={() => changePanel('console')} className="hero-cta">OPEN CONSOLE <span>↗</span></button></div>
              <div className="hero-terminal-art"><div className="art-window-top"><span /> <span /> <span /> <b>codex://session</b></div><div className="art-code"><span className="muted">$</span> codex status<br /><em>●</em> core ............... ready<br /><em>●</em> gemini ............. {apiReady ? 'connected' : 'waiting'}<br /><em>●</em> session ............ active<br /><span className="muted">$</span> <i className="art-cursor" /></div><div className="art-footer">LOCAL ENVIRONMENT / {user?.mode.toUpperCase()}</div></div>
            </section>
            <section className="overview-stats"><StatBlock label="TODAY TOKENS" value={formatNumber(stats.todayTotal)} suffix="TOK" detail={`${usagePercentToday.toFixed(1)}% of ${formatNumber(DAILY_TOKEN_LIMIT)}`} /><StatBlock label="WEEKLY TOKENS" value={formatNumber(stats.weeklyTotal)} suffix="TOK" detail={`${usagePercentWeekly.toFixed(1)}% of ${formatNumber(WEEKLY_TOKEN_LIMIT)}`} /><StatBlock label="REQUESTS" value={formatNumber(stats.requests)} detail="Gemini completions" /><StatBlock label="MODEL" value={currentModel.replace('gemini-', '')} detail="Exact API model ID" /></section>
            <section className="overview-lower"><div className="overview-block recent-block"><div className="block-heading"><div><span>ACTIVITY</span><h3>Recent output</h3></div><button onClick={() => changePanel('history')}>VIEW HISTORY ↗</button></div>{entries.filter((entry) => entry.role !== 'system').slice(-4).reverse().length ? entries.filter((entry) => entry.role !== 'system').slice(-4).reverse().map((entry) => <div className="recent-row" key={entry.id}><span className={`recent-indicator ${entry.role}`} /> <div><strong>{entry.role === 'user' ? 'Command' : 'CodEX response'}</strong><p>{entry.text.slice(0, 95).replace(/\n/g, ' ') || 'Response is being typed...'}</p></div><time>{new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour12: false })}</time></div>) : <div className="empty-line">No activity yet. Open Console to begin.</div>}</div><div className="overview-block budget-block"><div className="block-heading"><div><span>RESOURCE METER</span><h3>Token budget</h3></div><button onClick={() => changePanel('usage')}>DETAILS ↗</button></div><div className="budget-number">{usagePercentToday.toFixed(1)}<small>%</small></div><div className="budget-track"><span style={{ width: `${usagePercentToday}%` }} /></div><div className="budget-caption"><span>{formatNumber(stats.todayTotal)} today</span><span>{formatNumber(DAILY_TOKEN_LIMIT)} daily limit</span></div><div className="budget-note"><Info size={14} /> Weekly: {formatNumber(stats.weeklyTotal)} / {formatNumber(WEEKLY_TOKEN_LIMIT)} tokens.</div></div></section>
          </>}

          {panel === 'console' && <ConsolePanel entries={entries} busy={busy} prompt={prompt} setPrompt={setPrompt} onSubmit={() => void submitPrompt()} onSaveFile={saveGeneratedFile} onStop={stopGeneration} onRetry={(text) => void sendToAI(text)} onTranscribe={transcribe} phases={phases} model={currentModel} apiReady={apiReady} inputRef={inputRef} onHistoryKey={onHistoryKey} pendingUploads={pendingUploads} onPickFiles={handlePickFiles} onRemoveUpload={removePendingUpload} />}

          {panel === 'usage' && <section className="panel-grid usage-layout quota-layout">
            <div className="panel-card usage-main">
              <div className="panel-card-heading"><div><span>FIXED ACCOUNT ALLOWANCE</span><h2>Usage overview</h2></div><Gauge size={20} /></div>
              <div className="quota-meter-block"><div className="quota-meter-label"><span>TODAY</span><strong>{usagePercentToday.toFixed(1)}%</strong></div><div className="usage-progress"><span style={{ width: `${usagePercentToday}%` }} /></div><div className="usage-scale"><span>{formatNumber(stats.todayTotal)} used</span><span>{formatNumber(DAILY_TOKEN_LIMIT)} tokens</span></div></div>
              <div className="quota-meter-block"><div className="quota-meter-label"><span>THIS WEEK</span><strong>{usagePercentWeekly.toFixed(1)}%</strong></div><div className="usage-progress"><span style={{ width: `${usagePercentWeekly}%` }} /></div><div className="usage-scale"><span>{formatNumber(stats.weeklyTotal)} used</span><span>{formatNumber(WEEKLY_TOKEN_LIMIT)} tokens</span></div></div>
              <div className="usage-split"><div><label>TODAY INPUT</label><strong>{formatNumber(stats.todayInput)}</strong></div><div><label>TODAY OUTPUT</label><strong>{formatNumber(stats.todayOutput)}</strong></div><div><label>REQUESTS</label><strong>{formatNumber(stats.requests)}</strong></div></div>
              {cooldownActive && <div className="cooldown-banner"><Clock size={18} /><div><strong>AI access paused</strong><span>Resets at {jakartaResetLabel(blockedUntil)} ({formatDuration(resetCountdown)} remaining)</span></div></div>}
              <div className="usage-disclaimer">These fixed limits are currently enforced in this browser only. A backend is required to stop users from editing local storage or bypassing limits on another device.</div>
            </div>
            <div className="panel-card quota-reset-card"><div className="panel-card-heading"><div><span>RESET SCHEDULE</span><h2>Allowance details</h2></div><Clock size={20} /></div><div className="quota-reset-row"><span>DAILY RESET</span><strong>00:00 WIB</strong><small>{jakartaResetLabel(resetTimes.dayResetAt)}</small></div><div className="quota-reset-row"><span>WEEKLY RESET</span><strong>MONDAY · 00:00 WIB</strong><small>{jakartaResetLabel(resetTimes.weekResetAt)}</small></div><div className="quota-fixed-note"><Info size={16} /> Every account receives the same allowance: {formatNumber(DAILY_TOKEN_LIMIT)} tokens per day and {formatNumber(WEEKLY_TOKEN_LIMIT)} tokens per week. Allowance values cannot be edited in Settings.</div></div>
          </section>}

          {panel === 'models' && <section className="panel-grid models-layout"><div className="panel-card model-card"><div className="panel-card-heading"><div><span>GENERATION ENGINE</span><h2>Model selection</h2></div><Cube size={20} /></div><div className="active-model"><div className="model-orbit"><Sparkle size={24} /></div><div><small>ACTIVE MODEL</small><strong>{currentModel}</strong><span>{models.length ? `${models.length} available models found` : 'Default selection / refresh catalogue to verify'}</span></div></div><button className="secondary-button full-button" onClick={() => void loadModels()} disabled={modelsLoading}>{modelsLoading ? <span className="mini-loader" /> : <ArrowClockwise size={16} />} REFRESH MODEL CATALOGUE</button>{modelError && <div className="inline-error"><WarningCircle size={15} />{modelError}</div>}</div><div className="panel-card model-list-card"><div className="panel-card-heading"><div><span>AVAILABLE MODELS</span><h2>Catalogue</h2></div><span className="count-tag">{models.length || '—'}</span></div>{models.length ? <div className="model-list">{models.map((model) => { const id = model.name.replace(/^models\//, ''); return <button className={`model-row ${settings.model === id ? 'selected' : ''}`} key={model.name} onClick={() => { updateSettings({ ...settings, model: id }); setToast(`Model set to ${id}`); }}><span className="model-radio" /><span className="model-row-copy"><strong>{model.displayName || id}</strong><small>{id} {model.inputTokenLimit ? `· ${formatNumber(model.inputTokenLimit)} input tokens` : ''}</small></span>{settings.model === id && <Check size={17} />}</button>; })}</div> : <div className="empty-state"><Cube size={26} /><strong>No catalogue loaded</strong><p>Connect your Gemini API key, then refresh the model catalogue.</p></div>}</div></section>}

          {panel === 'status' && <section className="panel-card status-card"><div className="panel-card-heading"><div><span>SYSTEM DIAGNOSTICS</span><h2>Environment status</h2></div><Gauge size={20} /></div><div className="diagnostic-list">{[
            ['Authentication', user?.mode === 'firebase' ? 'Firebase cloud session' : 'Local device session', true],
            ['Gemini API key', apiReady ? 'Configured on this device' : 'Not configured', apiReady],
            ['Model target', currentModel, Boolean(currentModel)],
            ['Cloud identity', cloudMode ? 'Firebase config detected' : 'Local account mode', cloudMode],
            ['Token meter', cooldownActive ? `Paused / ${formatDuration(resetCountdown)}` : `${usagePercent.toFixed(1)}% used`, !cooldownActive],
            ['Service worker', 'PWA support enabled', 'serviceWorker' in navigator],
            ['Local storage', 'Session and preferences available', true],
            ['Device clock', formatTime(now), true]
          ].map(([label, detail, ok]) => <div className="diagnostic-row" key={String(label)}><div className="diagnostic-name"><span className={`diagnostic-dot ${ok ? 'ok' : 'warn'}`} />{label}</div><span className="diagnostic-detail">{detail}</span><span className={`diagnostic-state ${ok ? 'ok' : 'warn'}`}>{ok ? 'READY' : 'CHECK'}</span></div>)}</div><div className="status-footnote">This page reports browser-side configuration and local state. It cannot inspect Google billing or project-wide quota.</div></section>}

          {panel === 'settings' && <section className="settings-layout"><div className="panel-card"><div className="panel-card-heading"><div><span>GEMINI CONNECTION</span><h2>API access</h2></div><Key size={20} /></div><label className="field-label" htmlFor="gemini-key">GEMINI API KEY</label><div className="secret-field"><input id="gemini-key" className="text-field" type={keyVisible ? 'text' : 'password'} value={settings.apiKey} onChange={(event) => updateSettings({ ...settings, apiKey: event.target.value })} placeholder="Paste your Gemini API key" autoComplete="off" /><button onClick={() => setKeyVisible((value) => !value)} aria-label={keyVisible ? 'Hide API key' : 'Show API key'}>{keyVisible ? <EyeSlash size={17} /> : <Eye size={17} />}</button></div><p className="field-help">Saved under this signed-in account ID on this device. A different account starts with an empty key. For production-level secrecy, a server-side API proxy is required. <a className="text-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Get a Gemini key ↗</a></p><div className="key-state"><span className={`diagnostic-dot ${apiReady ? 'ok' : 'warn'}`} />{apiReady ? 'API key is set' : 'API key is missing'}</div><div className="field-divider" /><label className="field-label" htmlFor="default-model">DEFAULT MODEL</label><select id="default-model" className="text-field select-field" value={settings.model} onChange={(event) => updateSettings({ ...settings, model: event.target.value })}>{[...new Set([settings.model, ...models.map((model) => model.name.replace(/^models\//, ''))])].map((model) => <option value={model} key={model}>{model}</option>)}</select><button className="secondary-button" onClick={() => void loadModels()} disabled={modelsLoading}>{modelsLoading ? 'CHECKING…' : 'CHECK AVAILABLE MODELS'}</button></div><div className="panel-card"><div className="panel-card-heading"><div><span>APPEARANCE</span><h2>Terminal display</h2></div><SlidersHorizontal size={20} /></div><label className="field-label">COLOR PROFILE</label><div className="theme-options">{([{ id: 'phosphor', label: 'PHOSPHOR', color: '#52ed9d' }, { id: 'amber', label: 'AMBER', color: '#e3b35e' }, { id: 'ice', label: 'ICE', color: '#73cfff' }] as const).map((theme) => <button className={`theme-option ${settings.theme === theme.id ? 'active' : ''}`} key={theme.id} onClick={() => updateSettings({ ...settings, theme: theme.id })}><span style={{ background: theme.color }} />{theme.label}{settings.theme === theme.id && <Check size={14} />}</button>)}</div><div className="field-divider" /><div className="range-heading"><label className="field-label" htmlFor="font-scale">TERMINAL TEXT SIZE</label><span>{Math.round(settings.fontScale * 100)}%</span></div><input id="font-scale" className="range-field" type="range" min="0.85" max="1.2" step="0.05" value={settings.fontScale} onChange={(event) => updateSettings({ ...settings, fontScale: Number(event.target.value) })} /><p className="field-help">Adjust text scale for mobile and desktop comfort.</p></div></section>}

          {panel === 'config' && <section className="config-layout"><div className="panel-card"><div className="panel-card-heading"><div><span>IDENTITY BACKEND</span><h2>Firebase configuration</h2></div><GearSix size={20} /></div><div className="config-notice"><Info size={18} /><p>Firebase enables cross-device accounts and globally unique usernames. Without it, accounts work only in this browser. Add a Firebase Web App configuration below, enable Email/Password Authentication, and apply the included Firestore rules.</p></div><div className="config-fields">{([
            ['apiKey', 'API KEY', 'Firebase web API key'],
            ['authDomain', 'AUTH DOMAIN', 'your-project.firebaseapp.com'],
            ['projectId', 'PROJECT ID', 'your-project-id'],
            ['appId', 'APP ID', '1:000000000:web:...'],
            ['messagingSenderId', 'MESSAGING SENDER ID', 'Optional numeric sender ID']
          ] as const).map(([field, label, placeholder]) => <div key={field}><label className="field-label" htmlFor={`firebase-${field}`}>{label}</label><input id={`firebase-${field}`} className="text-field" value={settings.firebaseConfig[field]} onChange={(event) => updateConfigField(field, event.target.value)} placeholder={placeholder} autoComplete="off" /></div>)}</div><div className="config-actions"><span className={`config-state ${cloudMode ? 'ready' : ''}`}><i /> {cloudMode ? 'CONFIGURATION DETECTED' : 'LOCAL MODE ACTIVE'}</span><button className="secondary-button" onClick={() => { updateSettings({ ...settings, firebaseConfig: { apiKey: '', authDomain: '', projectId: '', appId: '', messagingSenderId: '' } }); setToast('Firebase configuration cleared. Sign in again to use local mode.'); }}>CLEAR CONFIG</button></div><div className="field-help config-warning">Changing cloud configuration does not migrate local accounts. Sign out and create a new cloud account after setup.</div></div></section>}

          {panel === 'history' && <section className="panel-card history-card"><div className="panel-card-heading"><div><span>SESSION LOG</span><h2>Conversation history</h2></div><button className="icon-button" onClick={() => { if (user) saveHistory(user.username, entries); setToast('History saved locally.'); }} aria-label="Save history"><DownloadSimple size={17} /></button></div>{entries.length ? <div className="history-list">{[...entries].reverse().map((entry) => <div className="history-row" key={entry.id}><span className={`history-role ${entry.role}`}>{entry.role.toUpperCase()}</span><div><p>{entry.text.slice(0, 180) || 'Response is being typed...'}</p><time>{new Date(entry.timestamp).toLocaleString()}</time></div><button onClick={() => { setPanel('console'); setPrompt(entry.role === 'user' ? entry.text : `Continue from this response:\n${entry.text}`); }} title="Reuse text"><ArrowCounterClockwise size={16} /></button></div>)}</div> : <div className="empty-state"><ClockCounterClockwise size={27} /><strong>No history yet</strong><p>Requests and replies will appear here.</p></div>}
            {plugins.chatArchive && <div className="archive-section"><div className="archive-heading"><span>PREVIOUS CHATS</span><strong>{archivedChats.length} SAVED</strong></div>{archivedChats.length ? archivedChats.map((chat) => <button type="button" className="archive-row" key={chat.id} onClick={() => { if (user && plugins.chatArchive) setArchivedChats(archiveChat(user.username, entries)); setEntries(chat.entries); setPanel('console'); setToast('Previous conversation restored.'); }}><span><strong>{chat.title || 'Previous chat'}</strong><small>{new Date(chat.updatedAt).toLocaleString()}</small></span><ArrowCounterClockwise size={15} /></button>) : <p className="archive-empty">Start a new chat to save the current conversation here.</p>}</div>}</section>}

          {panel === 'files' && <section className="panel-card files-card"><div className="panel-card-heading"><div><span>GENERATED OUTPUT</span><h2>Project files</h2></div><FolderOpen size={20} /></div>
            <div className="file-toolbar"><span>{files.length} file(s) in this workspace</span><button className="secondary-button" type="button" onClick={() => void downloadProjectZip()} disabled={!files.length || isPackaging || !plugins.projectPackager}>{isPackaging ? <><span className="mini-loader" /> PACKAGING…</> : <><DownloadSimple size={15} /> DOWNLOAD PROJECT ZIP</>}</button></div>
            {files.length ? <div className="file-grid">{files.map((file) => <div className="file-card" key={`${file.name}-${file.updatedAt}`}><div className="file-card-icon"><FileText size={22} /></div><div className="file-card-copy"><strong>{file.name}</strong><span>{file.language} · {formatNumber(file.code.length)} chars</span><small>{new Date(file.updatedAt).toLocaleString()}</small></div><div className="file-card-actions"><button onClick={() => void copyText(file.code)} aria-label={`Copy ${file.name}`}><CopySimple size={16} /></button><button onClick={() => downloadText(file.name.split('/').pop() || file.name, file.code)} aria-label={`Download ${file.name}`}><DownloadSimple size={16} /></button>{/\.html?$/i.test(file.name) && <button onClick={() => { setSelectedHtmlName(file.name); setPanel('canvas'); }} aria-label={`Preview ${file.name}`}><Eye size={16} /></button>}</div></div>)}</div> : <div className="empty-state"><FolderOpen size={28} /><strong>No generated files</strong><p>Ask CodEX to create a multi-file project. Files with paths will be kept here and can be downloaded together as a ZIP archive.</p><button className="secondary-button" onClick={() => changePanel('console')}>OPEN CONSOLE</button></div>}
          </section>}

          {panel === 'snippets' && <section className="snippets-layout"><div className="panel-card snippet-create"><div className="panel-card-heading"><div><span>QUICK STORAGE</span><h2>Save a snippet</h2></div><Plus size={20} /></div><label className="field-label" htmlFor="snippet-name">SNIPPET NAME</label><input id="snippet-name" className="text-field" value={snippetName} onChange={(event) => setSnippetName(event.target.value)} placeholder="useful-function" /><label className="field-label" htmlFor="snippet-code">CODE</label><textarea id="snippet-code" className="snippet-textarea" placeholder="Paste a short code snippet..." rows={7} /><button className="secondary-button full-button" onClick={() => { const code = (document.getElementById('snippet-code') as HTMLTextAreaElement | null)?.value ?? ''; if (!snippetName.trim() || !code.trim()) { setToast('Add a name and code first.'); return; } const next = [{ name: snippetName.trim(), code, updatedAt: Date.now() }, ...snippets].slice(0, 80); setSnippets(next); setSnippetName(''); (document.getElementById('snippet-code') as HTMLTextAreaElement).value = ''; setToast('Snippet saved locally.'); }}><Plus size={16} /> SAVE SNIPPET</button></div><div className="panel-card snippets-list-card"><div className="panel-card-heading"><div><span>PERSONAL LIBRARY</span><h2>Saved snippets</h2></div><CodeBlock size={20} /></div>{snippets.length ? snippets.map((snippet, index) => <div className="snippet-row" key={`${snippet.name}-${snippet.updatedAt}`}><div><strong>{snippet.name}</strong><small>{formatNumber(snippet.code.length)} characters</small></div><div><button onClick={() => void copyText(snippet.code)}><CopySimple size={15} /></button><button onClick={() => downloadText(`${snippet.name.replace(/[^a-zA-Z0-9._-]/g, '-')}.txt`, snippet.code)}><DownloadSimple size={15} /></button><button onClick={() => { setSnippets((current) => current.filter((_, itemIndex) => itemIndex !== index)); setToast('Snippet removed.'); }}><Trash size={15} /></button></div></div>) : <div className="empty-state compact-empty"><CodeBlock size={25} /><strong>Your snippet library is empty</strong><p>Save reusable code fragments here.</p></div>}</div></section>}

          {panel === 'canvas' && <section className="canvas-layout">
            <div className="panel-card canvas-toolbar-card">
              <div className="panel-card-heading"><div><span>LIVE HTML PREVIEW</span><h2>Canvas</h2></div><Eye size={20} /></div>
              <div className="canvas-toolbar-controls">
                <select className="text-field select-field" value={selectedHtml?.name ?? ''} onChange={(event) => setSelectedHtmlName(event.target.value)} aria-label="Choose HTML file">
                  {htmlFiles.map((file) => <option key={file.name} value={file.name}>{file.name}</option>)}
                </select>
                <button className="secondary-button" type="button" onClick={() => setToast('Canvas refreshed from the saved project files.')}>REFRESH PREVIEW</button>
              </div>
              <p className="field-help">HTML is loaded in an isolated preview frame. Linked CSS and JavaScript files from the project are inlined when their paths match.</p>
            </div>
            <div className="canvas-frame-wrap">
              {selectedHtml ? <iframe className="canvas-frame" title="CodEX generated HTML preview" sandbox={plugins.safePreview ? 'allow-scripts' : ''} srcDoc={buildCanvasDocument(selectedHtml, files, true)} /> : <div className="empty-state canvas-empty"><Eye size={30} /><strong>No HTML file to preview</strong><p>Ask CodEX to create an index.html file. It will open here automatically.</p><button className="secondary-button" onClick={() => changePanel('console')}>OPEN CONSOLE</button></div>}
            </div>
          </section>}

          {panel === 'plugins' && <section className="plugin-layout">
            <div className="panel-card plugin-intro-card"><div className="panel-card-heading"><div><span>EXTENSION SYSTEM</span><h2>CodEX plugins</h2></div><Sparkle size={20} /></div><p>These are built-in CodEX tools, not fake model names or third-party services. Each plugin controls a real feature inside this workspace.</p><div className="plugin-count"><strong>{Object.values(plugins).filter(Boolean).length}</strong><span> / {PLUGIN_CATALOG.length} ENABLED</span></div></div>
            <div className="plugin-grid">{PLUGIN_CATALOG.map((plugin) => <article className={`plugin-card ${plugins[plugin.id] ? 'enabled' : ''}`} key={plugin.id}><div className="plugin-card-top"><span className="plugin-category">{plugin.category}</span><span className={`plugin-state ${plugins[plugin.id] ? 'on' : ''}`}>{plugins[plugin.id] ? 'ENABLED' : 'DISABLED'}</span></div><h3>{plugin.name}</h3><p>{plugin.description}</p><button type="button" className={`plugin-toggle ${plugins[plugin.id] ? 'active' : ''}`} onClick={() => setPlugins((current) => ({ ...current, [plugin.id]: !current[plugin.id] }))}><span />{plugins[plugin.id] ? 'TURN OFF' : 'TURN ON'}</button></article>)}</div>
          </section>}

          {panel === 'memory' && <section className="memory-layout">
            <div className="panel-card memory-card"><div className="panel-card-heading"><div><span>PROFILE CONTEXT</span><h2>What CodEX remembers</h2></div><UserCircle size={20} /></div>
              <div className="memory-account-line"><span>ACCOUNT</span><strong>{userName}</strong></div>
              <label className="field-label" htmlFor="memory-display-name">PREFERRED NAME</label><input id="memory-display-name" className="text-field" value={memory.displayName} onChange={(event) => setMemory((current) => ({ ...current, displayName: event.target.value }))} placeholder={userName} />
              <label className="field-label" htmlFor="memory-hobbies">HOBBIES</label><textarea id="memory-hobbies" className="snippet-textarea memory-textarea" rows={3} value={memory.hobbies} onChange={(event) => setMemory((current) => ({ ...current, hobbies: event.target.value }))} placeholder="For example: drawing, Roblox Studio, Minecraft modding…" />
              <label className="field-label" htmlFor="memory-interests">INTERESTS / PROJECTS</label><textarea id="memory-interests" className="snippet-textarea memory-textarea" rows={3} value={memory.interests} onChange={(event) => setMemory((current) => ({ ...current, interests: event.target.value }))} placeholder="Topics, tools and projects you often work on…" />
              <label className="field-label" htmlFor="memory-notes">OTHER THINGS TO REMEMBER</label><textarea id="memory-notes" className="snippet-textarea memory-textarea" rows={4} value={memory.notes} onChange={(event) => setMemory((current) => ({ ...current, notes: event.target.value }))} placeholder="Preferences or context you want CodEX to use…" />
              <div className="memory-save-row"><span><CheckCircle size={15} /> Saved automatically for this account on this device.</span><button className="secondary-button" onClick={() => { setMemory({ displayName: userName, hobbies: '', interests: '', notes: '', updatedAt: Date.now() }); setToast('Profile memory cleared.'); }}>CLEAR MEMORY</button></div>
            </div>
            <div className="panel-card memory-note-card"><div className="panel-card-heading"><div><span>HOW MEMORY WORKS</span><h2>Persistent profile</h2></div><Info size={20} /></div><p>CodEX can reuse the profile details you choose to save when sending a request. It can remember context, but it is not conscious or self-aware.</p><p>Profile memory is stored locally in this browser under your account name. It is not synced across devices unless a secure cloud backend is added.</p><p>Conversation history is kept separately from profile memory. Use <strong>New Chat</strong> to start with a fresh conversation while keeping these profile details.</p></div>
          </section>}

          {panel === 'help' && <section className="help-layout"><div className="panel-card"><div className="panel-card-heading"><div><span>TERMINAL MANUAL</span><h2>Command reference</h2></div><Question size={20} /></div><div className="command-table">{[
            ['help', 'Show all available commands'], ['overview', 'Open workspace overview'], ['console', 'Open the AI console'], ['clear', 'Clear the visible console'], ['usage', 'View local token consumption'], ['models', 'Open the Gemini model catalogue'], ['models refresh', 'Fetch models using your API key'], ['status', 'Show environment diagnostics'], ['settings', 'Open preferences and Gemini key'], ['config', 'Open Firebase configuration'], ['history', 'Review the current conversation'], ['files', 'Browse generated code files'], ['snippets', 'Open your snippet library'], ['theme amber', 'Switch to amber terminal colors'], ['export', 'Download the current transcript'], ['find text', 'Search through generated project files'], ['new', 'Start a fresh conversation'], ['logout', 'Sign out of the current account']
          ].map(([name, description]) => <div className="command-row" key={name}><code>{name}</code><span>{description}</span><button onClick={() => { setPrompt(name); setPanel('console'); }} title={`Use ${name}`}><ArrowCounterClockwise size={15} /></button></div>)}</div></div><div className="panel-card shortcut-card"><div className="panel-card-heading"><div><span>KEYBOARD</span><h2>Shortcuts</h2></div><Command size={20} /></div><div className="shortcut-row"><span>Send command</span><kbd>ENTER</kbd></div><div className="shortcut-row"><span>New line</span><kbd>SHIFT + ENTER</kbd></div><div className="shortcut-row"><span>Send command alternative</span><kbd>CTRL + ENTER</kbd></div><div className="shortcut-row"><span>Command history</span><kbd>↑ / ↓</kbd></div><div className="help-note">CodEX AI runs in your browser. It does not execute shell commands on your phone or computer; generated code can be copied or downloaded as files.</div></div></section>}

          <footer className="app-footer"><span>CODEX AI / TERMINAL ENVIRONMENT</span><span>LOCAL TIME {formatTime(now)} <b>·</b> BUILD 1.1.0</span></footer>
        </div>
      </main>
      {logoutConfirm && <div className="leave-overlay" role="presentation"><section className="leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-title"><div className="leave-mark"><SignOut size={22} /></div><span className="leave-kicker">END SESSION</span><h2 id="leave-title">Are you sure you want to leave?</h2><p>Your current conversation and account data remain saved on this device.</p><div className="leave-actions"><button type="button" className="secondary-button" disabled={leaving} onClick={() => setLogoutConfirm(false)}>NO, STAY</button><button type="button" className="danger-button" disabled={leaving} onClick={() => void handleLogout()}>{leaving ? 'LEAVING…' : 'YES, LEAVE'}</button></div></section></div>}
      {toast && <div className="toast-message" role="status"><CheckCircle size={17} />{toast}</div>}
    </div>
  );
}

export default App;
