/* The first few levels of Settle, playable on the page. The rules are the game's own (logic.js, copied from the game);
   this file only draws the board with a few divs and moves them tick by tick. Swipe the board, or focus it and use the
   arrow keys. */
(function () {
  'use strict';
  const G = window.SettleLogic;
  const LEVELS = [
    { title: 'Around the corner', map: ['B....', '.....', '.....', '....U'] },
    { title: 'Not that corner', map: ['...B...', '.......', '#......', 'U#.....', '.......', '.......', '...#...'] },
    { title: 'Moss', map: ['#......', 'U...m..', '#.#....', '.#...#.', '.......', '.......', 'B..#...'] },
    { title: 'Stepping stone', map: ['...S...', '.......', '#.....#', '...O..U', '......#', 'B......'] },
  ];
  const T = G.T, TICK = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 75;
  const $ = (s, r) => (r || document).querySelector(s);
  const board = $('#board'), tiles = $('#tiles'), things = $('#things');
  const note = $('#play-note'), nextBtn = $('#play-next'), againBtn = $('#play-again'), dots = $('#play-dots');
  if (!board || !G) return;

  let li = 0, L = null, S = null, busy = false, els = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function tileClass(t) {
    return t === T.WALL ? 'wall' : t === T.POOL ? 'pool' : t === T.FILLED ? 'filled' : t === T.MOSS ? 'moss' : t === T.CUP ? 'cup' : t === T.CUPFULL ? 'cup' : '';
  }
  function drawTiles(tl) {
    tiles.innerHTML = '';
    for (let i = 0; i < L.w * L.h; i++) {
      const c = tileClass(tl[i]);
      if (!c) continue;
      const d = document.createElement('i');
      d.className = 't ' + c;
      d.style.setProperty('--x', i % L.w); d.style.setProperty('--y', (i / L.w) | 0);
      tiles.appendChild(d);
    }
  }
  function place(el, x, y) { el.style.setProperty('--x', x); el.style.setProperty('--y', y); }

  function load(n) {
    li = n;
    const p = G.parse(LEVELS[n].map);
    L = p.level; S = p.state;
    board.style.setProperty('--w', L.w); board.style.setProperty('--h', L.h);
    board.setAttribute('aria-label', 'Level ' + (n + 1) + ' of ' + LEVELS.length + ': ' + LEVELS[n].title + '. Tilt with the arrow keys.');
    drawTiles(S.tiles);
    things.innerHTML = '';
    els = S.objs.map((o) => {
      const d = document.createElement('i');
      d.className = 'o ' + (o.k === 'S' ? 'stone' : 'pebble');
      place(d, o.x, o.y);
      things.appendChild(d);
      return d;
    });
    board.classList.remove('won');
    note.textContent = LEVELS[n].title;
    nextBtn.hidden = true;
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k <= n));
  }

  async function tilt(dir) {
    if (busy || board.classList.contains('won')) return;
    const r = G.step(L, S, dir, true);
    if (!r.moved) { board.classList.remove('nudge'); void board.offsetWidth; board.dataset.dir = dir; board.classList.add('nudge'); return; }
    busy = true;
    for (const tk of r.ticks) {
      tk.pos.forEach((q, i) => {
        place(els[i], q[0], q[1]);
        els[i].classList.toggle('gone', q[2] === G.GONE);
        els[i].classList.toggle('lost', q[2] === G.LOST);
        els[i].classList.toggle('home', q[2] === G.HOME);
      });
      if (tk.ev.some((e) => e.t === 'fill' || e.t === 'moss')) drawTiles(tk.tiles);
      await wait(TICK);
    }
    if (r.result === 'fail' || r.loop) {
      note.textContent = 'In the water. Time flows back.';
      await wait(700);
      const keep = note.textContent; load(li); note.textContent = keep;   // a fall costs nothing: the level starts over
      setTimeout(() => { if (!busy) note.textContent = LEVELS[li].title; }, 1600);
    } else if (r.result === 'win') {
      board.classList.add('won');
      note.textContent = 'settled.';
      nextBtn.hidden = false;
      nextBtn.textContent = li < LEVELS.length - 1 ? 'Next level' : 'Play again';
    } else S = r.state;
    busy = false;
  }

  nextBtn.addEventListener('click', () => { load(li < LEVELS.length - 1 ? li + 1 : 0); board.focus({ preventScroll: true }); });
  againBtn.addEventListener('click', () => { if (!busy) load(li); });
  const KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3 };
  board.addEventListener('keydown', (e) => {
    if (e.key in KEYS) { e.preventDefault(); tilt(KEYS[e.key]); }
    else if ((e.key === 'Enter' || e.key === ' ') && !nextBtn.hidden) { e.preventDefault(); nextBtn.click(); }
  });
  let start = null;
  board.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; board.focus({ preventScroll: true }); });
  board.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < 22) return;
    start = null;
    tilt(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });
  board.addEventListener('pointerup', () => { start = null; });
  board.addEventListener('pointercancel', () => { start = null; });

  LEVELS.forEach(() => dots.appendChild(document.createElement('i')));
  load(0);
})();
