import { extractZip } from './zip';

export interface GeminiAttachment {
  name: string;
  mimeType: string;
  data: string;
}

export interface UploadPreparation {
  attachments: GeminiAttachment[];
  textContext: string;
  extractedNames: string[];
}

const MAX_INLINE_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 42000;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx',
  'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'kt', 'swift', 'sh', 'sql', 'yaml', 'yml', 'toml', 'ini', 'log', 'svg'
]);

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function decodeDocxXml(xmlBytes: Uint8Array): string {
  const xml = new TextDecoder().decode(xmlBytes);
  const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(' ');
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function isImage(mime: string): boolean {
  return /^image\/(png|jpeg|webp|gif)$/.test(mime);
}

async function appendText(lines: string[], label: string, content: string): Promise<void> {
  const clean = content.replace(/\u0000/g, '').slice(0, MAX_TEXT_CHARS);
  if (clean.trim()) lines.push(`--- FILE: ${label} ---\n${clean}`);
}

export async function prepareUploads(files: File[]): Promise<UploadPreparation> {
  const attachments: GeminiAttachment[] = [];
  const textLines: string[] = [];
  const extractedNames: string[] = [];
  let totalInline = 0;

  for (const file of files) {
    if (file.size > MAX_INLINE_BYTES) throw new Error(`${file.name} is larger than the 12 MB per-file upload limit.`);
    const ext = extension(file.name);
    const guessedMime: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
      pdf: 'application/pdf', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    const mime = file.type || guessedMime[ext] || 'application/octet-stream';
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (isImage(mime) || mime === 'application/pdf' || ext === 'pdf') {
      totalInline += bytes.byteLength;
      if (totalInline > MAX_INLINE_BYTES) throw new Error('Combined image and PDF uploads exceed the 12 MB limit. Remove one file and try again.');
      attachments.push({ name: file.name, mimeType: isImage(mime) ? mime : 'application/pdf', data: toBase64(bytes) });
      extractedNames.push(file.name);
      continue;
    }

    if (ext === 'zip') {
      const children = await extractZip(toArrayBuffer(bytes));
      const manifest = children.map((entry) => entry.name).slice(0, 150);
      textLines.push(`--- ZIP ARCHIVE: ${file.name} ---\nExtracted ${children.length} file(s):\n${manifest.join('\n')}`);
      for (const child of children) {
        const childExt = extension(child.name);
        extractedNames.push(child.name);
        const childImageTypes: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'
        };
        if (childImageTypes[childExt] || childExt === 'pdf') {
          totalInline += child.bytes.byteLength;
          if (totalInline > MAX_INLINE_BYTES) throw new Error('Images and PDFs inside this ZIP exceed the 12 MB combined upload limit.');
          attachments.push({
            name: child.name,
            mimeType: childImageTypes[childExt] || 'application/pdf',
            data: toBase64(child.bytes)
          });
        } else if (childExt === 'docx') {
          try {
            const docxEntries = await extractZip(toArrayBuffer(child.bytes));
            const documentXml = docxEntries.find((entry) => entry.name === 'word/document.xml');
            if (documentXml) await appendText(textLines, child.name, decodeDocxXml(documentXml.bytes));
          } catch {
            await appendText(textLines, child.name, '[DOCX file was detected but its text could not be extracted.]');
          }
        } else if (TEXT_EXTENSIONS.has(childExt)) {
          await appendText(textLines, child.name, new TextDecoder().decode(child.bytes));
        }
      }
      continue;
    }

    if (ext === 'docx') {
      const children = await extractZip(toArrayBuffer(bytes));
      const documentXml = children.find((entry) => entry.name === 'word/document.xml');
      if (!documentXml) throw new Error(`Could not read the document body in ${file.name}.`);
      await appendText(textLines, file.name, decodeDocxXml(documentXml.bytes));
      extractedNames.push(file.name);
      continue;
    }

    if (TEXT_EXTENSIONS.has(ext) || mime.startsWith('text/')) {
      await appendText(textLines, file.name, new TextDecoder().decode(bytes));
      extractedNames.push(file.name);
      continue;
    }

    throw new Error(`Unsupported file type: ${file.name}. Upload an image, PDF, DOCX, ZIP, or a text/code file.`);
  }

  return {
    attachments,
    textContext: textLines.length ? `\n\nUPLOADED FILE CONTENTS\n${textLines.join('\n\n').slice(0, 80000)}` : '',
    extractedNames
  };
}
