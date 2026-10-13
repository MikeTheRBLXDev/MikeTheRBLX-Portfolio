# Private studio manager

The public portfolio remains on GitHub Pages. Visitors never need an account. This dashboard runs on a **separate Cloudflare Worker** and writes project details, image uploads and YouTube links into the portfolio repository. Those commits start the normal GitHub Pages publishing workflow.

The dashboard source is ready, but **live editing is disabled until you configure and deploy it**. No account credentials, Cloudflare resources or GitHub Apps have been created by this change. Opening `admin/public/index.html` as a local file is a visual preview, not an authenticated editor.

## Access model

Sign in with your GitHub account instead of a password stored in website code. The server allows only your immutable numeric GitHub user ID. It also checks the app's live repository access on every data request. The app must be private, installed on your personal account, and limited to exactly this one repository. It needs only **Contents: read and write**; GitHub's automatic **Metadata: read** permission is allowed. Additional repository/account permissions or an installation using "All repositories" are rejected.

Use a GitHub passkey or security key and enable two-factor authentication on both your GitHub and Cloudflare accounts. This gives strong account protection, but no website can honestly guarantee that intrusion is impossible.

The Worker uses PKCE and encrypted state during sign-in. Session cookies are AES-GCM encrypted, `HttpOnly`, `Secure`, `SameSite=Lax`, and use a `__Host-` prefix. They expire after one hour. GitHub access tokens remain inside the encrypted server-managed cookie and are never exposed to JavaScript, JSON responses or logs. Refresh tokens are discarded. Mutations require both the exact admin origin and a per-session CSRF header. Logout clears the cookie and requests token revocation from GitHub.

Only the login shell, styles and client JavaScript are public on the admin host; they contain no project data or secrets. All project data and writes require owner authentication. The public portfolio's published images and descriptions remain public by design. Hidden projects are excluded from the visible gallery; hiding is not a confidentiality mechanism for files committed to a public repository.

## One-time setup

1. Choose the dashboard's permanent HTTPS address. A Worker address such as `https://miketherblx-private-studio.YOUR-SUBDOMAIN.workers.dev` is sufficient, or use a dedicated custom domain. The public portfolio keeps its current address. You can deploy once with the supplied blank settings to reserve a Worker address; editing remains disabled.
2. In GitHub, open **Settings → Developer settings → GitHub Apps → New GitHub App**. Create a new app for this dashboard, with a unique name and the dashboard address as its homepage. This must be a **GitHub App**, not an OAuth App.
3. Set the user authorization callback URL to **`https://YOUR-ADMIN-HOST/auth/callback`**. Keep **Expire user authorization tokens** enabled. Leave device flow disabled. A webhook is unnecessary: uncheck **Active** in the Webhook section.
4. Under repository permissions select **Contents: Read and write**. Leave all other permissions at no access; Metadata read is automatically included. Do not request Actions, Workflows, Administration, or account permissions. Under **Where can this GitHub App be installed?**, select **Only on this account**.
5. Create the app, record its **Client ID** (starts with `Iv`), then generate a **Client secret**. This implementation uses the app's user authorization flow; it does not need an app private key. Install the app on your own account using **Only select repositories**, selecting only `MikeTheRBLX-Portfolio`.
6. Find your numeric GitHub ID using `https://api.github.com/users/YOUR-GITHUB-USERNAME`; copy its `id` field. This is the allowed user's numeric ID, not their username, the repository ID or the app ID.
7. Set the non-secret values in `admin/wrangler.jsonc`:

   | Variable | Value |
   | --- | --- |
   | `GITHUB_CLIENT_ID` | Your GitHub App's Client ID |
   | `OWNER_ID` | Your numeric GitHub user ID as a string |
   | `REPO_OWNER` | `MikeTheRBLXDev` (or the actual repository owner) |
   | `REPO_NAME` | `MikeTheRBLX-Portfolio` |
   | `REPO_BRANCH` | The branch that publishes the website, currently `main` |
   | `ADMIN_ORIGIN` | Exact HTTPS origin, with **no trailing slash or path** |

8. Install Node.js and, from the `admin` directory, install Wrangler and sign in to Cloudflare:

   ```powershell
   npm install
   npx wrangler login
   ```

9. Add the secrets directly to Cloudflare using the interactive prompts. Never put them in the repository, client JavaScript, screenshots, chat, or `wrangler.jsonc`:

   ```powershell
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET
   ```

   `SESSION_SECRET` must be an independently generated **32-byte random value encoded as base64url** (43 characters). A local password manager can generate/store it. Alternatively, generate it locally with Node:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Paste that result only into the Cloudflare secret prompt. Rotating it invalidates every existing dashboard session.

10. Run the tests and deploy from the `admin` directory:

    ```powershell
    npm test
    npm run deploy
    ```

11. Open the exact `ADMIN_ORIGIN` address and sign in. Check that your projects load. Edit one description and save; confirm the commit and resulting Pages deployment in GitHub. Test an incognito window: it must show only the login shell. A different GitHub account must not be able to edit.

