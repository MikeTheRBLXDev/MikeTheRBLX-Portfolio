"""Regression coverage for the public content pipeline; never contacts YouTube."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('manifest', Path(__file__).with_name('generate-manifest.py'))
generator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generator)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'assets/UI').mkdir(parents=True)
        (self.root / 'assets/Scripting').mkdir(parents=True)

    def write(self, path, content='placeholder'):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')
        return target

    def write_json(self, path, content):
        return self.write(path, json.dumps(content))

    def generate(self, lookup=lambda video_id: 'Video ' + video_id):
        return generator.generate(self.root, lookup=lookup)

    def ui_details(self, filename, **fields):
        return {f'ui:media:assets/UI/{filename}': fields}

    def test_missing_metadata_and_nested_discovery(self):
        self.write('assets/UI/nested/ShopMenu.jpg')
        self.write('assets/UI/not-an-image.md')
        self.write('assets/NormalAssets/profile.png')
        result = self.generate()['ui']
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['title'], 'Shop Menu')
        self.assertEqual(result[0]['path'], 'assets/UI/nested/ShopMenu.jpg')
        self.assertTrue(result[0]['featured'])
        self.assertFalse(result[0]['hidden'])

    def test_preserves_saved_title_description_and_shared_slug(self):
        self.write('assets/UI/MyHud.png')
        self.write_json('portfolio.json', {'ui': [{
            'type': 'media', 'path': 'portfolio/ui/MyHud.png', 'title': 'Saved title',
            'description': 'Saved description', 'slug': 'existing-project', 'featured': True,
        }]})
        project = self.generate()['ui'][0]
        self.assertEqual(project['title'], 'Saved title')
        self.assertEqual(project['description'], 'Saved description')
        self.assertEqual(project['slug'], 'existing-project')

    def test_new_collision_cannot_steal_existing_slug(self):
        self.write('assets/UI/Zexisting.png')
        self.write_json('portfolio.json', {'ui': [{
            'type': 'media', 'path': 'assets/UI/Zexisting.png',
            'title': 'Shop', 'slug': 'shop', 'featured': True,
        }]})
        self.write('assets/UI/Anew.png')
        self.write_json('assets/UI/Anew.png.json', {'title': 'Shop'})
        projects = {project['path']: project for project in self.generate()['ui']}
        self.assertEqual(projects['assets/UI/Zexisting.png']['slug'], 'shop')
        self.assertEqual(projects['assets/UI/Anew.png']['slug'], 'shop-2')
        self.assertEqual(self.generate()['ui'], list(projects.values()))

    def test_youtube_forms_custom_titles_duplicate_and_last_star(self):
        self.write('assets/Scripting/youtube.txt', '\n'.join([
            '# comment', '* Custom title | https://youtu.be/Wy2rbplQK28',
            'https://www.youtube.com/watch?v=Wy2rbplQK28',
            '* https://www.youtube.com/shorts/ibiyGn6kSrM?feature=share',
            'https://www.youtube.com/live/xjlcl83Fquk',
            'https://www.youtube.com/embed/69UuARjWwTU',
            'https://not-youtube.example/watch?v=QFS-k1GwGdM',
        ]))
        projects = self.generate()['scripting']
        self.assertEqual(len(projects), 4)
        self.assertEqual(projects[0]['title'], 'Custom title')
        self.assertEqual(projects[0]['title_source'], 'custom')
        self.assertEqual([project['id'] for project in projects if project['featured']], ['ibiyGn6kSrM'])
        self.assertTrue(all(project['url'].startswith('https://www.youtube.com/watch?v=') for project in projects))

    def test_saved_youtube_title_does_not_require_network(self):
        self.write('assets/UI/youtube.txt', 'https://youtu.be/Wy2rbplQK28')
        self.write_json('portfolio.json', {'ui': [{
            'type': 'youtube', 'id': 'Wy2rbplQK28', 'title': 'Saved video', 'slug': 'saved-video',
        }]})
        def no_lookup(_):
            self.fail('Saved title must not trigger a title lookup')
        project = self.generate(no_lookup)['ui'][0]
        self.assertEqual(project['title'], 'Saved video')
        self.assertEqual(project['slug'], 'saved-video')

    def test_admin_title_skips_network_and_beats_pipe_title(self):
        self.write('assets/UI/youtube.txt', 'https://youtu.be/Wy2rbplQK28\nPipe title | https://youtu.be/ibiyGn6kSrM')
        self.write_json('project-details.json', {
            'ui:youtube:Wy2rbplQK28': {'title': 'Dashboard title'},
            'ui:youtube:ibiyGn6kSrM': {'title': 'Another dashboard title'},
        })
        def no_lookup(_):
            self.fail('Explicit metadata title must not trigger a title lookup')
        self.assertEqual([project['title'] for project in self.generate(no_lookup)['ui']],
                         ['Dashboard title', 'Another dashboard title'])

    def test_unavailable_youtube_uses_safe_fallback_and_retries(self):
        self.write('assets/UI/youtube.txt', 'https://youtu.be/Wy2rbplQK28')
        def unavailable(_):
            raise OSError('offline')
        project = self.generate(unavailable)['ui'][0]
        self.assertEqual(project['title'], 'Roblox Video Demo')
        self.assertEqual(project['title_source'], 'fallback')
        self.assertEqual(self.generate()['ui'][0]['title'], 'Video Wy2rbplQK28')

    def test_image_sidecar_and_admin_override(self):
        self.write('assets/UI/HUD.png')
        self.write_json('assets/UI/HUD.png.json', {
            'title': 'Sidecar title', 'description': 'Sidecar description', 'featured': True, 'order': 10,
        })
        self.write_json('project-details.json', self.ui_details('HUD.png', title='Dashboard title', description='Description from dashboard', order=0))
        project = self.generate()['ui'][0]
        self.assertEqual(project['title'], 'Dashboard title')
        self.assertEqual(project['description'], 'Description from dashboard')
        self.assertEqual(project['order'], 0)
        self.assertTrue(project['featured'])

    def test_admin_description_hidden_and_order_preserved_in_manifest(self):
        for filename in ('A.png', 'B.png', 'C.png'):
            self.write(f'assets/UI/{filename}')
        self.write_json('project-details.json', {
            **self.ui_details('B.png', order=0, description='A description', featured=True, hidden=True),
            **self.ui_details('C.png', order=1),
        })
        projects = self.generate()['ui']
        self.assertEqual([project['path'] for project in projects], ['assets/UI/B.png', 'assets/UI/C.png', 'assets/UI/A.png'])
        self.assertEqual(projects[0]['description'], 'A description')
        self.assertTrue(projects[0]['hidden'])
        self.assertFalse(projects[0]['featured'])
        self.assertTrue(projects[1]['featured'])

    def test_dashboard_feature_beats_star_and_false_suppresses_star(self):
        self.write('assets/UI/youtube.txt', '* https://youtu.be/Wy2rbplQK28\nhttps://youtu.be/ibiyGn6kSrM')
        self.write_json('project-details.json', {
            'ui:youtube:Wy2rbplQK28': {'featured': False},
            'ui:youtube:ibiyGn6kSrM': {'featured': True},
        })
        self.assertEqual([project['id'] for project in self.generate()['ui'] if project['featured']], ['ibiyGn6kSrM'])
        self.write_json('project-details.json', {'ui:youtube:Wy2rbplQK28': {'featured': False}})
        self.assertEqual([project['id'] for project in self.generate()['ui'] if project['featured']], ['ibiyGn6kSrM'])

    def test_dashboard_feature_beats_other_sidecar_and_star(self):
        self.write('assets/UI/A.png')
        self.write('assets/UI/B.png')
        self.write_json('assets/UI/A.png.json', {'featured': True})
        self.write('assets/UI/youtube.txt', '* https://youtu.be/Wy2rbplQK28')
        self.write_json('project-details.json', self.ui_details('B.png', featured=True))
        projects = self.generate()['ui']
        self.assertEqual([project['path'] for project in projects if project['featured']], ['assets/UI/B.png'])

    def test_sidecar_feature_beats_star_and_false_prevents_fallback(self):
        self.write('assets/UI/A.png')
        self.write_json('assets/UI/A.png.json', {'featured': True})
        self.write('assets/UI/youtube.txt', '* https://youtu.be/Wy2rbplQK28')
        self.assertTrue(self.generate()['ui'][0]['featured'])
        self.write('assets/UI/youtube.txt', '')
        self.write_json('assets/UI/A.png.json', {'featured': False})
        self.assertFalse(self.generate()['ui'][0]['featured'])

    def test_all_hidden_items_have_no_feature(self):
        self.write('assets/UI/HUD.png')
        self.write_json('project-details.json', self.ui_details('HUD.png', hidden=True, featured=True))
        self.assertFalse(self.generate()['ui'][0]['featured'])

    def test_removing_asset_removes_item_and_old_details_do_not_resurrect_it(self):
        image = self.write('assets/UI/HUD.png')
        self.write_json('project-details.json', self.ui_details('HUD.png', title='Custom'))
        self.generate()
        image.unlink()
        self.assertEqual(self.generate()['ui'], [])

    def test_removing_video_link_removes_item(self):
        links = self.write('assets/UI/youtube.txt', 'https://youtu.be/Wy2rbplQK28')
        self.generate()
        links.write_text('', encoding='utf-8')
        self.assertEqual(self.generate()['ui'], [])

    def test_corrupt_metadata_stops_without_overwriting_previous_manifest(self):
        self.write('assets/UI/HUD.png')
        saved = self.write_json('portfolio.json', {'ui': []}).read_text(encoding='utf-8')
        for invalid in ('{broken', '[]', '{"bad-key": {}}'):
            with self.subTest(invalid=invalid):
                self.write('project-details.json', invalid)
                with self.assertRaises(ValueError):
                    self.generate()
                self.assertEqual((self.root / 'portfolio.json').read_text(encoding='utf-8'), saved)

    def test_invalid_detail_types_and_fields_are_rejected(self):
        self.write('assets/UI/HUD.png')
        for details in ({'title': ''}, {'title': 1}, {'description': []}, {'hidden': 1},
                        {'featured': 'true'}, {'order': True}, {'order': -1},
                        {'order': float('nan')}, {'order': 1_000_001}, {'password': 'secret'}):
            with self.subTest(details=details):
                self.write_json('project-details.json', self.ui_details('HUD.png', **details))
                with self.assertRaises(ValueError):
                    self.generate()

    def test_corrupt_sidecar_stops_without_rewriting_manifest(self):
        self.write('assets/UI/HUD.png')
        original = self.write_json('portfolio.json', {'ui': []}).read_text(encoding='utf-8')
        self.write('assets/UI/HUD.png.json', '{broken')
        with self.assertRaises(ValueError):
            self.generate()
        self.assertEqual((self.root / 'portfolio.json').read_text(encoding='utf-8'), original)

    def test_metadata_path_traversal_and_wrong_category_are_rejected(self):
        for key in ('ui:media:assets/UI/../Scripting/HUD.png', 'ui:media:assets/Scripting/HUD.png',
                    'ui:media:assets/UI/HUD.txt', 'ui:youtube:not-an-id', 'unknown:youtube:Wy2rbplQK28'):
            with self.subTest(key=key):
                self.write_json('project-details.json', {key: {'title': 'Example'}})
                with self.assertRaises(ValueError):
                    self.generate()

    def test_corrupt_previous_manifest_is_rebuilt_from_assets(self):
        self.write('assets/UI/HUD.png')
        for previous in ('{broken', '[]', '{"ui": "invalid"}'):
            with self.subTest(previous=previous):
                self.write('portfolio.json', previous)
                self.assertEqual(len(self.generate()['ui']), 1)


if __name__ == '__main__':
    unittest.main()
