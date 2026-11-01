import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';

const MIME: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
  json: 'application/json', csv: 'text/csv', svg: 'image/svg+xml', xml: 'application/xml'
};
export function mimeFor(name: string): string {
  return `${MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'text/plain'};charset=utf-8`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the file data.'));
    reader.readAsDataURL(blob);
  });
}

/** Real download: browser anchor on web, Filesystem + Share sheet inside the Android app. */
export async function saveFile(name: string, blob: Blob): Promise<string> {
  const safe = (name.split('/').pop() ?? '').replace(/[^\w.\- ]+/g, '_') || 'codex-file.txt';
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safe;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return `Downloaded ${safe}`;
  }
  const data = await blobToBase64(blob);
  const cached = await Filesystem.writeFile({ path: `exports/${safe}`, data, directory: Directory.Cache, recursive: true });
  let savedCopy = false;
  try {
    await Filesystem.writeFile({ path: `CodEX/${safe}`, data, directory: Directory.Documents, recursive: true });
    savedCopy = true;
  } catch { /* no public storage access; the share sheet below still lets the user save it */ }
  try {
    await Share.share({ title: safe, files: [cached.uri], dialogTitle: `Save or open ${safe}` });
  } catch { /* share sheet dismissed */ }
  return savedCopy ? `Saved ${safe} to Documents/CodEX` : `File ready: ${safe} (pick where to save it)`;
}

let active = true;
const waiters: Array<() => void> = [];
function setActive(value: boolean): void {
  active = value;
  if (value) waiters.splice(0).forEach((resolve) => resolve());
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => setActive(!document.hidden));
  if (Capacitor.isNativePlatform()) void CapApp.addListener('appStateChange', (state) => setActive(state.isActive));
}
export function isAppActive(): boolean { return active; }
export function waitUntilActive(): Promise<void> {
  return active ? Promise.resolve() : new Promise<void>((resolve) => { waiters.push(resolve); });
}

export async function ensureNotify(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      let perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
      return perm.display === 'granted';
    }
    if ('Notification' in window) {
      if (Notification.permission === 'default') await Notification.requestPermission();
      return Notification.permission === 'granted';
    }
  } catch { /* notifications are optional */ }
  return false;
}

export async function notifyDone(title: string, body: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Date.now() % 2147483000), title, body, extra: { open: 'console' } }] });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const note = new Notification(title, { body });
      note.onclick = () => { window.focus(); note.close(); };
    }
  } catch { /* best effort */ }
}

export function onNotifyTap(callback: () => void): void {
  if (Capacitor.isNativePlatform()) void LocalNotifications.addListener('localNotificationActionPerformed', () => callback());
}

export function voiceSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

export async function recordVoice(): Promise<{ stop: () => Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((item) => MediaRecorder.isTypeSupported(item)) ?? '';
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.start();
  return {
    stop: () => new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        resolve(new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' }));
      };
      recorder.stop();
    })
  };
}
