# MikeTheRBLXDev — Roblox UI design

A public Roblox UI design portfolio with UI animation, implementation, and selected scripting support. Clients browse your work and contact you without logging in.

Manage projects through **`portfolio-content.js`**, and keep dropping images into the existing folders. No admin account, GitHub App, additional Worker, npm install, or Python setup is needed for this workflow.

## The everyday workflow

1. Put new images in **`assets/UI/`** for UI design, or **`assets/Scripting/`** for supporting scripting work. Subfolders work too.
2. Open **`portfolio-content.js`** in your text editor to add descriptions, custom titles, or YouTube videos. Image details are optional: an image with no entry appears automatically, using its filename as the starting title.
3. Double-click **`Update portfolio.cmd`** to regenerate `portfolio.json`.
4. Double-click **`Preview portfolio.cmd`**, then open **http://127.0.0.1:4173** to check the site. Keep the command window open; press Ctrl+C to stop.
5. Upload or push your changed files to the existing GitHub repository, including **`portfolio-content.js`**, **`portfolio.json`**, and any new images. Your connected Cloudflare deployment publishes the changes.

The command files use an installed Node.js runtime or the Node.js runtime already bundled with Codex on this computer. If neither exists, install Node.js and reopen the command file. You do not need to install project dependencies.

## Image titles and descriptions

Add an entry under `ui.images` for a file in `assets/UI/`:

```js
"Shop Menu.png": {
  title: "Simulator shop interface",
  description: "A clear shop layout with easy-to-find upgrades.",
  featured: true,
  order: 4,
},
```

The key must match the image filename, including its extension. For subfolders, use a forward slash, such as `Menus/Shop Menu.png`. An entry does not create an image: the matching file must exist in the folder.

Supported images: PNG, JPG, JPEG, WebP, GIF, SVG, and AVIF. Local MP4, WebM, OGG, MOV, and M4V videos also work in these folders, with details added in the same `images` map. General branding stays in `assets/NormalAssets/`; that folder does not become gallery projects.

## YouTube videos

Add entries to `ui.youtube` or `scripting.youtube`. The quick version is:

```js
"Inventory interaction demo | https://youtu.be/VIDEO_ID",
```

Put a `*` at the start to feature it:

```js
"* Inventory interaction demo | https://youtu.be/VIDEO_ID",
```

For a description and more settings, use an object instead:

```js
{
  url: "https://youtu.be/VIDEO_ID",
  title: "Animated inventory interface",
  description: "A walkthrough of the layout and UI animations.",
  featured: true,
  order: 0,
},
```

Replace `VIDEO_ID` with the real YouTube video ID, or paste the full real YouTube URL. Standard watch URLs, short URLs, Shorts, embeds, and live links work. Give each new video a title so publishing does not depend on a title lookup.

The `youtube` arrays in `portfolio-content.js` are the active video lists. Old `.txt` video lists are a fallback only when a category's entire `youtube` property is omitted. An empty `youtube: []` means no YouTube videos in that category.

## Optional project settings

| Field | Effect |
| --- | --- |
| `title` | Custom project name |
| `description` | Text explaining the project |
| `featured: true` | Highlights the project in its category |
| `featured: false` | Excludes it from automatic featured selection |
| `hidden: true` | Keeps it out of the visible gallery |
| `order` | Lower numbers appear first; unordered projects follow |

Use one featured project per category. If several visible projects are explicitly marked, the last marked item wins: image entries are considered first, then YouTube entries. Existing project links remain stable when titles change.

Remove a video from its `youtube` array to remove it from the gallery. Delete an image file to remove that image; its optional details entry can also be deleted. Hiding a project only removes it from the gallery: uploaded files and their direct URLs remain public.

Keep commas between entries and use quoted text. The generator reports invalid entries or syntax errors without replacing the last valid `portfolio.json`.

## Build and publishing

The active generator uses only Node.js built-in modules:

```powershell
node scripts/portfolio.cjs
node scripts/portfolio.cjs --build
```

The first command updates `portfolio.json`. The second also packages the public website into `_site/`. The updated GitHub Pages workflow uses this same generator.

You can continue publishing to your current Cloudflare site by committing the freshly generated `portfolio.json`; there is no additional service to set up. To regenerate automatically during Cloudflare builds, use these commands from the repository root:

| Cloudflare setting | Value |
| --- | --- |
| Build command | `node scripts/portfolio.cjs --build` |
| Deploy command | `npx wrangler deploy --config scripts/cloudflare.wrangler.jsonc` |

The optional `scripts/cloudflare.wrangler.jsonc` publishes `_site/` when explicitly selected by that deploy command. It does not change your current Cloudflare setup automatically. The private admin, content source, and legacy metadata are excluded from that public package.

The old Python generator, `project-details.json`, and adjacent metadata files are retained for reference; the active manual workflow uses `portfolio-content.js`. The optional dashboard source remains in `admin/`, but it is inactive and is not needed. Return to its setup only if you decide you want an authenticated editor later.
