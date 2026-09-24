import { go } from '../app/router.js';
import { bookId, bookOf, bookPct, booksOfVer, coreCount } from '../content/books.js';
import { BOOKS, meaning, once, strokeCount, verName } from '../content/data.js';
import { DIALOGUE, GRAMMAR, RADICALS, TABS, TONES, UNITS, VOCAB, WCHARS } from '../content/sample.js';
import { $, esc, view } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { S, saveP } from '../core/state.js';
import { L, dayKey, num, tr } from '../core/util.js';
import { py } from '../features/pinyin.js';
import { speak } from '../features/speech.js';
import { gridSvg, mountHero, mountWriter, wStatus } from '../features/writer.js';
import { dueCount, liveStreak, unitPct } from '../features/xp.js';
import { check, cur } from '../views/practice.js';

/* ---------- Views ---------- */
/* Hệ thống cấp độ – công thức phải khớp server/src/level.js, nếu lệch thì số hiển thị sẽ nhảy khi đồng bộ.
   Cấp 1→2 cần 100 XP, mỗi cấp sau cộng thêm 50 XP. */
const LV_BASE = 100, LV_STEP = 50;
const xpToReach = n => (n <= 1 ? 0 : ((n - 1) * (2 * LV_BASE + (n - 2) * LV_STEP)) / 2);
const rankOf = lv => lv >= 40 ? tr('Cao thủ', 'Master')
  : lv >= 25 ? tr('Thành thạo', 'Expert')
  : lv >= 15 ? tr('Nâng cao', 'Advanced')
  : lv >= 8 ? tr('Trung cấp', 'Intermediate')
  : lv >= 3 ? tr('Sơ cấp', 'Beginner')
  : tr('Nhập môn', 'Starter');
function userLevel(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let lv = 1;
  while (xpToReach(lv + 1) <= x) lv += 1;
  const floor = xpToReach(lv), next = xpToReach(lv + 1);
  return { lv, level: lv, xp: x, into: x - floor, need: next - floor, toNext: next - x,
           percent: Math.round(((x - floor) / (next - floor)) * 100), rank: rankOf(lv) };
}

/* Bài học nổi bật: chọn theo ngày nên mỗi ngày một bộ khác nhau, nhưng trong ngày thì ổn định */
function featuredLessons(n) {
  const all = [];
  ['20', '30'].forEach(ver => booksOfVer(ver).forEach(lv => BOOKS[bookId(ver, lv)].lessons.forEach(L => all.push({ ver, lv, L }))));
  const seed = Math.floor(Date.now() / 864e5), out = [], used = new Set();
  for (let i = 0; out.length < n && i < all.length * 2; i++) {
    const j = (seed * 7 + i * 13) % all.length;
    if (used.has(j)) continue;
    used.add(j); out.push(all[j]);
  }
  return out;
}

/* Lịch nhiệt 90 ngày: mỗi ô là một ngày, đậm dần theo XP */
function heatCells() {
  const cells = [];
  const first = new Date(Date.now() - 89 * 864e5);
  for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells.push(null);   /* chừa ô trống để cột bắt đầu từ thứ Hai */
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5), k = dayKey(d);
    cells.push({ k, xp: S.p.days[k] || 0, today: i === 0, d });
  }
  return cells;
}
function bestStreak() {
  const ks = Object.keys(S.p.days).filter(k => S.p.days[k] > 0).sort();
  let best = 0, run = 0, prev = null;
  ks.forEach(k => {
    const d = new Date(k + 'T00:00:00');
    run = prev && (d - prev) === 864e5 ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  });
  return best;
}

