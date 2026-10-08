# MikeTheRBLXDev — GitHub Portfolio

A fast, static Roblox developer portfolio built around a dark technical / electric-blue visual identity.

## Portfolio workflow

You do **not** need to edit HTML, CSS, or JavaScript when adding work.

Upload your files into one of these folders:

- `portfolio/scripting/`
- `portfolio/ui/`

The included GitHub Action automatically scans those folders and creates `portfolio.json`.

### Supported media

Images:
`.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` `.avif`

Videos:
`.mp4` `.webm` `.ogg` `.mov` `.m4v`

Image and video filenames become readable project titles. YouTube links in `youtube.txt` or `youtube-links.txt` use the video's actual title when it can be retrieved.

Each item in `portfolio.json` can also have a `title`, `description`, `slug`, and `featured` field. These values are preserved when the manifest is regenerated. Keep an existing `slug` unchanged to preserve shared project links. Set `featured` to `true` on the project you want highlighted in each category.

Project links use `portfolio.html#category/slug`. Visitors can copy them from the project cards or previews. The site opens the matching category and preview when a shared link is visited.

## GitHub Pages

1. Create a public GitHub repository.
2. Upload the contents of this project to the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **GitHub Actions**.
5. Push/upload your portfolio media.
6. The `Update portfolio` action will generate `portfolio.json`.
7. Your site will be published by GitHub Pages.

## Important

GitHub Actions needs permission to write `portfolio.json`.

The workflow already requests:

`permissions: contents: write`

If a repository's settings restrict workflow write access, enable workflow read/write permissions in the repository's Actions settings.

## Editing the site

- Main content: `index.html`
- Design: `styles.css`
- Portfolio behavior: `portfolio.js`
- Clipboard controls and announcements: `site.js`
- Auto-discovery: `.github/workflows/generate-manifest.yml`
- Manifest generation: `.github/scripts/generate-manifest.py`
- Branding: `assets/branding/`
