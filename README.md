# Mike's Roblox UI portfolio

One page for the introduction, work, Terms of Service, and contact. Clients scroll through one large showcase at a time. There is no category picker or separate gallery page.

The site uses plain HTML, CSS, and JavaScript. Content generation and preview use Node.js built-in modules, with no npm install or extra service required.

## Add work

1. Drop images or local videos into **`assets/UI/`**. Subfolders work too.
2. Add custom titles and descriptions in **`portfolio-content.js`** if you want them. Files without an entry still appear, with a title taken from the filename.
3. Double-click **`Update portfolio.cmd`** to update the generated `portfolio.json`.
4. Double-click **`Preview portfolio.cmd`** and open **http://127.0.0.1:4173**. Keep the command window open; Ctrl+C stops it.
5. Commit the content file, generated JSON, and new media to your repository, or upload the built `_site/` folder through your existing host.

The command files use installed Node.js or the Node.js runtime bundled with Codex on this computer.

## Titles and descriptions

An image's settings go under `ui.images`. The key must match its filename, including the extension:

```js
"Shop Menu.png": {
  title: "Shop menu",
  description: "A quick look at the shop I made for this game.",
  order: 4,
},
```

For a nested file, use a forward slash: `Menus/Shop Menu.png`. Settings do not create a project unless the matching media file exists.

Supported images: PNG, JPG, JPEG, WebP, GIF, SVG, and AVIF. Local MP4, WebM, OGG, MOV, and M4V videos use the same folder and settings map. Branding stays in `assets/NormalAssets/` and does not appear as a project.

## YouTube UI demos

Add a video under `ui.youtube` in `portfolio-content.js`:

```js
{
  url: "https://youtu.be/VIDEO_ID",
  title: "Inventory animation",
  description: "See the inventory open, close, and react to input.",
  order: 4,
},
```

Replace `VIDEO_ID` with a real video ID, or paste its full YouTube URL. Watch, short, Shorts, embed, and live links are supported. Give the video a title to avoid a build-time title lookup.

A quick entry also works:

```js
"Inventory animation | https://youtu.be/VIDEO_ID",
```

Start that string with `*` to feature it in the introduction. `youtube: []` means there are no YouTube projects. Only the content file supplies video entries; text-file lists and old metadata are no longer used. The website loads a YouTube player when a visitor chooses to play a demo.

## Optional settings

| Field | Effect |
| --- | --- |
| `title` | Project name |
| `description` | Text below the preview |
| `featured: true` | Selects the introduction's featured project |
| `featured: false` | Excludes it from automatic featured selection |
| `hidden: true` | Removes it from the visible showcase |
| `order` | Lower numbers appear first; unordered files follow |

Choose one featured project. If several visible entries are marked, the last marked entry wins: image settings first, then YouTube entries. Existing project slugs remain stable when titles change.

Delete a media file or remove a video entry to remove its project. Hiding work does not make uploaded files or direct media URLs private. Keep commas between entries and use quoted text. Invalid content leaves the last valid generated JSON intact.

## Images and performance

Current showcase images have smaller WebP copies in `assets/previews/`; their full-resolution originals remain in `assets/UI/`. The generator detects matching `<filename with extension>-800.webp` and `-1600.webp` pairs and adds them to the manifest. New images work immediately without those copies, using the original file. For large new images, export appropriately sized WebP versions using the same naming convention for faster loading.

The page uses responsive previews, lazy loading, and click-to-load video players. Scroll effects use transforms and opacity, and visitors who prefer reduced motion can browse without the movement. The footer's motion switch lets a visitor override that preference; the choice is remembered in their browser.

## Build, test, and publish

```powershell
node --test scripts/portfolio.test.cjs
node scripts/portfolio.cjs
node scripts/portfolio.cjs --build
```

The update command regenerates `portfolio.json`. Build also replaces `_site/` with the public page, its media, hosting redirects, and SEO files. Content source, scripts, tests, and repository files are excluded from the public package. The GitHub Pages workflow uses the same generator.

For your existing Cloudflare setup:

| Setting | Value |
| --- | --- |
| Build command | `node scripts/portfolio.cjs --build` |
| Deploy command | `npx wrangler deploy --config scripts/cloudflare.wrangler.jsonc` |

The Wrangler configuration publishes `_site/` when explicitly selected. Run that deploy command only when you want to publish. Cloudflare and the local preview redirect the old `/portfolio.html`, `/contact.html`, and `/tos.html` URLs into the matching section of the new page. GitHub Pages does not process Cloudflare `_redirects` rules.
