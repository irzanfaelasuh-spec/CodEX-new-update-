# CodEX AI — Terminal Environment

CodEX AI is a terminal-inspired, mobile-first workspace built with React, TypeScript, Vite, GSAP, Gemini and Capacitor. This upgrade keeps the original dark terminal interface and adds multimodal uploads, a local project file tree, Canvas preview, plugins, profile memory and per-account preferences.

## Included features

- Animated startup, login, account creation and welcome transition.
- Local Mode accounts, plus optional Firebase Authentication for accounts that need cross-device identity.
- Terminal interface with phosphor, amber and ice themes; responsive mobile navigation; live clock.
- Gemini API key and model selection saved separately for each signed-in account on the same browser/device.
- Live model catalogue fetched from the Gemini API. Model requests use the exact model ID selected from the API catalogue; the default is `gemini-3.8-flash` and can be changed to an ID actually returned by the account's API key.
- Multi-turn chat, Thinking indicator, copy actions and typewriter response reveal.
- Image uploads for visual understanding; PDF and DOCX reading; text, Markdown, CSV, JSON and source-file uploads.
- ZIP upload extraction in the browser. Text/code files inside the archive are included in the AI context; images and PDFs inside ZIPs are attached as file parts where supported.
- Generated code blocks with file paths can be saved into a nested project file tree.
- Generated HTML automatically opens in the isolated Canvas preview. Associated CSS and JavaScript files are inlined when their filenames match.
- Project Packager creates a downloadable ZIP with folders and a visible packaging state.
- Fifteen built-in plugins, each with a switch in the Plugins panel.
- New Chat archives the current conversation (when Chat Archive is enabled); archived conversations can be reopened from History.
- Profile Memory stores the preferred name, hobbies, interests and notes, and passes them as context to Gemini when enabled.
- Fixed local token allowance display: 20,000 tokens per day and 100,000 tokens per week, with midnight and Monday 00:00 WIB reset boundaries.
- At 100% of either local allowance, CodEX stops starting new requests until the corresponding reset.
- Animated sign-out confirmation with the requested Yes/No flow.
- PWA support, GitHub Pages workflow and Android debug-APK workflow.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```

Optional static TypeScript check:

```bash
npm run typecheck
```

## Gemini setup and model accuracy

1. Create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in to CodEX AI and open Settings.
3. Enter the key for that account.
4. Open Models and refresh the catalogue. CodEX requests the model list from Google's API and only presents models that advertise `generateContent` support.

CodEX calls Google's `models/{model}:generateContent` endpoint using the exact model ID selected. It does not silently substitute another model. If a selected ID is no longer available to the key, the API returns an explicit error and the live catalogue can be refreshed.

**Key storage note:** In Local Mode, the key is stored in browser local storage under that account's local UID. Another account on the same browser starts with a blank key. This is account separation, not secure secret storage: someone with access to that browser profile or developer tools can still inspect the key. A server-side API proxy is required to keep API keys secret.

## Upload and project files

The Console attachment button accepts images, PDF, DOCX, ZIP, text, Markdown, CSV, JSON and common source-code files. ZIP extraction and document text extraction happen locally before the relevant contents are sent to Gemini. Files are size-limited to avoid exhausting phone memory or API request limits. Unsupported binary formats are rejected with a readable error.

Ask CodEX for a project using explicit relative file paths, for example `index.html`, `src/app.js` and `assets/site.css`. Code blocks that contain a `filename="..."` attribute are saved into the Files panel. When an HTML file is detected and Live Canvas is enabled, the preview opens automatically. Use **Download Project ZIP** to download the full folder structure.

The Canvas is an isolated iframe. It is useful for inspecting generated front-end HTML/CSS/JavaScript, but it is not a full operating-system or Node.js runtime. Browser permissions and APIs may be restricted inside the preview.

## Plugins

The built-in plugin manager currently has fifteen functional switches:

- Vision Reader, Document Reader, Archive Explorer, Project Packager.
- Live Canvas, Profile Memory, Code Vault, Model Inspector.
- JSON Inspector, Command Kit, Typewriter Output, Sandbox Guard.
- Chat Archive, Workspace Search, Response Export.

These are local CodEX capabilities, not a claim that third-party plugins or independent services are installed.

## Usage limits — important distinction

Each account is assigned the same displayed allowance: **20,000 tokens per day** and **100,000 tokens per week**. Daily usage resets at 00:00 WIB; weekly usage resets Monday at 00:00 WIB. CodEX pauses new requests in this browser after a limit is reached and resumes after the relevant reset.

This is a **browser-side usage meter**, based on Gemini's response `usageMetadata`. It is not a server-enforced limit and is not the same as Google's project quota or billing meter. A user with browser developer tools can modify local storage or the device clock, and a cleared browser profile can lose the counter. To make quotas genuinely non-editable, shared across devices and enforceable against bypasses, the project needs a trusted backend that authenticates users, stores counters server-side and proxies Gemini requests. GitHub Pages alone cannot provide that guarantee.

## Login and memory

Without Firebase, account registration, API keys, chats, plugin switches, memory and usage counters are stored on the current browser/device. They do not automatically sync to another phone. Firebase can provide cross-device identity when configured using `FIREBASE_SETUP.md` and `firestore.rules`; the app's Gemini key and browser-side usage meter remain local in this version.

Profile Memory can retain details the user enters, such as a preferred name, hobbies, interests and notes. Gemini receives those details as context when Profile Memory is enabled. This is stored context, not consciousness or self-awareness.

## GitHub Pages deployment

1. Upload the extracted project contents to the repository root. Do not upload only the ZIP file.
2. Use the `main` branch, or edit `.github/workflows/pages.yml` to match the repository's default branch.
3. Open **Settings → Pages** and select **GitHub Actions** as the source.
4. Push a commit or run **Deploy CodEX AI to GitHub Pages** from Actions.
5. Open the Pages URL shown by the successful deployment.

## Android debug APK

The Android Gradle project is generated during the workflow. The workflow uses the Android SDK preinstalled on the GitHub-hosted runner, builds `app-debug.apk`, verifies that the APK exists and uploads it as the `CodEX-AI-APK` artifact.

1. Push the project to GitHub.
2. Open **Actions → Build CodEX AI Android APK**.
3. Tap **Run workflow**.
4. After a successful run, open the run summary and download **CodEX-AI-APK** from Artifacts.
5. Extract the artifact ZIP to get `app-debug.apk`.

This is a debug APK for testing, not a signed Play Store release. The app needs internet access for Gemini. Firebase is optional in Local Mode.

## Project structure

```text
codex-ai-terminal/
├── .github/workflows/       GitHub Pages and Android APK workflows
├── public/                  Favicon and PWA icons
├── src/
│   ├── lib/                 Authentication, Gemini, file upload, ZIP and storage helpers
│   ├── App.tsx              App panels and terminal interactions
│   ├── main.tsx             React entry point
│   └── styles.css           Responsive terminal interface
├── capacitor.config.ts      Capacitor Android wrapper configuration
├── firestore.rules          Optional cloud username/profile rules
├── firebase.json            Firebase CLI rules mapping
├── vite.config.ts           Vite and PWA configuration
└── README.md
```

## v1.2 (pembaruan)

- Download file nyata: di APK file disimpan lewat Filesystem + Share sheet (pilih Simpan ke File/Drive); file `.pdf` dibuat sebagai PDF asli.
- Tombol STOP (■) saat AI menjawab, serta tombol ↻ RETRY dan « REPLY di setiap pesan kamu. Jawaban selalu bervariasi.
- Voice ke teks: tombol mikrofon, rekam, ketuk lagi, teks muncul di kolom input (ditranskrip Gemini memakai API key kamu).
- Notifikasi saat jawaban selesai dan app di latar belakang; ketuk notifikasi untuk membuka konsol.
- Pause limit acak 20-120 menit setiap kali kuota habis.
- Log aktivitas AI (tahap yang sedang berjalan) menggantikan "Thinking...".
- Workflow APK menambahkan izin notifikasi dan mikrofon otomatis.
