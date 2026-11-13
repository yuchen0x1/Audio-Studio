from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import array, json, math, wave

root = Path(__file__).resolve().parents[3]
out = root / '.vitest-tmp' / 'e2e-audio'
out.mkdir(parents=True, exist_ok=True)
screens = root / 'docs' / 'screenshots'
screens.mkdir(exist_ok=True)
for name, freq in [('voice.wav', 440), ('music.wav', 880)]:
    samples = array.array('h', (int(12000 * math.sin(2 * math.pi * freq * i / 44100)) for i in range(44100)))
    with wave.open(str(out / name), 'wb') as f:
        f.setparams((1, 2, 44100, 0, 'NONE', 'not compressed'))
        f.writeframes(samples.tobytes())

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1240}, accept_downloads=True, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:5187/#/convert')
    page.wait_for_load_state('networkidle')
    with page.expect_file_chooser() as chooser:
        page.get_by_role('button', name='拖入音频文件或点击选择').click()
    chooser.value.set_files([str(out / 'voice.wav'), str(out / 'music.wav')])
    expect(page.locator('.file-row')).to_have_count(2)
    expect(page.get_by_text('引擎就绪', exact=True).first).to_be_visible(timeout=45000)
    page.get_by_role('button', name='开始全部', exact=True).click()
    expect(page.locator('.task-row .badge-success')).to_have_count(2, timeout=45000)
    with page.expect_download() as download:
        page.locator('.task-row').first.get_by_role('button', name='下载', exact=True).click()
    mp3 = out / download.value.suggested_filename
    download.value.save_as(str(mp3))
    assert mp3.stat().st_size > 1000

    page.goto('http://127.0.0.1:5187/#/batch')
    page.wait_for_load_state('networkidle')
    # Same app session: hash navigation does not reload imported files and jobs.
    expect(page.locator('.task-row')).to_have_count(2)
    page.get_by_role('button', name='音乐分享', exact=False).click()
    expect(page.get_by_label('比特率', exact=True)).to_have_value('256')
    page.get_by_role('button', name='清除已完成', exact=True).click()
    page.get_by_role('button', name='全部入队', exact=True).click()
    expect(page.locator('.task-row .badge-success')).to_have_count(2, timeout=45000)
    page.get_by_role('button', name='语音小文件', exact=False).click()
    expect(page.get_by_label('比特率', exact=True)).to_have_value('64')
    page.get_by_label('比特率', exact=True).select_option('96')
    expect(page.get_by_label('比特率', exact=True)).to_have_value('96')
    page.get_by_role('button', name='应用参数到全部', exact=True).click()
    page.get_by_label('搜索文件名').fill('VOICE')
    expect(page.locator('.task-row')).to_have_count(1)
    page.get_by_label('任务状态').select_option('failed')
    expect(page.get_by_text('没有匹配的任务', exact=True)).to_be_visible()
    page.get_by_label('搜索文件名').fill('')
    page.get_by_label('任务状态').select_option('all')
    page.get_by_role('button', name='清除已完成', exact=True).click()
    page.get_by_role('button', name='全部入队', exact=True).click()
    expect(page.locator('.task-row .badge-success')).to_have_count(2, timeout=45000)
    while page.locator('.toast').count():
        page.locator('.toast').first.click()
    with page.expect_download() as download:
        page.locator('.task-row').first.get_by_role('button', name='下载', exact=True).click()
    opus = out / download.value.suggested_filename
    download.value.save_as(str(opus))
    opus_data = opus.read_bytes()
    opus_head = opus_data.index(b'OpusHead')
    assert opus_data[:4] == b'OggS' and opus_data[opus_head + 9] == 1
    while page.locator('.toast').count():
        page.locator('.toast').first.click()
    page.locator('.page-scroll').evaluate('(e) => e.scrollTop = 0')
    page.screenshot(path=str(screens / 'batch-desktop.png'), full_page=True, animations='disabled')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('.page-scroll').evaluate('(e) => e.scrollTop = 0')
    page.screenshot(path=str(screens / 'batch-mobile.png'), full_page=True, animations='disabled')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert page.locator('.page-scroll').evaluate('(e) => e.scrollWidth <= e.clientWidth'), 'narrow content overflows'
    page.locator('.queue-filters').scroll_into_view_if_needed()
    assert page.locator('.task-row-name').first.bounding_box()['width'] > 150
    page.screenshot(path=str(screens / 'batch-mobile-queue.png'), full_page=True, animations='disabled')
    # Narrow navigation remains operable.
    page.get_by_role('button', name='打开菜单').click()
    expect(page.locator('.sidebar')).to_have_class('sidebar open')
    page.get_by_role('button', name='关闭菜单').click()
    page.get_by_role('button', name='切换语言').click()
    expect(page.get_by_label('Search filenames')).to_be_visible()
    page.get_by_role('button', name='Switch language').click()
    page.set_viewport_size({'width': 1440, 'height': 1240})
    page.get_by_role('button', name='切换主题').click()
    page.locator('.page-scroll').evaluate('(e) => e.scrollTop = 0')
    page.screenshot(path=str(screens / 'batch-light.png'), full_page=True, animations='disabled')

    page.get_by_role('button', name='无损存档', exact=False).click()
    page.get_by_role('button', name='清除已完成', exact=True).click()
    page.get_by_role('button', name='全部入队', exact=True).click()
    expect(page.locator('.task-row .badge-success')).to_have_count(2, timeout=45000)
    while page.locator('.toast').count():
        page.locator('.toast').first.click()
    with page.expect_download() as download:
        page.locator('.task-row').first.get_by_role('button', name='下载', exact=True).click()
    flac = out / download.value.suggested_filename
    download.value.save_as(str(flac))
    flac_data = flac.read_bytes()
    assert flac_data[:4] == b'fLaC'
    stream_info = int.from_bytes(flac_data[18:26], 'big')
    assert stream_info >> 44 == 44100
    assert ((stream_info >> 36) & 31) + 1 == 16
    assert stream_info & ((1 << 36)-1) == 44100

    page.goto('http://127.0.0.1:5187/#/merge')
    page.wait_for_load_state('networkidle')
    with page.expect_file_chooser() as chooser:
        page.get_by_role('button', name='添加文件', exact=True).click()
    chooser.value.set_files([str(out / 'voice.wav'), str(out / 'music.wav')])
    expect(page.locator('.file-row')).to_have_count(2)
    page.get_by_label('片段间隔 (ms)').fill('500')
    page.get_by_label('目标格式', exact=False).select_option('wav')
    page.locator('.file-row').nth(1).get_by_label('淡出', exact=True).fill('300')
    page.get_by_role('button', name='开始合并', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible(timeout=45000)
    with page.expect_download() as download:
        page.get_by_role('dialog').get_by_role('button', name='下载', exact=False).click()
    merged = out / 'merged.wav'
    download.value.save_as(str(merged))
    with wave.open(str(merged), 'rb') as f:
        rate, channels, width = f.getframerate(), f.getnchannels(), f.getsampwidth()
        assert width == 2
        pcm = array.array('h', f.readframes(f.getnframes()))
    def rms(start, end):
        part = pcm[int(start*rate)*channels:int(end*rate)*channels]
        return math.sqrt(sum(x*x for x in part) / len(part))
    assert rms(1.1, 1.4) < 2, 'gap is not silent'
    assert rms(1.6, 1.8) > 2000, 'second clip starts faded/silent'
    assert rms(2.45, 2.49) < rms(1.6, 1.8) * .3, 'end of second clip does not fade'
    assert 2.49 < len(pcm)/channels/rate < 2.51
    page.goto('http://127.0.0.1:5187/#/history')
    expect(page.locator('tbody tr')).to_have_count(9)
    page.reload()
    page.wait_for_load_state('networkidle')
    expect(page.locator('tbody tr')).to_have_count(9)
    expect(page.get_by_text('merged.wav', exact=True)).to_be_visible()
    assert not errors, errors
    result = {'status':'PASS','checks':['multi-file Start all', 'real wasm MP3/download', 'music sharing preset', 'real Opus mono/download', 'real FLAC sample-rate/bit-depth preservation', 'parameter editing', 'queue search/status', '390px no overflow and readable filenames', 'narrow navigation and language switch', 'light/dark screenshots', 'real WAV merge gap/order/fade', 'IndexedDB history survives reload (9 records)'], 'mp3_bytes':mp3.stat().st_size, 'opus_bytes':opus.stat().st_size, 'flac_bytes':flac.stat().st_size, 'merge_rate':rate, 'gap_rms':rms(1.1,1.4), 'second_clip_rms':rms(1.6,1.8), 'tail_rms':rms(2.45,2.49), 'page_errors':errors}
    (out / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=True))
    browser.close()