function renderHome() {
  const today = S.p.days[dayKey()] || 0, goal = 30;
  const C = 2 * Math.PI * 26, off = C * (1 - Math.min(1, today / goal));
  const due = dueCount(), st = liveStreak(), U = userLevel(S.p.xp);
  const B = bookOf(), L = B.lessons.find(x => x.n === S.bl) || B.lessons[0];
  const cells = heatCells(), active90 = cells.filter(c => c && c.xp > 0).length;
  const xp90 = cells.reduce((a, c) => a + (c ? c.xp : 0), 0);
  const heatLv = xp => (xp === 0 ? 0 : xp < 15 ? 1 : xp < 40 ? 2 : xp < 80 ? 3 : 4);
  const miles = [3, 7, 14, 30];
  view.innerHTML = `
  <section class="dash-head">
    <div>
      <h1>${S.user ? tr(`Chào mừng trở lại, ${esc(S.user.name)}`, `Welcome back, ${esc(S.user.name)}`) : tr('Chào mừng trở lại', 'Welcome back')}</h1>
      <p class="lead" style="margin:4px 0 0">${tr('Giữ chuỗi ngày học và ôn đúng lúc để nhớ lâu.', 'Keep your streak and review on time.')}</p>
    </div>
    <figure class="hero-char mini">
      <div class="gbox" aria-hidden="true">${gridSvg()}<div class="writer" id="heroW"></div></div>
      <figcaption><span class="zh" style="font-size:18px">中</span><span class="py t1">zhōng</span><span>${tr('ở giữa', 'middle')}</span></figcaption>
    </figure>
  </section>

  <section class="row3">
    <div class="card stat">
      <svg class="ring" viewBox="0 0 60 60" aria-hidden="true"><circle class="bg" cx="30" cy="30" r="26"/><circle class="fg" cx="30" cy="30" r="26" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>
      <div><div class="big">${today}<span class="muted" style="font-size:16px;font-weight:600">/${goal} XP</span></div><div class="sub">${tr('Mục tiêu hôm nay', "Today's goal")}</div></div>
    </div>
    <div class="card stat" role="button" tabindex="0" data-act="nav" data-arg="stats" style="cursor:pointer">
      <div class="badge-ic bi-verm">${ic('flame')}</div>
      <div><div class="big">${st}</div><div class="sub">${st ? tr('ngày học liên tiếp', 'day streak') : tr('Học một bài để bắt đầu chuỗi', 'Finish a session to start a streak')}</div></div>
    </div>
    <div class="card stat lvcard">
      <div class="badge-ic bi-jade">${ic('bolt')}</div>
      <div style="flex:1">
        <div class="big">${tr('Cấp', 'Level')} ${U.lv} <span class="rankchip">${U.rank}</span></div>
        <div class="pbar"><span style="width:${U.percent}%"></span></div>
        <div class="sub">${tr(`Còn ${U.toNext} XP đến cấp ${U.lv + 1}`, `${U.toNext} XP to level ${U.lv + 1}`)}</div>
      </div>
    </div>
  </section>

  <h2 class="sec">${tr('Ôn tập nhanh', 'Quick review')}</h2>
  <div class="qrow">
    <button class="qbtn q1" data-act="nav" data-arg="cards">${ic('cards')}<span><span class="t">${tr('Học thẻ từ vựng', 'Vocabulary cards')}</span><span class="s">${due ? tr(`${due} thẻ cần ôn hôm nay`, `${due} cards due today`) : tr('Bạn đã ôn xong hết', 'All caught up')}</span></span></button>
    <button class="qbtn q2" data-act="bprac" data-arg="${L.n}">${ic('target')}<span><span class="t">${tr('Luyện tập bài đang học', 'Practise this lesson')}</span><span class="s">${verName()}, ${tr('quyển', 'book')} ${S.bookLv}, ${tr('bài', 'lesson')} ${L.n}</span></span></button>
    <button class="qbtn q3" data-act="golibtab" data-arg="grammar">${ic('library')}<span><span class="t">${tr('Xem ngữ pháp', 'Grammar')}</span><span class="s">${tr('Tra theo cấp độ', 'Browse by level')}</span></span></button>
  </div>

  <h2 class="sec">${tr('Học tiếp', 'Continue learning')}</h2>
  <button class="contcard" data-act="bopen" data-arg="${L.n}">
    <span class="zhb num">${L.n}</span>
    <span class="grow">
      <span class="ut zh" lang="zh-CN">${esc(L.zh)}</span>
      <span class="us" style="display:block">${esc(S.lang === 'vi' ? L.vi : L.en)}</span>
      <span class="us" style="display:block">${verName()}, ${tr('quyển', 'book')} ${S.bookLv} · ${coreCount(L)} ${tr('từ mới', 'new words')}, ${L.grammar.length} ${tr('điểm ngữ pháp', 'grammar points')}</span>
      <span class="pbar" style="display:block"><span style="width:${bookPct(L.n)}%"></span></span>
    </span>
    <span class="end">${ic('chev')}</span>
  </button>

  <h2 class="sec">${tr('Bài học gợi ý hôm nay', "Today's picks")}</h2>
  <div class="feat">${featuredLessons(8).map(({ ver, lv, L: F }) => `
    <button class="fcard" data-act="goles" data-arg="${ver}-${lv}-${F.n}">
      <span class="bd">HSK ${verName(ver).slice(4)} · ${tr('Q', 'B')}${lv}</span>
      <span class="ft zh" lang="zh-CN">${esc(F.zh)}</span>
      <span class="fs">${esc(S.lang === 'vi' ? F.vi : F.en)}</span>
      <span class="fm">${tr('Bài', 'Lesson')} ${F.n} · ${coreCount(F)} ${tr('từ', 'words')}</span>
    </button>`).join('')}</div>

  <div class="two">
    <section class="card pad">
      <h2 class="sec" style="margin-top:0">${tr('90 ngày gần nhất', 'Last 90 days')}</h2>
      <p class="hint">${tr('Ô càng đậm nghĩa là ngày đó học càng nhiều.', 'Darker cells mean more study that day.')}</p>
      <div class="hm">${cells.map(c => c
        ? `<i class="h${heatLv(c.xp)} ${c.today ? 'now' : ''}" title="${c.k}: ${c.xp} XP"></i>`
        : '<i class="pad"></i>').join('')}</div>
      <div class="hmleg"><span>${tr('Ít', 'Less')}</span><i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><span>${tr('Nhiều', 'More')}</span></div>
      <div class="hmsum">
        <div><b>${active90}/90</b><span>${tr('ngày có học', 'active days')}</span></div>
        <div><b>${num(xp90)}</b><span>${tr('XP trong 90 ngày', 'XP in 90 days')}</span></div>
        <div><b>${bestStreak()}</b><span>${tr('chuỗi dài nhất', 'best streak')}</span></div>
      </div>
    </section>
    <section class="card pad">
      <h2 class="sec" style="margin-top:0">${tr('Mốc chuỗi ngày', 'Streak milestones')}</h2>
      <p class="hint">${tr('Học ít nhất một phiên mỗi ngày để giữ chuỗi.', 'Study at least once a day to keep the streak.')}</p>
      <div class="mile">${miles.map(m => {
        const done = st >= m;
        return `<div class="mcard ${done ? 'done' : ''}">
          <div class="badge-ic ${done ? 'bi-jade' : 'bi-mut'}">${ic(done ? 'check' : 'flame')}</div>
          <div><b>${tr(`Mốc ${m} ngày`, `${m}-day streak`)}</b>
            <span class="sub">${done ? tr('Đã đạt', 'Unlocked') : tr(`Còn ${m - st} ngày`, `${m - st} days to go`)}</span></div>
        </div>`;
      }).join('')}</div>
    </section>
  </div>`;
  mountHero();
}

