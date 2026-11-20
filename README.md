# DropSpace

DropSpace is a local-first workspace for collecting and organizing links, notes, files, and images. It runs as a responsive website, an installable Progressive Web App (PWA), and a Manifest V3 extension for desktop Chrome.

For complete installation steps, see the [Installation Guide](./INSTALLATION.md).

## Features

- **Home dashboard:** drop zone, workspace statistics, spaces, and recently added resources.
- **Capture and organize:** save links and notes, attach files and images, add multiple entries to a resource, and create spaces while saving.
- **Resource management:** search, filter, sort, compact view, details, star, archive, trash, restore, and permanent delete.
- **Drag and drop:** capture local files and web links in the large drop area. The Chrome extension can capture the current page, selected text, and links.
- **Mobile PWA:** responsive mobile layout, home-screen installation support, and offline caching for the app shell and static assets.
- **Cloud sync:** optional Supabase authentication and per-account workspace sync across signed-in devices.
- **Device profile:** see registered browsers and sign out other Supabase sessions.
- **File storage:** local file bytes use IndexedDB; cloud files use a private Supabase Storage bucket.
- **Backup and preferences:** import/export workspace JSON and switch between light and dark themes.
- **Branding:** supplied DropSpace logo used in the web app, favicon, PWA, and Chrome extension.

## Technology

- React 18, TypeScript, Vite
- Supabase Auth, Database, and Storage (optional)
- Chrome Extension Manifest V3
- Web App Manifest and service worker for PWA support

## Requirements

- Node.js 18 or later and npm for development/building
- Desktop Chrome for the extension
- An HTTPS deployment for mobile PWA installation (localhost is suitable for local development)
- A Supabase project only if account login, cloud sync, device management, or cloud file storage is needed

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints in the terminal. Without Supabase environment variables, the app runs in local-only mode.

To build and preview the production site:

```bash
npm run build
npm run preview
```

The static website and Chrome extension build are written to `dist/`.

## Configure Supabase

1. Create a Supabase project and copy its Project URL and publishable/anon key into a root `.env.local` file:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-key
   ```

2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor. It creates the workspace and device tables, row-level security policies, and private storage bucket.
3. Enable Email under **Authentication > Providers**. Complete email confirmation if it is enabled.
4. Restart the Vite server, or rebuild and redeploy after changing environment variables. Create an account or sign in.

The workspace is stored as JSON per Supabase user. Uploaded cloud files use the private `dropspace-resources` bucket, with a 50 MB per-file limit. Device activity is registered for signed-in browsers. Signing out other sessions revokes those sessions; their existing access tokens may remain valid until they expire.

Never put a Supabase `service_role` key or another secret in this browser app. The publishable/anon key is intended for client-side use and must be protected by the included row-level security policies.

## Install on desktop Chrome

Use the [Installation Guide](./INSTALLATION.md) for all steps. In brief:

1. Follow the [Installation Guide](./INSTALLATION.md) to build the project; the extension is generated in `dist/`.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the `dist/` folder containing `manifest.json`.

The extension popup saves the current page; the side panel opens the full workspace; context-menu actions capture selected text or links. The extension is not currently published in the Chrome Web Store. Local unpacked installations do not auto-update.

## Install on mobile

Mobile phones use the PWA, not the desktop Chrome extension:

- **Android:** deploy DropSpace to HTTPS, open it in Chrome, then choose **Install app** from the in-app prompt or browser menu.
- **iPhone/iPad:** open the HTTPS website in Safari, tap **Share > Add to Home Screen**.

The PWA is installed from the browser; it is not an APK. Cloud sync and cloud file uploads require an internet connection. Chrome on Android and iOS cannot run this desktop extension.

See the [Installation Guide](./INSTALLATION.md) for deployment prerequisites, Supabase setup, Chrome updates, and troubleshooting.

## Data behavior

- **Local-only mode:** workspace data stays in the browser's local storage; uploaded file bytes stay in IndexedDB. This data does not automatically sync to another device or browser profile.
- **Supabase mode:** sign in with the same account on each device to sync the workspace. Cloud files are stored in the private Supabase bucket.
- **Website and extension:** each browser origin/profile has separate local storage. Use the same Supabase account when you want cloud resources shared between the web app and extension.
- **PWA offline behavior:** the service worker caches the app shell and static assets. It does not cache Supabase responses or private file downloads.
- **Workspace JSON:** Settings can export/import workspace resources. The export can contain private links and notes; keep it private.

## Project map

- [`src/App.tsx`](./src/App.tsx) — workspace UI, capture, navigation, and resource actions
- [`src/UploadDialog.tsx`](./src/UploadDialog.tsx) — drag-and-drop file and direct-link upload
- [`src/ProfilePage.tsx`](./src/ProfilePage.tsx) — account and connected-device UI
- [`src/lib/`](./src/lib/) — Supabase, workspace persistence, file storage, and device handling
- [`public/manifest.json`](./public/manifest.json) — Chrome extension manifest
- [`public/site.webmanifest`](./public/site.webmanifest) — PWA install metadata
- [`public/sw.js`](./public/sw.js) — app-shell service worker
- [`supabase/schema.sql`](./supabase/schema.sql) — database, RLS, and storage setup

## Known limitations

- The website must be deployed to an HTTPS host before it can be installed from a phone outside the development machine.
- Chrome Web Store publication has not been completed.
- AI categorization and collaboration are not connected.
- Sample resources are illustrative starter data.
