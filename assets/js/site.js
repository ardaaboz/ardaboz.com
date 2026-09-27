/* ardaboz.com
   The kiosk mirrors the real Fiyat Gör Android app: black screen, white
   Montserrat ExtraBold name, #FFD400 price, a grey prompt, a status dot, and
   barcode input captured as keystrokes rather than through a text field. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  document.documentElement.classList.remove('no-js');

  /* ------------------------------------------------------------ language */
  const TR = window.I18N_TR || {};
  const EN = {};
  $$('[data-i18n]').forEach((el) => { if (!(el.dataset.i18n in EN)) EN[el.dataset.i18n] = el.textContent; });
  $$('[data-i18n-html]').forEach((el) => { if (!(el.dataset.i18nHtml in EN)) EN[el.dataset.i18nHtml] = el.innerHTML; });
  $$('[data-i18n-aria]').forEach((el) => { EN['aria:' + el.dataset.i18nAria] = el.getAttribute('aria-label'); });
  const META = {
    en: { title: document.title, desc: $('meta[name=description]').content },
    tr: {
      title: 'Talha Arda Boz · Web geliştirici',
      desc: "İzmir'de web geliştirici. İşletmeler için dört dile kadar web siteleri, bir kitapçı ve kırtasiyede her gün kullanılan yazılımlar, marka ve fuar tasarımı.",
    },
  };
  let lang = 'en';
  const t = (key) => (lang === 'tr' ? TR[key] : EN[key]) ?? EN[key] ?? '';

  function setLang(next) {
    lang = next === 'tr' ? 'tr' : 'en';
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    $$('[data-i18n-aria]').forEach((el) => {
      const k = el.dataset.i18nAria;
      el.setAttribute('aria-label', lang === 'tr' ? (TR[k] ?? EN['aria:' + k]) : EN['aria:' + k]);
    });
    $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    $$('[data-cv]').forEach((a) => { a.href = `assets/files/${lang === 'tr' ? 'Talha_Arda_Boz_Ozgecmis' : 'Talha_Arda_Boz_CV'}.pdf`; });
    document.title = META[lang].title;
    $('meta[name=description]').content = META[lang].desc;
    store.set('lang', lang);
    bindPeek();
    renderShelf();
    kiosk.relabel();
  }

  /* ------------------------------------------------------------ EAN-13 */
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = L.map((p) => p.replace(/./g, (b) => (b === '0' ? '1' : '0')));
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const checkDigit = (d12) => {
    let s = 0;
    for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1);
    return String((10 - (s % 10)) % 10);
  };
  const ean = (d12) => d12 + checkDigit(d12);
  function eanSvg(code) {
    const f = Number(code[0]);
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (PARITY[f][i - 1] === 'L' ? L : G)[Number(code[i])];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += R[Number(code[i])];
    bits += '101';
    let rects = '';
    for (let i = 0; i < bits.length; ) {
      if (bits[i] === '1') {
        let j = i;
        while (bits[j] === '1') j++;
        rects += `<rect x="${i}" y="0" width="${j - i}" height="40"/>`;
        i = j;
      } else i++;
    }
    return `<svg viewBox="-4 0 103 40" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g fill="#121211">${rects}</g></svg>`;
  }
  const spaced = (c) => `${c[0]} ${c.slice(1, 7)} ${c.slice(7)}`;

  /* ------------------------------------------------------------ products */
  // Demo products, named and priced as in the Fiyat Gör screenshots. Codes start
  // with 2, the range shops use for their own labels, so none is a real product.
  const PRODUCTS = [
    { code: ean('200000089901'), name: { tr: 'A4 Kareli Defter 80 Yaprak Spiralli', en: 'A4 Squared Notebook, 80 Sheets, Spiral' }, price: '89,90 TL', stock: 46 },
    { code: ean('200000054902'), name: { tr: 'A4 Kareli Defter 60 Yaprak Karton Kapak', en: 'A4 Squared Notebook, 60 Sheets, Card Cover' }, price: '54,90 TL', stock: 88 },
    { code: ean('200000139903'), name: { tr: 'A4 Kareli Defter 120 Yaprak Sert Kapak', en: 'A4 Squared Notebook, 120 Sheets, Hardcover' }, price: '139,90 TL', stock: 22 },
    { code: ean('200000219904'), name: { tr: 'Keçeli Kalem 24 Renk', en: 'Felt-Tip Pens, 24 Colours' }, price: '219,90 TL', stock: 13 },
  ];
  const KIOSK_TEXT = {
    en: { prompt: 'Scan a product', notFound: 'PRODUCT NOT FOUND', stock: 'In stock', typed: 'Scanner input' },
    tr: { prompt: 'Ürünü okutunuz', notFound: 'ÜRÜN BULUNAMADI', stock: 'Stok', typed: 'Okuyucu girişi' },
  };

  /* ------------------------------------------------------------ kiosk */
  const kiosk = (() => {
    const box = $('#kiosk');
    const el = { ph: $('#kPlaceholder'), name: $('#kName'), price: $('#kPrice'), stock: $('#kStock'), err: $('#kError') };
    let current = null; // product on screen, 'missing', or null for the prompt
    let timers = [];
    let booted = false;
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
    const state = (s) => { box.dataset.state = s; };
    const ready = () => ['ready', 'connecting'].includes(box.dataset.state);

    function fit(node, maxLines) {
      node.style.fontSize = '';
      const lh = () => parseFloat(getComputedStyle(node).lineHeight) || node.offsetHeight;
      let guard = 0;
      while (guard++ < 14 && (node.offsetHeight > lh() * maxLines + 1 || node.scrollWidth > node.clientWidth + 1)) {
        node.style.fontSize = parseFloat(getComputedStyle(node).fontSize) * 0.9 + 'px';
      }
    }

    function paint() {
      const T = KIOSK_TEXT[lang];
      el.ph.textContent = el.name.textContent = el.price.textContent = el.stock.textContent = el.err.textContent = '';
      if (current === null) el.ph.textContent = T.prompt;
      else if (current === 'missing') el.err.textContent = T.notFound;
      else {
        el.name.textContent = current.name[lang];
        el.price.textContent = current.price;
        el.stock.textContent = `${T.stock}: ${current.stock}`;
        fit(el.name, 2);
        fit(el.price, 1);
      }
      box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
    }

    function scan(code) {
      if (!ready()) return false;
      current = PRODUCTS.find((p) => p.code === code) || 'missing';
      paint();
      $$('.label').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.code === code)));
      return true;
    }

    function boot(done) {
      clearTimers();
      booted = true;
      current = null;
      if (reduceMotion) { state('ready'); paint(); done && done(); return; }
      state('off');
      later(() => state('booting'), 450);
      later(() => { state('connecting'); paint(); }, 1700);
      later(() => { state('ready'); done && done(); }, 2500);
    }

    function powerCut(done) {
      clearTimers();
      $$('.label').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      state('off');
      later(() => boot(done), reduceMotion ? 0 : 1300);
    }

    return {
      scan, boot, powerCut, ready,
      get booted() { return booted; },
      relabel: () => { if (!['off', 'booting'].includes(box.dataset.state)) paint(); },
    };
  })();

  // The tablet powers on the first time it scrolls into view.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting)) { if (!kiosk.booted) kiosk.boot(); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe($('#kiosk'));
  } else kiosk.boot();

  /* ------------------------------------------------------------ shelf labels */
  function renderShelf() {
    const pressed = $('.label[aria-pressed="true"]')?.dataset.code;
    $('#shelf').innerHTML = PRODUCTS.map((p) => `
      <li><button type="button" class="label" data-code="${p.code}" aria-pressed="${p.code === pressed}">
        <span class="label-name"><span class="vh">${lang === 'tr' ? 'Okut: ' : 'Scan: '}</span>${p.name[lang]}</span>
        <span class="label-code" aria-hidden="true">${eanSvg(p.code)}<small>${spaced(p.code)}</small></span>
        <span class="label-price" aria-hidden="true">${p.price.replace(' TL', '')}</span>
      </button></li>`).join('');
  }
  $('#shelf').addEventListener('click', (e) => {
    const b = e.target.closest('.label');
    if (!b) return;
    if (!kiosk.booted) kiosk.boot();
    b.classList.remove('scanning'); void b.offsetWidth; b.classList.add('scanning');
    setTimeout(() => kiosk.scan(b.dataset.code), reduceMotion ? 0 : 170);
  });

  /* keyboard wedge: a barcode scanner is just a very fast keyboard */
  const typed = $('#kioskTyped');
  let buffer = '';
  let idle = null;
  const flushTyped = () => { typed.textContent = buffer ? `${KIOSK_TEXT[lang].typed}: ${buffer}` : ''; };
  function finalize() {
    clearTimeout(idle);
    if (buffer) kiosk.scan(buffer);
    buffer = '';
    flushTyped();
  }
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    if ($('#lightbox').open) return;
    if (/^\d$/.test(e.key)) {
      buffer = (buffer + e.key).slice(-13);
      flushTyped();
      clearTimeout(idle);
      idle = setTimeout(() => (buffer.length === 13 ? finalize() : (buffer = '', flushTyped())), 2500);
    } else if (e.key === 'Enter' && buffer) {
      e.preventDefault();
      finalize();
    }
  });

  /* power cut: the reason the kiosk boots straight to this screen */
  const power = $('#power');
  power.addEventListener('click', () => {
    power.disabled = true;
    kiosk.powerCut(() => { power.disabled = false; });
  });

  /* ------------------------------------------------------------ hero peek */
  const peek = $('#peek');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let px = -999, py = -999, tx = -999, ty = -999, raf = 0;
  function loop() {
    const k = reduceMotion ? 1 : 0.2;
    px += (tx - px) * k; py += (ty - py) * k;
    peek.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    raf = Math.abs(tx - px) + Math.abs(ty - py) > 0.5 ? requestAnimationFrame(loop) : 0;
  }
  function aim(e) {
    const w = peek.offsetWidth, h = peek.offsetHeight;
    tx = Math.min(e.clientX + 24, innerWidth - w - 12);
    ty = e.clientY - h - 18 < 8 ? e.clientY + 24 : e.clientY - h - 18;
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function bindPeek() {
    $$('.hero-text a[data-peek]').forEach((a) => {
      a.addEventListener('pointerenter', (e) => {
        if (!fine.matches) return;
        $$('[data-peek-img]', peek).forEach((n) => n.classList.toggle('show', n.dataset.peekImg === a.dataset.peek));
        if (!peek.classList.contains('on')) { aim(e); px = tx; py = ty; }
        peek.classList.add('on');
      });
      a.addEventListener('pointermove', aim);
      a.addEventListener('pointerleave', () => peek.classList.remove('on'));
    });
  }

  /* ------------------------------------------------------------ Telegram feed */
  // Invented listings in the exact shape of Ev Nöbetçisi's format_card().
  const LISTINGS = [
    { price: 520, m2: 42, mun: 'Vračar', mins: 18, score: 81, flags: ['balkon', 'aydınlık'], url: 'cityexpert.rs/izdavanje-stana/…' },
    { price: 480, m2: 38, mun: 'Zvezdara', mins: 24, score: 74, flags: ['balkon'], url: 'halooglasi.com/nekretnine/izdavanje-stanova/…' },
    { price: 610, m2: 55, mun: 'Stari Grad', mins: 11, score: 77, flags: ['esnek bütçe', 'aydınlık'], url: '4zida.rs/izdavanje-stanova/…' },
    { price: 450, m2: 35, mun: 'Palilula', mins: 21, score: 70, flags: [], url: 'halooglasi.com/nekretnine/izdavanje-stanova/…' },
    { price: 540, m2: 47, mun: 'Savski venac', mins: 15, score: 79, flags: ['balkon'], url: 'cityexpert.rs/izdavanje-stana/…' },
  ];
  (() => {
    const box = $('#tgFeed');
    let i = 0;
    let timer = null;
    const clock = () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const card = (l) => {
      const flags = l.flags.length ? ' · ' + l.flags.join(' · ') : '';
      return `<div class="tg-msg"><b>${l.price} EUR</b> · ${l.m2} m2 · ${l.mun}<br>Fakülteye ~${l.mins} dk<br>Skor ${l.score}${flags}<br><span class="u">${l.url}</span><time>${clock()}</time>
        <div class="tg-kb"><span>Yazdım</span><span>Elendi</span><span>Favori</span></div></div>`;
    };
    const push = () => {
      box.insertAdjacentHTML('beforeend', card(LISTINGS[i++ % LISTINGS.length]));
      while (box.children.length > 3) box.firstElementChild.remove();
    };
    for (let n = 0; n < 2; n++) push();
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting && !timer) { push(); timer = setInterval(push, 3200); }
      else if (!en.isIntersecting) { clearInterval(timer); timer = null; }
    }), { threshold: 0.3 }).observe(box);
  })();

  /* ------------------------------------------------------------ lightbox */
  const dlg = $('#lightbox');
  const largest = (img) => {
    const set = img.getAttribute('srcset');
    if (!set) return img.currentSrc || img.src;
    return set.split(',').map((s) => s.trim().split(/\s+/)).sort((a, b) => parseInt(b[1]) - parseInt(a[1]))[0][0];
  };
  $$('.zoomable').forEach((fig) => {
    const img = $('img', fig);
    const cap = () => $('figcaption', fig)?.textContent || img.alt;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'zoom-btn';
    const label = () => btn.setAttribute('aria-label', `${lang === 'tr' ? 'Büyüt' : 'Enlarge'}: ${cap()}`);
    label();
    fig.append(btn);
    const size = () => fig.style.setProperty('--zh', img.offsetHeight + 'px');
    img.complete ? size() : img.addEventListener('load', size);
    new ResizeObserver(size).observe(img);
    fig.addEventListener('mouseenter', label);
    btn.addEventListener('focus', label);
    btn.addEventListener('click', () => {
      $('#lightboxImg').src = largest(img);
      $('#lightboxImg').alt = img.alt;
      $('#lightboxCap').textContent = $('figcaption', fig)?.textContent || '';
      if (dlg.showModal) dlg.showModal();
    });
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  /* ------------------------------------------------------------ contact */
  $('#copyMail').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('ardaboz4317@gmail.com'); } catch {
      const r = document.createRange(); r.selectNodeContents($('#mailLink'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    $('#copied').textContent = lang === 'tr' ? 'Kopyalandı' : 'Copied';
    setTimeout(() => { $('#copied').textContent = ''; }, 2200);
  });
  $('#year').textContent = new Date().getFullYear();

  /* ------------------------------------------------------------ start */
  $$('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  renderShelf();
  bindPeek();
  // English by default; Turkish only when the visitor has chosen it before.
  if (store.get('lang') === 'tr') setLang('tr');
})();
