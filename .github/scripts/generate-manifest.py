import json
import re
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
CATEGORIES = ('scripting', 'ui')
SUPPORTED = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.mp4', '.webm', '.ogg', '.mov', '.m4v'}
YOUTUBE = re.compile(r'(?:https?://)?(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])')

def human_title(path):
    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', path.stem)
    name = re.sub(r'[_-]+', ' ', name).strip()
    return name or 'Roblox Project'

def slugify(value):
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-') or 'project'

def key(item):
    return item.get('id') if item.get('type') == 'youtube' else item.get('path')

manifest_path = ROOT / 'portfolio.json'
try:
    previous = json.loads(manifest_path.read_text(encoding='utf-8'))
except (OSError, ValueError):
    previous = {}
metadata = {key(item): item for items in previous.values() if isinstance(items, list) for item in items}
manifest = {}
for category in CATEGORIES:
    folder = ROOT / 'portfolio' / category
    items, seen, used_slugs = [], set(), set()
    for path in sorted(folder.rglob('*')):
        if not path.is_file():
            continue
        discovered = []
        if path.suffix.lower() in SUPPORTED:
            discovered.append({'type': 'media', 'path': path.relative_to(ROOT).as_posix(), 'title': human_title(path)})
        elif path.name.lower() in {'youtube.txt', 'youtube-links.txt'}:
            for line in path.read_text(encoding='utf-8', errors='ignore').splitlines():
                match = YOUTUBE.search(line)
                if not match:
                    continue
                video_id = match.group(1)
                item = {'type': 'youtube', 'id': video_id, 'url': f'https://www.youtube.com/watch?v={video_id}'}
                if not metadata.get(video_id, {}).get('title'):
                    try:
                        query = urlencode({'url': item['url'], 'format': 'json'})
                        with urlopen(f'https://www.youtube.com/oembed?{query}', timeout=12) as response:
                            item['title'] = json.load(response)['title']
                    except Exception:
                        item['title'] = f'Roblox Demo {video_id}'
                discovered.append(item)
        for item in discovered:
            identifier = key(item)
            if identifier in seen:
                continue
            seen.add(identifier)
            saved = metadata.get(identifier, {})
            for field in ('title', 'description', 'slug', 'featured'):
                if field in saved:
                    item[field] = saved[field]
            base = item.get('slug') or (item['id'] if item['type'] == 'youtube' else slugify(item['title']))
            slug, number = base, 2
            while slug in used_slugs:
                slug = f'{base}-{number}'
                number += 1
            used_slugs.add(slug)
            item['slug'] = slug
            items.append(item)
    manifest[category] = items

manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(f'Updated portfolio: {sum(map(len, manifest.values()))} projects.')
