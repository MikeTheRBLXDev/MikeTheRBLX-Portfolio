import argparse
import json
import math
import re
from pathlib import Path, PurePosixPath
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import urlopen

CATEGORIES = {'scripting': 'Scripting', 'ui': 'UI'}
SUPPORTED = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.mp4', '.webm', '.ogg', '.mov', '.m4v'}
VIDEO_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')
URL = re.compile(r'(?:https?://)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)/[^\s|<>]+', re.I)
DETAIL_FIELDS = {'title', 'description', 'featured', 'hidden', 'order'}

def human_title(path):
    name = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', path.stem.lstrip('*').strip())
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


def validate_details(details, source):
    """Keep authoring mistakes from silently publishing broken project data."""
    if not isinstance(details, dict):
        raise ValueError(f'{source}: project details must be a JSON object')
    unknown = set(details) - DETAIL_FIELDS
    if unknown:
        raise ValueError(f'{source}: unsupported field(s): {", ".join(sorted(unknown))}')
    for field, value in details.items():
        if field == 'title' and (not isinstance(value, str) or not value.strip() or len(value) > 200):
            raise ValueError(f'{source}: title must contain 1–200 characters')
        if field == 'description' and (not isinstance(value, str) or len(value) > 5000):
            raise ValueError(f'{source}: description must be a string of at most 5000 characters')
        if field in {'featured', 'hidden'} and type(value) is not bool:
            raise ValueError(f'{source}: {field} must be true or false')
        if field == 'order' and (type(value) not in {int, float} or not math.isfinite(value) or not 0 <= value <= 1_000_000):
            raise ValueError(f'{source}: order must be a finite number from 0 to 1000000')
    return details


def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as error:
        raise ValueError(f'Cannot read {path.name}: {error}') from error


def valid_detail_key(key):
    if not isinstance(key, str):
        return False
    category, separator, project = key.partition(':')
    if not separator or category not in CATEGORIES:
        return False
    if project.startswith('youtube:'):
        return bool(VIDEO_ID.fullmatch(project[8:]))
    if not project.startswith('media:'):
        return False
    path = project[6:]
    parsed = PurePosixPath(path)
    prefix = f'assets/{CATEGORIES[category]}/'
    return (path.startswith(prefix) and '\\' not in path and not parsed.is_absolute()
            and all(part not in {'', '.', '..'} for part in path.split('/'))
            and parsed.suffix.lower() in SUPPORTED)


def load_project_details(root):
    path = root / 'project-details.json'
    if not path.exists():
        return {}
    details = read_json(path)
    if not isinstance(details, dict):
        raise ValueError('project-details.json must be a JSON object keyed by category:identity')
    for key, value in details.items():
        if not valid_detail_key(key):
            raise ValueError(f'project-details.json: invalid project key {key!r}')
        validate_details(value, f'project-details.json [{key}]')
    return details

def generate(root, lookup=fetch_title):
    root = Path(root).resolve()
    project_details = load_project_details(root)
    manifest_path = root / 'portfolio.json'
    try:
        previous = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        previous = {}
    if not isinstance(previous, dict):
        previous = {}
    metadata = {
        identity(item): item
        for items in previous.values() if isinstance(items, list)
        for item in items if isinstance(item, dict)
    }
    category_metadata = {
        category: {identity(item): item for item in previous.get(category, []) if isinstance(item, dict)}
        if isinstance(previous.get(category), list) else {}
        for category in CATEGORIES
    }
    manifest = {}
    for category, folder_name in CATEGORIES.items():
        folder = root / 'assets' / folder_name
        items, seen, star_features, detail_features, sidecar_features = [], set(), [], [], []
        blocked_features = set()
        for path in sorted(folder.rglob('*')):
            if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(folder.resolve()):
                continue
            discovered = []
            if path.suffix.lower() in SUPPORTED:
                discovered.append(({'type': 'media', 'path': path.relative_to(root).as_posix(), 'title': human_title(path)}, '', path.name.startswith('*')))
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
                details = project_details.get(f'{category}:{key}', {})
                saved = category_metadata[category].get(key, metadata.get(key, {}))
                for field in ('title', 'description', 'slug', 'featured', 'title_source'):
                    if field in saved:
                        item[field] = saved[field]
                if item['type'] == 'youtube':
                    if custom_title:
                        item['title'] = custom_title
                        item['title_source'] = 'custom'
                    elif 'title' not in details and (not item.get('title') or item.get('title_source') in {'fallback', 'custom'}):
                        try:
                            item['title'] = lookup(item['id'])
                            if not isinstance(item['title'], str) or not item['title'].strip():
                                raise ValueError('Empty video title')
                            item['title_source'] = 'youtube'
                        except Exception:
                            item['title'] = human_title(path) if path.stem.lower() not in {'youtube', 'youtube-links'} else 'Roblox Video Demo'
                            item['title_source'] = 'fallback'
                sidecar = {}
                if item['type'] == 'media':
                    sidecar_path = path.with_name(path.name + '.json')
                    if sidecar_path.exists():
                        if sidecar_path.is_symlink() or not sidecar_path.resolve().is_relative_to(folder.resolve()):
                            raise ValueError(f'{sidecar_path.name}: metadata must stay inside the assets folder')
                        sidecar = validate_details(read_json(sidecar_path), sidecar_path.relative_to(root).as_posix())
                item.update(sidecar)
                item.update(details)
                if 'title' in sidecar or 'title' in details:
                    item['title_source'] = 'custom'
                if details.get('featured') is True:
                    detail_features.append(key)
                elif details.get('featured') is False:
                    blocked_features.add(key)
                elif sidecar.get('featured') is True:
                    sidecar_features.append(key)
                elif sidecar.get('featured') is False:
                    blocked_features.add(key)
                if featured:
                    star_features.append(key)
                item.setdefault('description', '')
                item.setdefault('hidden', False)
                items.append(item)
        items.sort(key=lambda item: item.get('order', 1_000_001))
        visible_keys = {identity(item) for item in items if not item['hidden']}
        featured_key = None
        # The admin is authoritative. A false setting also suppresses a source
        # star, so an old starred link cannot undo a later dashboard selection.
        for candidates in (detail_features, sidecar_features, list(reversed(star_features))):
            featured_key = next((key for key in candidates if key in visible_keys and key not in blocked_features), None)
            if featured_key:
                break
        if not featured_key:
            featured_key = next((identity(item) for item in items if item.get('featured') and not item['hidden']
                                 and identity(item) not in blocked_features), None)
        if not featured_key:
            featured_key = next((identity(item) for item in items if not item['hidden']
                                 and identity(item) not in blocked_features), None)
        # Reserve existing slugs before assigning new ones so adding a similarly
        # named file cannot change a previously shared project link.
        reserved = {item['slug']: identity(item) for item in items if item.get('slug')}
        used_slugs = set()
        for item in items:
            key = identity(item)
            base = item.get('slug') or (item['id'] if item['type'] == 'youtube' else slugify(item['title']))
            slug, number = base, 2
            while slug in used_slugs or (slug in reserved and reserved[slug] != key):
                slug = f'{base}-{number}'
                number += 1
            item['slug'] = slug
            used_slugs.add(slug)
            item['featured'] = key == featured_key
        manifest[category] = items
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Update the portfolio from the assets folders.')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    try:
        manifest = generate(args.root)
    except ValueError as error:
        parser.exit(1, f'Portfolio update stopped: {error}\n')
    print(f'Updated portfolio: {sum(map(len, manifest.values()))} projects.')