function renderLessons() {
  const pct = unitPct();
  view.innerHTML = `
  <div class="lhead"><h1>HSK 1</h1></div>
  <p class="lead">${tr('Mỗi bài gồm pinyin, từ vựng, bộ thủ, ngữ pháp, hội thoại và tập viết, sau đó là phần luyện tập tổng hợp.', 'Each lesson covers pinyin, vocabulary, radicals, grammar, dialogue and writing, followed by a mixed practice session.')}</p>
  <div class="units">
    ${UNITS.map(u => u.open
      ? `<button class="unit on" data-act="nav" data-arg="lesson"><span class="zhb">${u.zh}</span><span class="grow"><span class="ut">${tr('Bài', 'Lesson')} ${u.id}: ${L(u.title)}</span><span class="us" style="display:block">${pct}% ${tr('hoàn thành', 'complete')}</span><span class="pbar" style="display:block"><span style="width:${pct}%"></span></span></span><span class="end">${ic('chev')}</span></button>`
      : `<div class="unit off"><span class="zhb">${u.zh}</span><span class="grow"><span class="ut">${tr('Bài', 'Lesson')} ${u.id}: ${L(u.title)}</span><span class="us" style="display:block">${tr('Mở khóa khi hoàn thành bài trước', 'Unlocks after the previous lesson')}</span></span><span class="end">${ic('lock')}</span></div>`).join('')}
  </div>`;
}

function renderLesson() {
  S.p.seen[S.tab] = 1; saveP();
  const body = { pinyin: tabPinyin, vocab: tabVocab, radicals: tabRadicals, grammar: tabGrammar, dialogue: tabDialogue, writing: tabWriting }[S.tab]();
  view.innerHTML = `
  <div class="lhead">
    <button class="icon-btn" data-act="nav" data-arg="lessons" aria-label="${tr('Quay lại danh sách bài', 'Back to lessons')}">${ic('back')}</button>
    <h1>${tr('Bài 1', 'Lesson 1')}: <span class="zh-d">你好</span> ${L(UNITS[0].title)}</h1>
  </div>
  <div class="tabs" role="tablist">
    ${TABS.map(([k, l]) => `<button class="tab" role="tab" data-act="tab" data-arg="${k}" aria-selected="${S.tab === k}">${L(l)}</button>`).join('')}
  </div>
  <div role="tabpanel">${body}</div>
  <div class="cta-end"><p>${tr('Học xong phần lý thuyết? Kiểm tra lại bằng 9 câu luyện tập.', 'Done with the theory? Check yourself with 9 practice questions.')}</p><button class="btn" data-act="lessonprac">${tr('Luyện tập bài này', 'Practice this lesson')}</button></div>`;
  if (S.tab === 'writing') mountWriter();
}

