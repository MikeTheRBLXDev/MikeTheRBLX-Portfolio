import argparse
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import urlopen

CATEGORIES = {'scripting': 'Scripting', 'ui': 'UI'}
SUPPORTED = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.mp4', '.webm', '.ogg', '.mov', '.m4v'}
VIDEO_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')
URL = re.compile(r'(?:https?://)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)/[^\s|<>]+', re.I)

def human_title(path):
    name = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', path.stem)
    return re.sub(r'[_-]+', ' ', name).strip() or 'Roblox Project'

def slugify(value):
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-') or 'project'

def migrated_path(path):
    for category, folder in CATEGORIES.items():
        prefix = f'portfolio/{category}/'
        if path.startswith(prefix):
            return f'assets/{folder}/' + path[len(prefix):]
    return path

def identity(item):
    if item.get('type') == 'youtube':
        return 'youtube:' + str(item.get('id', ''))
    return 'media:' + migrated_path(str(item.get('path', '')))

def youtube_id(url):
    parsed = urlsplit(url if '://' in url else 'https://' + url)
    hostname = (parsed.hostname or '').lower()
    if hostname == 'youtu.be':
        candidate = parsed.path.strip('/').split('/')[0]
    elif hostname in {'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'}:
        segments = parsed.path.strip('/').split('/')
        if segments[0] == 'watch':
            candidate = parse_qs(parsed.query).get('v', [''])[0]
        elif segments[0] in {'shorts', 'embed', 'live'} and len(segments) > 1:
            candidate = segments[1]
        else:
            return None
    else:
        return None
    return candidate if VIDEO_ID.fullmatch(candidate) else None

def parse_link(line):
    line = line.strip()
    if not line or line.startswith('#'):
        return None
    featured = line.startswith('*')
    if featured:
        line = line[1:].strip()
    title, separator, possible_url = line.partition('|')
    match = URL.search(possible_url if separator else line)
    if not match:
        return None
    video_id = youtube_id(match.group())
    if not video_id:
        return None
    return video_id, title.strip() if separator else '', featured

def fetch_title(video_id):
    query = urlencode({'url': f'https://www.youtube.com/watch?v={video_id}', 'format': 'json'})
    with urlopen(f'https://www.youtube.com/oembed?{query}', timeout=12) as response:
        return json.load(response)['title']

def generate(root, lookup=fetch_title):
    root = Path(root).resolve()
    manifest_path = root / 'portfolio.json'
    try:
        previous = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        previous = {}
    metadata = {
        identity(item): item
        for items in previous.values() if isinstance(items, list)
        for item in items if isinstance(item, dict)
    }
    category_metadata = {
        category: {identity(item): item for item in previous.get(category, []) if isinstance(item, dict)}
        for category in CATEGORIES
    }
    manifest = {}
    for category, folder_name in CATEGORIES.items():
        folder = root / 'assets' / folder_name
        items, seen, explicit_featured = [], set(), None
        for path in sorted(folder.rglob('*')):
            if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(folder.resolve()):
                continue
            discovered = []
            if path.suffix.lower() in SUPPORTED:
                discovered.append(({'type': 'media', 'path': path.relative_to(root).as_posix(), 'title': human_title(path)}, '', False))
            elif path.suffix.lower() == '.txt':
                for line in path.read_text(encoding='utf-8-sig', errors='replace').splitlines():
                    parsed = parse_link(line)
                    if parsed:
                        video_id, custom_title, featured = parsed
                        discovered.append(({'type': 'youtube', 'id': video_id, 'url': f'https://www.youtube.com/watch?v={video_id}'}, custom_title, featured))
            for item, custom_title, featured in discovered:
                key = identity(item)
                if key in seen:
                    continue
                seen.add(key)
                saved = category_metadata[category].get(key, metadata.get(key, {}))
                for field in ('title', 'description', 'slug', 'featured', 'title_source'):
                    if field in saved:
                        item[field] = saved[field]
                if item['type'] == 'youtube':
                    if custom_title:
                        item['title'] = custom_title
                        item['title_source'] = 'custom'
                    elif not item.get('title') or item.get('title_source') in {'fallback', 'custom'}:
                        try:
                            item['title'] = lookup(item['id'])
                            if not isinstance(item['title'], str) or not item['title'].strip():
                                raise ValueError('Empty video title')
                            item['title_source'] = 'youtube'
                        except Exception:
                            item['title'] = human_title(path) if path.stem.lower() not in {'youtube', 'youtube-links'} else 'Roblox Video Demo'
                            item['title_source'] = 'fallback'
                if featured:
                    explicit_featured = key
                items.append(item)
        # Reserve existing slugs before assigning new ones so adding a similarly
        # named file cannot change a previously shared project link.
        reserved = {item['slug']: identity(item) for item in items if item.get('slug')}
        used_slugs = set()
        has_featured = False
        for item in items:
            key = identity(item)
            base = item.get('slug') or (item['id'] if item['type'] == 'youtube' else slugify(item['title']))
            slug, number = base, 2
            while slug in used_slugs or (slug in reserved and reserved[slug] != key):
                slug = f'{base}-{number}'
                number += 1
            item['slug'] = slug
            used_slugs.add(slug)
            featured = key == explicit_featured if explicit_featured else bool(item.get('featured')) and not has_featured
            item['featured'] = featured
            has_featured = has_featured or featured
        if items and not has_featured:
            items[0]['featured'] = True
        manifest[category] = items
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Update the portfolio from the assets folders.')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    manifest = generate(args.root)
    print(f'Updated portfolio: {sum(map(len, manifest.values()))} projects.')
