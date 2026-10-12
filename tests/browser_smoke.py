"""Local integration QA. Uses fictional data and never contacts the live website.

Requires Python Playwright, Pillow, and Chromium (CHROMIUM_PATH may select it).
This is mobile Chromium QA, not a claim of a physical iPhone test.
"""
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import threading
import time
from datetime import date, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT.parent / 'artifacts' / 'jizhi-v11'
ARTIFACTS.mkdir(parents=True, exist_ok=True)
DAY = date.today().isoformat()
NEXT_DAY = (date.today() + timedelta(days=1)).isoformat()
OLD_DAY = (date.today() - timedelta(days=1)).isoformat()
KEY = 'jizhi-meals-v1'
CACHE = 'jizhi-meals-shell-v1.1-timeline-2'
fixture = {
    'schemaVersion': 1,
    'inventory': [
        {'id': 'beef', 'name': '牛肉丸', 'quantity': 3, 'unit': '份', 'perMeal': .75, 'note': '', 'expires': ''},
        {'id': 'shrimp', 'name': '虾丸', 'quantity': 4, 'unit': '份', 'perMeal': 1.25, 'note': '', 'expires': ''},
    ],
    'meals': [
        {'id': 'old-eaten', 'date': OLD_DAY, 'slot': 'dinner', 'name': '旧版晚餐', 'type': '自制便当', 'note': '保留旧记录', 'protein': '', 'resource': {'ingredientId': 'beef', 'name': '牛肉丸', 'unit': '份', 'amount': 2}, 'completed': True, 'completedAt': OLD_DAY + 'T10:00:00.000Z'},
        {'id': 'old-plan', 'date': DAY, 'slot': 'lunch', 'name': '旧版便当', 'type': '自制便当', 'note': '', 'protein': '', 'resource': {'ingredientId': 'shrimp', 'name': '虾丸', 'unit': '份', 'amount': 1}, 'completed': False, 'completedAt': None},
        {'id': 'future', 'date': NEXT_DAY, 'slot': 'dinner', 'name': '明天也要好好吃饭', 'type': '公司食堂', 'note': '', 'protein': '', 'resource': None, 'completed': False, 'completedAt': None},
    ],
    'updatedAt': OLD_DAY + 'T12:00:00.000Z',
}
RAW = json.dumps(fixture, ensure_ascii=False)
results = []

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(served_root[0]), **kwargs)
    def log_message(self, *_):
        pass

served_root = [ROOT.parent]
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{server.server_port}/{ROOT.name}/'

def state(page):
    return page.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)
def stock(page):
    return {row['id']: row['quantity'] for row in state(page)['inventory']}
def record(stage, name):
    results.append({'stage': stage, 'name': name, 'result': 'passed'})
    print(f'PASS {stage}: {name}', flush=True)
def save_form(page, form):
    page.locator(form + ' button[type="submit"]').click()
    page.wait_for_function('!document.querySelector("#sheet").open')
def jump(page, day):
    page.locator('[data-action="jump"]').click()
    page.fill('#jump-form input[name="date"]', day)
    save_form(page, '#jump-form')
