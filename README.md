# MikeTheRBLXDev Portfolio

## Add more work

No website code or JSON editing is needed.

```text
assets/
  NormalAssets/
    logo.webp
    banner.webp
  Scripting/
    youtube.txt
  UI/
    youtube.txt
    your images...
```

### UI photos

Put your image in `assets/UI/`, then upload or push the changes to GitHub. The photo appears in the UI portfolio automatically.

Give new images readable filenames, such as `Inventory UI.png` or `Shop Menu.jpg`. Their filenames become their project titles. Existing project titles and shared links are preserved.

Supported images: PNG, JPG, JPEG, WebP, GIF, SVG, and AVIF.

### UI YouTube videos

Open `assets/UI/youtube.txt`, paste a YouTube link on a new line, and save it. Upload or push the change to GitHub.

### Scripting YouTube videos

Do the same in `assets/Scripting/youtube.txt`.

One link per line is enough:

```text
https://www.youtube.com/watch?v=Wy2rbplQK28
https://youtu.be/ibiyGn6kSrM
```

Video titles are retrieved automatically. Standard YouTube links, short links, Shorts, and live-video links are supported. Duplicate links in a category are ignored.

For a custom title, use:

```text
My Combat System | https://youtu.be/69UuARjWwTU
```

To feature a video, put `*` at the start of its line:

```text
* My Combat System | https://youtu.be/69UuARjWwTU
```

You can also use separate `.txt` files in either category if you prefer. Subfolders are supported too.

### Normal assets

Use `assets/NormalAssets/` for your profile picture, banner, and any other general website images. These files are excluded from the portfolio gallery.

Replacing `logo.webp` updates the header icon, favicon, and logo backdrop. The banner is stored as `banner.webp` for future use; the current homepage keeps its logo backdrop.

### Update locally

If you want to refresh `portfolio.json` before uploading, double-click `Update portfolio.cmd`. It uses the Python installation already available on this computer. The GitHub workflow does not need you to install anything locally.

### Publish

Upload or push the changes to the repository's default branch. The `Update portfolio` workflow builds the portfolio from the folders and publishes the result through GitHub Pages.

GitHub Pages must use **Settings → Pages → Build and deployment → Source → GitHub Actions**. If it is already configured that way, no settings change is needed. Keep your existing custom domain configured in Pages settings.

`portfolio.json` is generated during publishing. Its existing project titles, descriptions, featured selections, and slugs are preserved. The automatic workflow deploys the generated file directly instead of making extra commits to your repository.

### Remove a project

Delete its image or remove its YouTube link, then upload or push the change.