function tabPinyin() {
  return `
  <p class="lead">${tr('Tiếng Trung có 4 thanh chính và 1 thanh nhẹ. Cùng âm "ma" nhưng đổi thanh là đổi nghĩa. Chạm vào từng thẻ để nghe.', 'Mandarin has four main tones and a neutral tone. The same syllable "ma" changes meaning with each tone. Tap a card to listen.')}</p>
  <div class="tones">
    ${TONES.map(t => `<button class="tone" data-act="speak" data-arg="${t.h}">
      <svg class="contour t${t.n}" viewBox="0 0 60 46" aria-hidden="true">${[6, 14.5, 23, 31.5, 40].map(y => `<line class="lv" x1="0" x2="60" y1="${y}" y2="${y}"/>`).join('')}${t.pts ? `<polyline class="cv" points="${t.pts}"/>` : '<circle class="dt" cx="30" cy="31.5" r="5"/>'}</svg>
      <span class="syl t${t.n}">${t.syl}</span><span class="zh">${t.h}</span>
      <div class="nm">${L(t.nm)}</div><div class="gl">${L(t.g)}</div></button>`).join('')}
  </div>
  <div class="note">
    <h3>${tr('Hai quy tắc biến điệu gặp ngay ở bài này', 'Two tone-change rules you meet in this lesson')}</h3>
    <p>${tr('Hai thanh 3 đi liền nhau thì âm đầu đọc thành thanh 2: 你好 viết nǐ hǎo, đọc ní hǎo.', 'Two 3rd tones in a row: the first becomes 2nd tone. 你好 is written nǐ hǎo, said ní hǎo.')}</p>
    <p>${tr('不 đứng trước thanh 4 thì đọc thành bú: 不是 bú shì, 不客气 bú kèqi.', '不 before a 4th tone becomes bú: 不是 bú shì, 不客气 bú kèqi.')}</p>
  </div>`;
}
function tabVocab() {
  return `
  <p class="lead">${tr('Màu pinyin cho biết thanh điệu:', 'Pinyin colour shows the tone:')} <span class="py t1">${tr('thanh 1', 'tone 1')}</span>, <span class="py t2">${tr('thanh 2', 'tone 2')}</span>, <span class="py t3">${tr('thanh 3', 'tone 3')}</span>, <span class="py t4">${tr('thanh 4', 'tone 4')}</span>, <span class="py t5">${tr('thanh nhẹ', 'neutral')}</span>.</p>
  <div class="vgrid">
    ${VOCAB.map(v => `<div class="vcard">
      <button class="icon-btn spk spk-b" data-act="speak" data-arg="${v.h}" aria-label="${tr('Nghe', 'Listen to')} ${v.h}">${ic('volume')}</button>
      <div class="h" lang="zh-CN">${v.h}</div>${py(v.py)}
      <div class="m">${esc(L(v))}</div>
      ${S.lang === 'vi' ? `<div class="hv">${tr('Hán Việt', 'Sino-Vietnamese')}: ${esc(v.hv)}</div>` : ''}
      ${v.note ? `<div class="nt">${esc(L(v.note))}</div>` : ''}
    </div>`).join('')}
  </div>`;
}
function tabRadicals() {
  return `
  <p class="lead">${tr('Bộ thủ là thành phần gợi nghĩa của chữ. Nhận ra bộ thủ giúp đoán nghĩa và nhớ mặt chữ nhanh hơn.', 'Radicals hint at a character’s meaning. Spotting them helps you guess meanings and remember shapes.')}</p>
  <div class="vgrid">
    ${RADICALS.map(r => `<div class="vcard">
      <div class="rad" lang="zh-CN">${r.r}</div>
      <div class="m">${esc(L(r.nm))}</div>
      <div class="hv">${esc(L(r.m))}</div>
      <div class="rex">${r.ex.map(c => `<span lang="zh-CN">${c}</span>`).join('')}</div>
    </div>`).join('')}
  </div>`;
}
function tabGrammar() {
  const chip = x => (typeof x === 'string' ? `<span class="fx k" lang="zh-CN">${x}</span>` : `<span class="fx">${esc(L(x))}</span>`);
  return GRAMMAR.map(g => `<article class="gblock">
    <h3>${esc(L(g.t))}</h3><p class="desc">${esc(L(g.d))}</p>
    ${g.f.map(([lbl, parts]) => `<div class="formula"><span class="fl">${esc(L(lbl))}</span>${parts.map(chip).join('')}</div>`).join('')}
    <ul class="exs">${g.ex.map(e => `<li><button class="icon-btn spk-b" data-act="speak" data-arg="${esc(e.h)}" aria-label="${tr('Nghe câu', 'Listen')}">${ic('volume')}</button><div><span class="zh" lang="zh-CN">${e.h}</span><span class="p">${esc(e.p)}</span><span class="tr">${esc(L(e))}</span></div></li>`).join('')}</ul>
  </article>`).join('');
}
function tabDialogue() {
  const w = DIALOGUE.who;
  return `
  <p class="lead">${tr('Tiểu Nguyệt và Đại Minh gặp nhau lần đầu. Chạm vào từng câu để nghe, hoặc phát cả đoạn.', 'Xiaoyue and Daming meet for the first time. Tap a line to hear it, or play the whole dialogue.')}</p>
  <div class="dtools">
    <button class="btn btn-sm" data-act="playall">${ic('play')}${tr('Phát cả đoạn', 'Play all')}</button>
    <button class="pill" data-act="togglepy" aria-pressed="${S.showPy}">${ic('eye')}Pinyin</button>
    <button class="pill" data-act="toggletr" aria-pressed="${S.showTr}">${ic('eye')}${tr('Bản dịch', 'Translation')}</button>
  </div>
  <div class="dlg ${S.showPy ? '' : 'hide-py'} ${S.showTr ? '' : 'hide-tr'}" id="dlg">
    ${DIALOGUE.lines.map((l, i) => `<div class="line ${l.s.toLowerCase()}">
      <span class="av" title="${w[l.s].p}" lang="zh-CN">${w[l.s].h.slice(-1)}</span>
      <button class="bubble" data-act="speakline" data-arg="${i}"><span class="zh" lang="zh-CN">${l.h}</span><span class="p">${esc(l.p)}</span><span class="tr">${esc(L(l))}</span></button>
    </div>`).join('')}
  </div>`;
}
function tabWriting() {
  const cur = WCHARS.find(w => w.c === S.wchar) || WCHARS[0];
  const strokes = strokeCount(cur.c) || '?';
  return `
  <p class="lead">${tr('Xem thứ tự nét trước, sau đó tự viết bằng chuột hoặc ngón tay. Viết sai hai lần ở cùng một nét thì hệ thống sẽ gợi ý.', 'Watch the stroke order first, then write it yourself with a mouse or finger. Miss a stroke twice and you get a hint.')}</p>
  <div class="wchars" role="group" aria-label="${tr('Chọn chữ', 'Pick a character')}">
    ${WCHARS.map(w => `<button class="wchar" data-act="wchar" data-arg="${w.c}" aria-pressed="${w.c === cur.c}" lang="zh-CN">${w.c}${S.p.charsDone[w.c] ? `<span class="dot">${ic('check')}</span>` : ''}</button>`).join('')}
  </div>
  <div class="wstage">
    <div class="gbox lg">${gridSvg()}<div class="writer" id="writeW"></div></div>
    <div class="winfo">
      <div class="big-py">${py(cur.py)}</div>
      <div class="m">${esc(L(cur.m))}</div>
      <div class="meta">${strokes} ${tr('nét', 'strokes')}. ${tr('Phần tô đỏ là bộ thủ.', 'The red part is the radical.')}</div>
      <div class="wbtns">
        <button class="btn btn-ghost btn-sm" data-act="wanim">${ic('play')}${tr('Xem cách viết', 'Show strokes')}</button>
        <button class="btn btn-sm" data-act="wquiz">${ic('pen')}${tr('Tự viết', 'Write it')}</button>
        <button class="icon-btn spk-b" data-act="speak" data-arg="${cur.c}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button>
      </div>
      <div class="wstatus" id="wStatus" aria-live="polite"></div>
    </div>
  </div>`;
}

export { LV_BASE, bestStreak, featuredLessons, heatCells, rankOf, renderHome, renderLesson, renderLessons, tabDialogue, tabGrammar, tabPinyin, tabRadicals, tabVocab, tabWriting, userLevel, xpToReach };
