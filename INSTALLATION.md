# DropSpace Installation Guide

DropSpace can be used as a desktop Chrome extension, as a website, or as an installable mobile PWA. The Chrome extension is for desktop Chrome; on phones, use the PWA.

## Install the Chrome extension on desktop

### Build and load from source

1. Install Node.js 18 or later.
2. Open a terminal in the project folder and install dependencies:

   ```bash
   npm install
   ```

3. If you want cloud sync, configure Supabase first (see [Supabase setup](#configure-supabase-cloud-sync)).
4. Build the production app and extension:

   ```bash
   npm run build
   ```

5. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the generated `dist/` folder.

On Windows PowerShell, create or refresh a distributable ZIP after building:

```powershell
Compress-Archive -Path .\dist\* -DestinationPath .\DropSpace-Chrome-Extension.zip -Force
```

Extract the ZIP to a folder that you will keep, then select that folder in **Load unpacked**. It must contain `manifest.json` directly inside it.

You can also right-click selected text or a link and choose the DropSpace capture action. The extension includes a shortcut (`Alt+Shift+D`) for opening it.

### Update or remove the local extension

- To update an unpacked installation, rebuild or extract the new files, then select **Reload** on the DropSpace card at `chrome://extensions`. If you extracted to a new folder, remove the old installation and load the new folder.
- To remove it, select **Remove** on the DropSpace card. This removes the extension from that Chrome profile.
- Local unpacked installations do not update automatically. For automatic updates and one-click installation, publish through the Chrome Web Store. This project is not currently published there.

Chrome will show the permissions requested by the extension when it is loaded. DropSpace uses Chrome storage, the side panel, context menus, the active tab, and Supabase hosts when cloud sync is configured.

## Install on Android

The mobile app is a PWA, not an APK. First deploy the production website to an HTTPS address; a development address such as `localhost` is not available on other devices.

1. Open the deployed DropSpace URL in Chrome on Android.
2. Sign in or create an account if Supabase is configured.
3. On Home, tap **Install** if DropSpace offers the install prompt. You can also open Chrome's three-dot menu and select **Install app** or **Add to Home screen**.
4. Confirm the installation. DropSpace will appear on the home screen and in the app list.

If the install option is missing, verify that the site uses HTTPS, the PWA manifest and service worker are reachable, and then reload the site. Some browsers wait for a later visit or user interaction before showing an install prompt.

## Install on iPhone or iPad

1. Deploy DropSpace to an HTTPS address and open it in Safari.
2. Sign in or create an account if Supabase is configured.
3. Tap **Share**, then **Add to Home Screen**.
4. Confirm the name and tap **Add**.

The new home-screen icon opens DropSpace in its own app-like window. iOS does not support installing this desktop Chrome extension; use the PWA instead.

## Deploy the mobile website

The project builds to a static `dist/` folder. Choose a static hosting provider that serves the site over HTTPS, then:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the hosting provider's build environment if you want cloud sync. Vite reads these values during the build, so rebuild/redeploy after changing them.
2. Build the project with `npm run build`.
3. Publish the contents of `dist/` and open the resulting HTTPS URL on the phone.
4. Install it from the mobile browser using the steps above.

The service worker caches the app shell and static assets. Cloud workspace sync and Supabase file uploads still require an internet connection.

## Configure Supabase cloud sync

1. Create a Supabase project.
2. In the project settings, copy the Project URL and the publishable/anon key. Add them to a root `.env.local` file:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-key
   ```

3. In the Supabase dashboard, open **SQL Editor** and run [`supabase/schema.sql`](./supabase/schema.sql). This sets up workspace and device tables, row-level security, and the private file-storage bucket.
4. Enable Email under **Authentication > Providers**. If email confirmation is enabled, confirm the account before signing in.
5. Restart the dev server or rebuild/redeploy the site after editing `.env.local`, then create an account or sign in.

Never put a Supabase `service_role` key or other secret in this browser app. The publishable/anon key is intended for client apps and relies on the database's row-level security policies.

## Local web development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To verify the production build locally, run:

```bash
npm run build
npm run preview
```

Without Supabase environment variables, DropSpace uses local browser storage. Local-only workspaces do not sync between devices.