def assert_width(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal page overflow'
    assert page.evaluate('!document.querySelector("#sheet").open || document.querySelector("#sheet").scrollWidth <= document.querySelector("#sheet").clientWidth'), 'Horizontal dialog overflow'
def detail(page, day=DAY):
    if page.locator('#date-timeline').count():
        page.locator(f'[data-timeline-date="{day}"]').click()
        page.wait_for_selector('.date-strip')

def timeline_center(page):
    return page.evaluate("""() => {
      const box = document.querySelector('#date-timeline').getBoundingClientRect();
      return [...document.querySelectorAll('[data-timeline-date]')].reduce((best, row) => {
        const rect = row.getBoundingClientRect(), distance = Math.abs((rect.top + rect.bottom - box.top - box.bottom) / 2);
        return !best || distance < best.distance ? {date:row.dataset.timelineDate,distance} : best;
      }, null).date;
    }""")

def new_context(browser, device):
    context = browser.new_context(**device, service_workers='allow', accept_downloads=True)
    context.add_init_script('if (localStorage.getItem(' + json.dumps(KEY) + ') === null) localStorage.setItem(' + json.dumps(KEY) + ',' + json.dumps(RAW) + ');')
    return context

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        context = new_context(browser, p.devices['iPhone 13'])
        page = context.new_page()
        errors, failed_http = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed_http.append(f'{response.status} {response.url}') if response.status >= 400 else None)
        page.goto(URL, wait_until='networkidle')
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        assert page.evaluate('key => localStorage.getItem(key)', KEY) == RAW
        assert stock(page) == {'beef': 3, 'shrimp': 4}
        record(1, 'V1 read-only migration preserves raw JSON and already consumed stock')
        page.wait_for_selector('#date-timeline')
        assert '旧版便当' in page.locator(f'[data-timeline-date="{DAY}"]').inner_text()
        for width, height in [(390, 844), (375, 667), (320, 568)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_function("document.querySelector('#date-timeline').getBoundingClientRect().bottom <= document.querySelector('.bottom-nav').getBoundingClientRect().top - 8")
            assert_width(page)
            geometry = page.evaluate("""() => {
              const box = document.querySelector('#date-timeline').getBoundingClientRect();
              return {height:box.height, visible:[...document.querySelectorAll('[data-timeline-date]')].filter(r=>{const b=r.getBoundingClientRect();return b.bottom>box.top&&b.top<box.bottom}).length};
            }""")
            assert 4 <= geometry['visible'] <= 9, geometry
        page.set_viewport_size({'width': 390, 'height': 844})
        page.locator('[data-action="timeline-today"]').click()
        page.screenshot(path=str(ARTIFACTS / 'timeline-mobile.png'), full_page=True)
        record('timeline', 'Default daily previews show about a week, no data writes or nav overlap at 320/375/390px')
        last = page.locator('[data-timeline-date]').last.get_attribute('data-timeline-date')
        page.locator('#date-timeline').evaluate('el=>el.scrollTop=el.scrollHeight-el.clientHeight-1')
        page.wait_for_function("last=>document.querySelector('[data-timeline-date]:last-child').dataset.timelineDate>last", arg=last)
        anchor = timeline_center(page)
        page.locator(f'[data-timeline-date="{anchor}"]').click()
        page.wait_for_selector('[data-action="timeline"]')
        page.locator('[data-action="timeline"]').click()
        page.wait_for_selector('#date-timeline')
        page.wait_for_function("date=>{const box=document.querySelector('#date-timeline').getBoundingClientRect();const row=document.querySelector('[data-timeline-date=\"'+date+'\"]').getBoundingClientRect();return Math.abs((row.top+row.bottom-box.top-box.bottom)/2)<3}", arg=anchor)
        assert timeline_center(page) == anchor
        record('timeline', 'Vertical scroll loads future dates and returning from a tapped day preserves the centered date')
        jump(page, '2024-02-29')
        page.wait_for_selector('[data-timeline-date="2024-02-29"]')
        assert timeline_center(page) == '2024-02-29'
        assert '2024年' in page.locator('#timeline-period').inner_text()
        page.locator('[data-action="timeline-today"]').click()
        assert page.evaluate('key=>localStorage.getItem(key)', KEY) == RAW
        record('timeline', 'Jump to leap day and return to today; navigation keeps original V1 JSON unchanged')
        detail(page)
        page.locator('[data-detail="old-plan"]').first.click()
        page.locator('#detail-edit').click()
        page.fill('#meal-form input[name="name"]', '牛肉丸便当 🍓')
        page.locator('#add-resource').click()
        rows = page.locator('.resource-row')
        assert rows.count() == 2
        assert rows.nth(1).locator('select').input_value() == 'beef'
        assert rows.nth(1).locator('input').input_value() == '0.75'
        assert rows.nth(0).locator('select option[value="beef"]').evaluate('option => option.disabled'), page.locator('#resource-list').inner_html()
        rows.nth(0).locator('input').fill('2')
        rows.nth(1).locator('input').fill('1')
        assert_width(page)
        save_form(page, '#meal-form')
        assert stock(page) == {'beef': 3, 'shrimp': 4}
        assert page.evaluate('localStorage.getItem("jizhi-meals-v1-migration-backup")') == RAW
        assert len(next(m for m in state(page)['meals'] if m['id'] == 'old-plan')['resources']) == 2
        record(1, 'Multi-ingredient defaults, duplicate prevention, independent quantities and original backup')
        page.locator('[data-complete="old-plan"]').click()
        assert stock(page) == {'beef': 2, 'shrimp': 2}
        page.locator('[data-detail="old-plan"]').first.click()
        page.locator('#detail-edit').click()
        page.locator('.resource-row').nth(1).locator('input').fill('1.5')
        page.locator('#meal-form button[type="submit"]').click()
        page.locator('#confirm-yes').click()
        page.wait_for_function('!document.querySelector("#sheet").open')
        assert stock(page) == {'beef': 1.5, 'shrimp': 2}
        page.locator('[data-undo="old-plan"]').click()
        page.locator('#confirm-yes').click()
        assert stock(page) == {'beef': 3, 'shrimp': 4}
        page.locator('[data-complete="old-plan"]').click()
        page.locator('[data-detail="old-plan"]').first.click()
        page.locator('#detail-delete').click()
        page.locator('#confirm-yes').click()
        assert stock(page) == {'beef': 3, 'shrimp': 4}
        assert {'old-eaten', 'future'} <= {m['id'] for m in state(page)['meals']}
        record(1, 'Completed edit uses stock delta; undo and completed deletion return every ingredient')

        for name, at in [('下午茶 🍓 草莓牛奶', '15:30'), ('夜宵 ♡ 小蛋糕', '22:10')]:
            page.locator('[data-action="add-snack"]').click()
            page.fill('#meal-form input[name="name"]', name)
            page.fill('#meal-form input[name="time"]', at)
            page.locator('#add-resource').click()
            save_form(page, '#meal-form')
        assert page.locator('.snack-card').count() == 2
        assert stock(page) == {'beef': 3, 'shrimp': 4}
        record(2, 'Multiple snack cards with independent optional times and inventory links')
        page.locator('[data-action="edit-diary"]').first.click()
        page.fill('#diary-form input[name="mood"]', '开心 😊')
        page.fill('#diary-form textarea[name="text"]', '私人日记：今天遇见了一只小猫。\n这是只留在手账里的故事。')
        page.fill('#diary-form textarea[name="joy"]', '私人的小确幸：一杯草莓牛奶')
        save_form(page, '#diary-form')
        diaries = state(page)['diaries']
        jump(page, NEXT_DAY)
        assert page.locator('.diary-text').count() == 0
        jump(page, DAY)
        assert '小猫' in page.locator('.diary-text').inner_text()
        first_snack = next(m for m in state(page)['meals'] if m['slot'] == 'snack')
        page.locator(f'[data-complete="{first_snack["id"]}"]').click()
        assert state(page)['diaries'] == diaries
        record(2, 'Diary follows its own date and survives snack/inventory changes')
        page.locator('[data-page="settings"]').click()
        page.wait_for_function('document.querySelector("#offline-status").textContent.includes("离线资源已缓存")')
        with page.expect_download() as download_info:
            page.locator('[data-action="export"]').click()
        backup_path = ARTIFACTS / 'example-backup.json'
        download_info.value.save_as(str(backup_path))
        backup = json.loads(backup_path.read_text())
        page.locator('#import-file').set_input_files(str(backup_path))
        page.locator('#restore-confirm').click()
        assert state(page)['meals'] == backup['meals']
        assert state(page)['diaries'] == backup['diaries']
        assert state(page)['inventory'] == backup['inventory']
        record(2, 'V1.1 JSON export/import round trip preserves meals, snacks, diaries and stock')

        page.locator('[data-page="summary"]').click()
        assert page.locator('h1').inner_text() == '我的生活汇总'
        page.locator('[data-summary-range="month"]').click()
        assert page.locator('[data-summary-range="month"]').get_attribute('aria-pressed') == 'true'
        assert '小猫' in page.locator('.summary-entry-preview').inner_text()
        page.screenshot(path=str(ARTIFACTS / 'summary-mobile.png'), full_page=True)
        record(3, 'Week/month summary and recent diary are connected to saved data')
        page.locator('[data-page="calendar"]').click()
        detail(page)
        page.locator('[data-action="share-day"]').click()
        for private in ['mood', 'diary', 'joy']:
            assert not page.locator(f'#share-form input[name="{private}"]').is_checked()
        content = page.evaluate('''async ({key, date}) => (await import('./share-card.js')).prepareShareCardContent(JSON.parse(localStorage.getItem(key)),date)''', {'key': KEY, 'date': DAY})
        assert not content['mood'] and not content['diary'] and not content['joy']
        assert len(next(s for s in content['sections'] if s['slot'] == 'snack')['meals']) == 2
        page.locator('#share-form button[type="submit"]').click()
        page.wait_for_selector('#download-card')
        with page.expect_download() as card_info:
            page.locator('#download-card').click()
        png_path = ARTIFACTS / 'share-card.png'
        card_info.value.save_as(str(png_path))
        with Image.open(png_path) as image:
            assert image.format == 'PNG' and image.width == 900 and image.height >= 1200
            dimensions = list(image.size)
        record(3, 'Private fields off by default; real local PNG file downloaded with all snacks')
        page.evaluate('''() => { Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>files.length===1&&files[0] instanceof File}); Object.defineProperty(navigator,'share',{configurable:true,value:async ({files})=>{window.__shared={name:files[0].name,type:files[0].type,size:files[0].size};}}); }''')
        page.locator('#native-share-card').click()
        page.wait_for_function('window.__shared !== undefined')
        shared = page.evaluate('window.__shared')
        assert shared['type'] == 'image/png' and shared['size'] > 0
        page.evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('cancel','AbortError')}})")
        page.locator('#native-share-card').click()
        page.wait_for_function('document.querySelector("#share-result").textContent.includes("分享已取消")')
        page.evaluate("Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false})")
        page.locator('#native-share-card').click()
        page.wait_for_function('document.querySelector("#share-result").textContent.includes("暂不支持")')
        record(3, 'File share API receives PNG; cancel and unsupported fallback handled (mocked system menu)')
        page.locator('.close-button[data-close]').click()
        page.screenshot(path=str(ARTIFACTS / 'calendar-mobile.png'), full_page=True)
        for width in [320, 390]:
            page.set_viewport_size({'width': width, 'height': 844})
            for nav in ['calendar', 'inventory', 'summary', 'settings']:
                page.locator(f'[data-page="{nav}"]').click()
                assert_width(page)
            page.locator('[data-page="calendar"]').click()
            detail(page)
            page.locator('[data-action="add-snack"]').click()
            page.locator('#add-resource').click()
            page.locator('#add-resource').click()
            assert_width(page)
            page.locator('.close-button[data-close]').click()
        record(3, '320px/390px navigation, pages and multi-ingredient dialog have no horizontal overflow')
        page2 = context.new_page()
        page2.goto(URL, wait_until='networkidle')
        page.locator('[data-action="add-snack"]').click()
        page.fill('#meal-form input[name="name"]', '库存不足确认纸条')
        page.locator('#add-resource').click()
        page.locator('.resource-row input').fill('100')
        page.locator('#meal-form button[type="submit"]').click()
        page.wait_for_selector('#confirm-yes')
        updated = state(page2)
        updated['meals'][0]['name'] = '另一窗口刚更新的餐食'
        newer_raw = json.dumps(updated, ensure_ascii=False)
        page2.evaluate('({key,raw}) => localStorage.setItem(key,raw)', {'key': KEY, 'raw': newer_raw})
        page.wait_for_function('!document.querySelector("#sheet").open && document.querySelector("#sheet-content").childElementCount === 0')
        assert page.evaluate('key=>localStorage.getItem(key)', KEY) == newer_raw
        assert not any(m['name'] == '库存不足确认纸条' for m in state(page)['meals'])
        page2.close()
        record('regression', 'External storage update cancels confirmation without reopening stale editor')
        context.set_offline(True)
        page.reload(wait_until='networkidle')
        page.locator('[data-page="settings"]').click()
        page.wait_for_function('document.querySelector("#offline-status").textContent.includes("离线资源已缓存")')
        cache_count = page.evaluate('async name => (await (await caches.open(name)).keys()).length', CACHE)
        assert cache_count == 34
        page.locator('[data-page="calendar"]').click()
        detail(page)
        page.locator('[data-action="share-day"]').click()
        page.locator('#share-form button[type="submit"]').click()
        page.wait_for_selector('#download-card')
        record('regression', 'All 34 assets cached; offline reload and offline PNG generation succeed')
        assert not errors, errors
        assert not failed_http, failed_http
        context.close()

        # Reproduce a V1 -> V1.1 service worker update at the same origin.
        with tempfile.TemporaryDirectory(prefix='jizhi-upgrade-') as temp:
            temp = Path(temp)
            old_root, new_root = temp / 'old', temp / 'new'
            old_app, new_app = old_root / ROOT.name, new_root / ROOT.name
            old_app.mkdir(parents=True)
            archive = subprocess.check_output(['git', '-C', str(ROOT), 'archive', 'v1.0-stable-20261012'])
            with tarfile.open(fileobj=BytesIO(archive)) as source:
                source.extractall(old_app, filter='data')
            shutil.copytree(ROOT, new_app, ignore=shutil.ignore_patterns('.git', 'tests', '__pycache__'))
            served_root[0] = old_root
            upgrade = new_context(browser, p.devices['iPhone 13'])
            old_page = upgrade.new_page()
            old_page.goto(URL, wait_until='networkidle')
            old_page.wait_for_function('navigator.serviceWorker.controller !== null')
            assert old_page.locator('[data-page="summary"]').count() == 0
            served_root[0] = new_root
            old_page.evaluate('async () => (await navigator.serviceWorker.getRegistration()).update()')
            old_page.wait_for_function('(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)()')
            old_page.reload(wait_until='networkidle')
            assert old_page.locator('[data-page="summary"]').count() == 0
            assert old_page.evaluate('key => localStorage.getItem(key)', KEY) == RAW
            old_page.close()
            time.sleep(.3)
            new_page = upgrade.new_page()
            new_page.goto(URL, wait_until='networkidle')
            new_page.wait_for_selector('[data-page="summary"]')
            assert new_page.evaluate('key => localStorage.getItem(key)', KEY) == RAW
            upgrade.set_offline(True)
            new_page.reload(wait_until='networkidle')
            new_page.wait_for_selector('[data-page="summary"]')
            assert stock(new_page) == {'beef': 3, 'shrimp': 4}
            record('regression', 'V1 worker stays consistent until tabs close; V1.1 activates with unchanged V1 data and works offline')
            upgrade.close()
        browser.close()
        report = {'engine': 'Chromium', 'device_emulation': 'iPhone 13, plus 320px viewport', 'physical_iphone_tested': False, 'native_share_menu': 'API mocked; device check still required', 'png_dimensions': dimensions, 'cached_assets': cache_count, 'page_errors': errors, 'failed_http_resources': failed_http, 'tests': results}
        (ARTIFACTS / 'browser-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'passed': len(results), 'png_dimensions': dimensions, 'cached_assets': cache_count}, ensure_ascii=False), flush=True)
finally:
    server.shutdown()
