# MikeTheRBLXDev — Roblox UI design

A public portfolio and enquiry website centered on Roblox UI design, with UI animation, implementation, and selected scripting support. Clients browse the work and contact Mike without creating an account.

The website runs on GitHub Pages. The separate owner dashboard lives in [`admin/`](admin/README.md). It uses a Cloudflare Worker and a private GitHub App restricted to the owner's account and this repository. Its host, account access, and secrets must be configured before editing is enabled. There are no admin passwords or repository tokens in the public website.

## Preview the website

Double-click `Preview portfolio.cmd`, then open `http://127.0.0.1:4173` in your browser. Keep its window open while previewing; press Ctrl+C to stop. It refreshes the content and uses the Python runtime bundled with Codex on this computer, or an existing Python installation. Use this local server so the gallery can load its JSON correctly.

## Add an image

Put an image in `assets/UI/`, then upload or push it to GitHub. It appears automatically after the **Update portfolio** workflow publishes the site.

Use a readable filename, such as `Inventory UI.png` or `Shop Menu.jpg`. The filename becomes its initial title. Existing titles and shared project links are preserved when more work is added. Subfolders are supported.

Supported images: PNG, JPG, JPEG, WebP, GIF, SVG, and AVIF. Supported local video files: MP4, WebM, OGG, MOV, and M4V. For longer video demos, YouTube is usually easier to manage.

```text
assets/
  NormalAssets/
    logo.webp
    banner.webp
  UI/
    Shop Menu.png
    Shop Menu.png.json     optional details for this image
    youtube.txt
  Scripting/
    youtube.txt
```

`assets/NormalAssets/` holds general website branding. Its contents do not become portfolio projects.

## Add a YouTube video

Paste one YouTube link per line in `assets/UI/youtube.txt`. Use `assets/Scripting/youtube.txt` for supporting scripting work. Any `.txt` file in either category works, including files in subfolders.

```text
https://www.youtube.com/watch?v=Wy2rbplQK28
https://youtu.be/ibiyGn6kSrM
```

Titles are retrieved automatically when needed. Standard YouTube links, short links, Shorts, embedded links, and live-video links are supported. Duplicate videos within a category are ignored. If YouTube cannot provide a title, a fallback title is used and the generator retries on a future update.

For your own title, put it before a `|`:

```text
Inventory interaction demo | https://youtu.be/69UuARjWwTU
```

To feature a video, put `*` at the start:

```text
* Inventory interaction demo | https://youtu.be/69UuARjWwTU
```

Use one star per category. If several videos are starred, the last discovered starred link wins. A feature selected in the owner dashboard takes priority; see the precedence notes below.

## Add descriptions or feature an image

The owner dashboard can edit titles, descriptions, featured selections, visibility, and ordering. You can also do these edits directly in files.

For a single image or local video, create a JSON file beside it with the **complete filename plus `.json`**. For example, `Shop Menu.png.json` describes `Shop Menu.png`:

```json
{
  "title": "Simulator shop interface",
  "description": "A shop interface with clear item categories and a prominent purchase action.",
  "featured": true,
  "hidden": false,
  "order": 0
}
```

All five fields are optional. This is the Windows-compatible way to feature an image. There is no need to use a `*` in an image filename.

The owner dashboard saves edits in the root `project-details.json`. Its keys combine the category and a stable file or video identity:

```json
{
  "ui:media:assets/UI/Shop Menu.png": {
    "title": "Simulator shop interface",
    "description": "A description of the interface and the decisions behind it.",
    "featured": true,
    "order": 0
  },
  "ui:youtube:Wy2rbplQK28": {
    "title": "Inventory interaction demo",
    "description": "A video walkthrough of the interface.",
    "hidden": false
  }
}
```

- `title`: a nonempty string, at most 200 characters.
- `description`: a string, at most 5,000 characters; an empty string is allowed.
- `featured` and `hidden`: `true` or `false`.
- `order`: a number from 0 to 1,000,000. Lower numbers appear first. Items without an order appear afterward in their existing discovery order.

Metadata never creates a project by itself: the image, local video, or YouTube link must exist in the assets folders. Entries for removed assets can stay in the details file without bringing the project back.

### Precedence and featured projects

For each field, `project-details.json` takes priority over the adjacent `.json` file, which takes priority over the automatically discovered content. Existing `portfolio.json` titles, descriptions, and slugs remain the starting point so old project links continue to work.

There is at most one visible featured project in each category. The selection follows this order:

1. An explicit `featured: true` in `project-details.json`.
2. An explicit `featured: true` in an image or video sidecar.
3. The last starred YouTube link.
4. The previous featured project.
5. The first visible eligible project.

An explicit `featured: false` excludes that item from all feature choices, including a `*` in its source link. A hidden item is never featured. If every item is hidden or explicitly excluded, the category has no featured project. To return a dashboard-managed selection to the `*` workflow, remove its `featured` overrides from `project-details.json`.

Invalid metadata stops publishing with a useful error instead of quietly discarding edits. Fix the field identified in the workflow log and publish again.

## Remove or hide a project

Delete an image or remove its YouTube link to remove a project. To keep it available for later, set `hidden: true` in its details. The public gallery filters hidden items.

Visibility is an editorial setting. Files in the repository and deployed image URLs are public content; do not upload confidential client work or put private notes in project descriptions.

## Preview and publish

Double-click **Update portfolio.cmd** to refresh `portfolio.json` locally using Python. Alternatively:

```powershell
python .github/scripts/generate-manifest.py
python -m http.server 8000
```

Open `http://localhost:8000` in your browser. The generator writes UTF-8 JSON and does not require any third-party Python packages.

Upload or push changes to the repository's default branch. The **Update portfolio** workflow generates the manifest, runs the content regression tests, and publishes through GitHub Pages. Metadata edits and new assets trigger it automatically.

GitHub Pages must use **Settings → Pages → Build and deployment → Source → GitHub Actions**. Keep the existing custom domain configured in Pages settings and in `CNAME`.

`portfolio.json` is generated during publishing. The workflow deploys the generated file directly instead of creating extra repository commits. Only an explicit list of public pages, scripts, styles, generated data, approved asset types, and optional `CNAME`, `robots.txt`, and `sitemap.xml` enters the Pages artifact. The admin backend, its configuration, source text files, sidecars, and `project-details.json` are excluded from that artifact.

## Owner dashboard setup

See [`admin/README.md`](admin/README.md) for deployment, owner authentication, repository access, and the security checks. The dashboard is a separate service; publishing the public website does not deploy or configure it. Public visitors never need to log in.

## Test the content pipeline

```powershell
python -m unittest discover -s .github/scripts -p "test_*.py"
```

These tests use temporary folders and mocked video titles. They cover discovery, stable shared links, duplicate videos, stars, metadata precedence, hidden projects, ordering, removals, invalid metadata, and offline title lookup without contacting YouTube.
