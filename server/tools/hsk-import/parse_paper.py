#!/usr/bin/env python3
"""
parse_paper.py – phân tích đề HSK thật (PDF của CTI) thành paper.json + ảnh cắt sẵn.

Cách dùng: python3 parse_paper.py <đề.pdf> <thư mục ra> [--level 2]
Kết quả: <ra>/paper.json, <ra>/img/q1.jpg … (ảnh từng câu), <ra>/img/p3A.jpg … (ảnh kho theo trang+chữ cái)

Nguyên tắc: bố cục đề CTI cố định theo cấp, nên dùng vị trí (toạ độ) để ghép ảnh với số câu / chữ cái,
và dùng chính văn bản trong PDF (đã lọc bỏ pinyin) để lấy câu hỏi, phương án, lời băng, đáp án.
Ảnh được cắt từ trang đã dựng (render) chứ không lấy ảnh nhúng, vì PDF hay cắt một ảnh thành nhiều dải.
Hỗ trợ trước: HSK 1, HSK 2 (bố cục 2.0). Cấp khác cần bổ sung bảng bố cục.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
import fitz  # pymupdf

CJK = re.compile(r'[\u3400-\u9fff]')
KEEP = re.compile(r'[\u3400-\u9fff\u3000-\u303f\uff00-\uffef0-9★√×()（）:：]')   # chữ Hán, dấu câu CJK, số, ngoặc


def hanzi_only(text: str) -> str:
    """Bỏ pinyin: PDF in pinyin kèm dấu câu ngay trên dòng chữ Hán ("yíxià，" rồi "一下 ，"),
    nên phải bỏ CẢ TOKEN có chữ Latin (kể cả dấu câu dính theo), giữ token chữ Hán, số, dấu câu, ngoặc."""
    toks = []
    for tok in text.replace('（', ' （ ').replace('）', ' ） ').split():
        if re.search(r'[A-Za-zÀ-ɏ]', tok):
            continue
        toks.append(''.join(ch for ch in tok if KEEP.match(ch)))
    out = ''.join(t for t in toks if t)
    return out.replace('（）', '（ ）').strip()


def options_of(s: str):
    """'A niúnǎi 牛奶 B píngguǒ 苹果 C xīguā 西瓜' -> ['牛奶','苹果','西瓜']"""
    parts = re.split(r'(?:^|\s)([A-F])(?=\s)', ' ' + s)
    opts = {}
    for i in range(1, len(parts) - 1, 2):
        opts[parts[i]] = hanzi_only(parts[i + 1])
    return [opts[k] for k in 'ABCDEF' if k in opts and opts[k]]


def lines_of(page):
    """Các dòng văn bản kèm bbox, theo thứ tự trên xuống."""
    res = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for l in b['lines']:
            t = ''.join(s['text'] for s in l['spans'])
            if t.strip():
                res.append((t, fitz.Rect(l['bbox'])))
    res.sort(key=lambda x: (round(x[1].y0), x[1].x0))
    return res


def picture_rects(page):
    """Hợp các dải ảnh chồng/kề nhau thành một hình; trả về danh sách Rect."""
    rects = []
    for img in page.get_images(full=True):
        for r in page.get_image_rects(img[0]):
            rects.append(fitz.Rect(r))
    merged = []
    for r in sorted(rects, key=lambda r: (r.x0, r.y0)):
        for m in merged:
            if abs(m.x0 - r.x0) < 6 and abs(m.x1 - r.x1) < 6 and (abs(m.y1 - r.y0) < 4 or abs(r.y1 - m.y0) < 4 or m.intersects(r)):
                m.include_rect(r)
                break
        else:
            merged.append(fitz.Rect(r))
    return merged


def crop(page, rect, path, scale=2.5):
    pad = 3
    clip = fitz.Rect(rect.x0 - pad, rect.y0 - pad, rect.x1 + pad, rect.y1 + pad) & page.rect
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip)
    pix.save(str(path))


def parse(pdf: Path, out: Path, level: int) -> dict:
    doc = fitz.open(pdf)
    (out / 'img').mkdir(parents=True, exist_ok=True)
    full = '\n'.join(p.get_text() for p in doc)
    code = (re.search(r'\b(H\d{5})\b', full) or [None, pdf.stem])[1]

    # ---------------- ảnh theo số câu và theo chữ cái (mọi trang trước phần lời băng)
    pics_by_num, pools = {}, {}          # pools[(page, letter)] = path
    for pno, page in enumerate(doc):
        text_lines = lines_of(page)
        if '听力材料' in page.get_text():
            break
        rects = picture_rects(page)
        labels_num = [(int(m.group(1)), r) for t, r in text_lines if (m := re.match(r'^\s*(\d{1,2})[．.]\s*$', t))]
        labels_letter = [(t.strip(), r) for t, r in text_lines if re.match(r'^\s*[A-F]\s*$', t)]
        for pr in rects:
            cy = (pr.y0 + pr.y1) / 2
            # kho hình: chữ cái cùng hàng, nằm bên trái ảnh, gần nhất
            cand = [(pr.x0 - lr.x1, L) for L, lr in labels_letter if lr.y0 - 40 <= cy <= lr.y1 + 40 and lr.x1 < pr.x0 + 5 and pr.x0 - lr.x1 < 140]
            if cand:
                L = min(cand)[1]
                path = out / 'img' / f'p{pno + 1}{L}.jpg'
                crop(page, pr, path); pools[(pno + 1, L)] = f'img/{path.name}'
                continue
            # ảnh theo số câu: nhãn số ở bên trái, hàng bao trùm ảnh
            cand = [(abs(((lr.y0 + lr.y1) / 2) - cy), n) for n, lr in labels_num if lr.x1 < pr.x0]
            if cand and min(cand)[0] < 60:
                n = min(cand)[1]
                path = out / 'img' / f'q{n}.jpg'
                crop(page, pr, path); pics_by_num[n] = f'img/{path.name}'

    # ---------------- đáp án
    ans = {}
    m = re.search(r'卷答案(.*)$', full, re.S)
    if m:
        for n, a in re.findall(r'(\d{1,2})[．.]\s*([A-F√×✓✗])', m.group(1)):
            ans[int(n)] = {'√': '✓', '×': '✗'}.get(a, a)   # PDF dùng √/×, giao diện dùng ✓/✗

    # ---------------- lời băng: từng câu nghe
    script = {}
    ms = re.search(r'听力材料(.*?)卷答案', full, re.S)
    if ms:
        cur = None
        for raw in ms.group(1).split('\n'):
            t = raw.strip()
            mm = re.match(r'^(\d{1,2})[．.]\s*(.*)$', t)
            if mm and int(mm.group(1)) <= 60:
                cur = int(mm.group(1)); script[cur] = [mm.group(2)] if mm.group(2) else []
            elif cur and t and not t.startswith(('现在开始', '第', '一共', '例如', '听力考试', '-', '大家好', 'HSK', '请大家')):
                script[cur].append(t)
            elif t.startswith(('现在开始', '第', '一共', '例如')):
                cur = None

    # ---------------- văn bản câu hỏi / phương án theo số câu (trang đề, lọc pinyin)
    body = re.split(r'听力材料', full)[0]
    # gộp các dòng thành khối theo số câu: "21． A ... B ... C ..." hoặc "36．..." hoặc "46．...★..."
    blocks = {}
    cur = None
    for raw in body.split('\n'):
        t = raw.strip()
        mm = re.match(r'^(\d{1,2})[．.](.*)$', t)
        if mm and int(mm.group(1)) <= 60 and not re.match(r'^\d{1,2}[．.]\s*$', t):
            cur = int(mm.group(1)); blocks[cur] = mm.group(2)
        elif mm and int(mm.group(1)) <= 60:
            cur = int(mm.group(1)); blocks[cur] = ''
        elif cur and t and not re.match(r'^(第|例如|H\d{5}|一、|二、|三、)', t):
            blocks[cur] += ' ' + t
        elif re.match(r'^(第|例如|一、|二、|三、)', t):
            cur = None

    # kho phương án chữ (điền từ / ghép câu): các dòng "A ... B ... " trước nhóm câu
    text_pools = {}   # số câu đầu nhóm -> [chuỗi]
    for pno, page in enumerate(doc):
        if '听力材料' in page.get_text():
            break
        pt = page.get_text()
        mm = re.search(r'第\s*(\d{1,2})[-–]\s*(\d{1,2})\s*题', pt)
        if not mm:
            continue
        first = int(mm.group(1))
        head = re.split(r'例如', pt.split('题', 1)[1], 1)[0]
        # dạng mỗi chữ cái một dòng (kho câu) hoặc tất cả trên một dòng "A wán 完 B jìn 进 …" (kho từ)
        letters = re.findall(r'(?:^|\n)\s*([A-F])\s*\n(.*?)(?=(?:\n\s*[A-F]\s*\n)|\Z)', head, re.S)
        vals = [hanzi_only(v) for L, v in letters]
        if not (len(vals) >= 3 and all(vals)):
            vals = options_of(head.replace('\n', ' '))
        if len(vals) >= 3 and all(vals):
            text_pools[first] = vals

    return {'code': code, 'level': level, 'pics': pics_by_num, 'pools': {f'{p}:{L}': v for (p, L), v in pools.items()},
            'answers': ans, 'script': script, 'blocks': blocks, 'text_pools': text_pools, 'options_of': None,
            '_opts': {n: options_of(b) for n, b in blocks.items()}}


def build_paper(raw: dict) -> dict:
    """Ghép thành cấu trúc paper của Zuimó theo bố cục HSK 2 (2.0). Trả về paper + danh sách cảnh báo."""
    lvl = raw['level']; A = raw['answers']; S = raw['script']; B = raw['blocks']; O = raw['_opts']; P = raw['pics']
    pools = raw['pools']; tpools = raw['text_pools']
    warn = []
    LAYOUT = {
        2: [('listening', 25, [('tf_pic', 1, 10), ('match_pic', 11, 20), ('dlg_ans', 21, 30), ('dlg_ans', 31, 35)]),
            ('reading', 22, [('match_pic', 36, 40), ('fill', 41, 45), ('rtf_stmt', 46, 50), ('match_text', 51, 60)])],
        1: [('listening', 15, [('tf_pic', 1, 5), ('pick_pic', 6, 10), ('match_pic', 11, 15), ('dlg_ans', 16, 20)]),
            ('reading', 17, [('tf_pic', 21, 25), ('match_pic', 26, 30), ('match_text', 31, 35), ('fill', 36, 40)])],
    }
    if lvl not in LAYOUT:
        raise SystemExit(f'Chưa có bố cục cho HSK {lvl}')
    plays = 2 if lvl <= 2 else 1
    # kho hình theo trang: gán cho nhóm câu theo thứ tự xuất hiện
    pool_pages = sorted({int(k.split(':')[0]) for k in pools})
    pic_pool_iter = iter(pool_pages)

    def pic_pool_for(first, last):
        page = next(pic_pool_iter, None)
        if page is None:
            warn.append(f'Thiếu kho hình cho câu {first}-{last}'); return []
        return [{'img': pools[f'{page}:{L}']} for L in 'ABCDEF' if f'{page}:{L}' in pools]

    sections = []
    num = 0
    for key, minutes, parts in LAYOUT[lvl]:
        sec = {'key': key, 'title': {'listening': ['听力', 'Nghe'], 'reading': ['阅读', 'Đọc']}[key], 'minutes': minutes, 'parts': []}
        for pi, (kind, a, b) in enumerate(parts):
            items = []
            pool = None
            if kind in ('match_pic', 'match_text', 'fill'):
                groups = [(g, min(g + 4, b)) for g in range(a, b + 1, 5)]   # mỗi kho A–F phục vụ 5 câu
            else:
                groups = [(a, b)]
            for ga, gb in groups:
                if kind == 'match_pic':
                    pool = pic_pool_for(ga, gb)
                elif kind in ('fill', 'match_text'):
                    pool = [x for x in tpools.get(ga, [])]
                    if not pool: warn.append(f'Thiếu kho chữ cho câu {ga}-{gb}')
                for n in range(ga, gb + 1):
                    num += 1
                    it = {'id': f'q{n}', 'num': num, 'answer': A.get(n)}
                    if it['answer'] is None: warn.append(f'Thiếu đáp án câu {n}')
                    lines = S.get(n, [])
                    if key == 'listening':
                        it['lines'] = [{'zh': l.split('：', 1)[-1] if l.startswith(('男：', '女：')) else l, 'who': l[:1] if l[:1] in '男女' else None} for l in lines if not l.startswith('问')]
                        q = [l for l in lines if l.startswith('问')]
                        if q: it['question'] = {'zh': q[0].split('：', 1)[-1]}
                        if not lines: warn.append(f'Thiếu lời băng câu {n}')
                    if kind == 'tf_pic':
                        it['kind'] = 'tf_pic'; it['pic'] = {'img': P.get(n)}
                        if key == 'reading': it['text'] = hanzi_only(B.get(n, ''))
                        if not P.get(n): warn.append(f'Thiếu ảnh câu {n}')
                    elif kind == 'pick_pic':
                        it['kind'] = 'pick_pic'; it['options'] = [{'img': P.get(n)}]; warn.append(f'Câu {n}: chọn hình A–C cần cắt tay')
                    elif kind == 'match_pic':
                        it['kind'] = 'match'; it['pool'] = pool
                        if key == 'reading': it['text'] = hanzi_only(B.get(n, ''))
                    elif kind == 'dlg_ans':
                        it['kind'] = 'dlg_ans'; it['options'] = O.get(n, [])
                        if len(it['options']) < 3: warn.append(f'Câu {n}: chưa đủ 3 phương án ({it["options"]})')
                    elif kind == 'fill':
                        it['kind'] = 'fill'; it['pool'] = pool; it['text'] = hanzi_only(B.get(n, ''))
                    elif kind == 'rtf_stmt':
                        it['kind'] = 'rtf_stmt'
                        t = hanzi_only(B.get(n, ''))
                        zh, _, st = t.partition('★')
                        it['zh'] = zh.strip(); it['statement'] = re.sub(r'（\s*）$', '', st).strip()
                    elif kind == 'match_text':
                        it['kind'] = 'match'; it['pool'] = pool; it['text'] = hanzi_only(B.get(n, ''))
                    items.append(it)
            sec['parts'].append({'key': kind, 'title': [f'第{"一二三四五"[pi]}部分', f'Phần {pi + 1}'], 'items': items,
                                 'instr': {'tf_pic': ['听录音，判断对错。', 'Nghe và xét hình đúng hay sai.'] if key == 'listening' else ['判断对错。', 'Xét câu đúng với hình không.'],
                                           'match_pic': ['选出对应的图片。', 'Chọn hình tương ứng (A–F).'], 'pick_pic': ['选出正确的图片。', 'Chọn hình đúng.'],
                                           'dlg_ans': ['选出正确答案。', 'Nghe và chọn đáp án.'], 'fill': ['选词填空。', 'Chọn từ điền vào chỗ trống.'],
                                           'rtf_stmt': ['判断对错。', 'Xét câu ★ đúng hay sai.'], 'match_text': ['选出相应的答语。', 'Chọn câu tương ứng (A–F).']}[kind]})
        sections.append(sec)
    paper = {'code': raw['code'], 'ver': '20', 'lvl': lvl, 'total': 200 if lvl <= 2 else 300, 'pass': 120 if lvl <= 2 else 180, 'plays': plays,
             'real': True, 'source': 'CTI', 'sections': sections}
    return paper, warn


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    pdf, out = Path(sys.argv[1]), Path(sys.argv[2])
    level = sys.argv[sys.argv.index('--level') + 1] if '--level' in sys.argv else 'auto'
    if level == 'auto':
        # trang bìa ghi "HSK（二级）": nhận cấp từ đó
        head = fitz.open(pdf)[0].get_text()
        m = re.search(r'HSK[（(]\s*([一二三四五六])\s*级', head)
        if not m:
            sys.exit('Không nhận ra cấp trong PDF; truyền --level <1-6>.')
        level = '一二三四五六'.index(m.group(1)) + 1
    level = int(level)
    raw = parse(pdf, out, level)
    paper, warn = build_paper(raw)
    (out / 'paper.json').write_text(json.dumps(paper, ensure_ascii=False, indent=1), encoding='utf-8')
    n = sum(len(p['items']) for s in paper['sections'] for p in s['parts'])
    print(f'{paper["code"]}: {n} câu, {len(raw["pics"])} ảnh câu, {len(raw["pools"])} ảnh kho, {len(raw["answers"])} đáp án, {len(raw["script"])} câu có lời băng')
    for w in warn: print('  !', w)