The Worker intentionally rejects HTTP and mismatched hostnames when configured. Full authentication cannot be tested at plain `http://localhost`; use the final HTTPS host or a separately configured HTTPS staging host and app callback. Keep `assets.run_worker_first: true`: otherwise Cloudflare could serve static files before the access checks.

## Editing content

- **Descriptions, titles, order, featured and hidden status:** use the dashboard and save. It writes `project-details.json`. You can also edit that file directly.
- **Images:** upload PNG, JPG/JPEG, WebP, GIF or AVIF, up to 8 MiB. The Worker validates the extension and binary signature. Use a simple filename such as `Inventory-UI.png`. Existing filenames cannot be overwritten; choose a new one. SVG uploads are blocked. Your existing manual folder workflow still supports the formats documented in the main README.
- **Videos:** paste a YouTube link, optionally set a title and feature it. The Worker appends `*Title | https://www.youtube.com/watch?v=VIDEO_ID` to `assets/UI/youtube.txt` or `assets/Scripting/youtube.txt`. It checks every text-file list in that collection first; an existing video must be edited through its current project rather than added again.
- **Manual uploads:** adding files to `assets/UI/` or `assets/Scripting/` still works. For an adjacent description, add `image.png.json` containing the same details fields.
- **Featured priority:** global project details override sidecars and text-file stars. Explicit `featured: false` blocks a previous star from reselecting that project. The last starred video is used when there is no explicit featured selection. Hidden work cannot be featured.

Details use stable identities:

```json
{
  "ui:media:assets/UI/Inventory.png": {
    "title": "Inventory UI",
    "description": "What this interface helps players do.",
    "featured": true,
    "hidden": false,
    "order": 0
  },
  "ui:youtube:Wy2rbplQK28": {
    "title": "UI interaction demo",
    "featured": false
  }
}
```

Titles are nonblank and at most 200 characters; descriptions at most 5,000. `featured` and `hidden` are booleans, and order is a number from 0 to 1,000,000. The formatted metadata file, including its final newline, must stay within 1 MiB so it remains readable by the GitHub Contents API. Unsupported fields and invalid identities are rejected. Removing a project from the visible portfolio uses **Hide**; removing the source file permanently can be done in the repository.

Saves include GitHub's current file SHA. If another tab or a manual edit changes the metadata first, the dashboard returns a conflict instead of overwriting it. Reload and reapply your intended edit. Video-list writes use the same conditional SHA protection. The website update can take a few minutes after a successful commit.

## API contract

All routes are on the dashboard origin. No cross-origin access is enabled. Error responses use `{ "error": "A safe explanation" }` with an appropriate HTTP status. For write requests, send JSON with `Origin: ADMIN_ORIGIN` and `X-CSRF-Token` from the session response. Browser fetches set Origin automatically.

| Route | Behavior |
| --- | --- |
| `GET /api/session` | `{ authenticated, configured, login?, user?, csrf?, message? }`; `login` is `/auth/login`, `user.login` is the owner label |
| `GET /auth/login` | Starts GitHub App authorization with state and PKCE |
| `GET /auth/callback` | Fixed provider callback; creates the owner session |
| `POST /auth/logout` | CSRF checked; requests GitHub token revocation, expires the cookie; returns `{ authenticated:false, revoked }` |
| `GET /api/content` | `{ sha, metadata, projects:{ui:[],scripting:[]}, repository:{owner,name,branch} }`; hidden projects included for editing |
| `PUT /api/metadata` | `{ sha, metadata }`; `sha:null` for initial creation; returns `{sha,metadata}` |
| `POST /api/upload` | `{category,filename,base64}`; bare base64, without a data-URL prefix; returns `{path}` with status 201 |
| `POST /api/video` | `{category,url,title?,featured?}`; returns `{id,path}` with status 201 |

Project objects have `key`, `type`, `title`, `description`, `featured`, `hidden`, optional `order`/`slug`, and `previewUrl`. Media use `type:"media"` and `path`; YouTube projects use `type:"youtube"`, `id`, and canonical `url`.

## Verification and operations

`npm test` runs security and data-integrity checks with synthetic GitHub responses. It covers missing setup, anonymous access, owner mismatch, overly broad GitHub Apps, encrypted-cookie tampering and expiry, PKCE/state, CSRF, upload signatures/traversal, metadata validation, safe errors and concurrent saves. These tests do not contact GitHub or prove that your live account setup is complete.

The repository branch must permit the owner/app to commit its content changes. If it requires pull requests or signed commits, GitHub may reject direct dashboard saves; adjust the workflow intentionally before enabling the editor. GitHub API and Cloudflare quotas apply, and API outages temporarily prevent edits. The public static portfolio keeps working independently.

If access is compromised, revoke the GitHub App authorization, rotate `SESSION_SECRET` and the GitHub client secret, and review repository commits. Logout normally revokes its token immediately; if GitHub is unavailable, it still clears the browser cookie and reports that revocation could not be confirmed. Any previously copied session still expires after its one-hour limit. Keep platform request logging disabled or redact cookies, authorization codes and headers; this Worker contains no token/body logging.

Primary setup references: [GitHub App user authorization and PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [GitHub App installation access](https://docs.github.com/en/rest/apps/installations), [GitHub token revocation](https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token), and [Cloudflare Worker-first static assets](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
