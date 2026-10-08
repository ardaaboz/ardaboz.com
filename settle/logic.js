/* Settle — rules engine. Pure, deterministic, shared by the game, the solver and the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SettleLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Tile types
  const T = {
    VOID: 0, WALL: 1, FLOOR: 2, POOL: 3, FILLED: 4, MOSS: 5, PLATE: 6, GATE: 7, IGATE: 8,
    RAIL_F: 9, RAIL_B: 10, CRACK: 11, PILLAR_A: 12, PILLAR_B: 13, CUP: 14, CUPFULL: 15, PORTAL: 16,
    // v4 candidates
    BELL: 17, GLASS: 18, CUR_U: 19, CUR_R: 20, CUR_D: 21, CUR_L: 22,
  };
  const CHAR_TILE = {
    ' ': T.VOID, '#': T.WALL, '.': T.FLOOR, 'O': T.POOL, 'm': T.MOSS, '_': T.PLATE, 'G': T.GATE,
    'g': T.IGATE, '/': T.RAIL_F, '\\': T.RAIL_B, 'x': T.CRACK, 'P': T.PILLAR_A, 'p': T.PILLAR_B, 'U': T.CUP,
    '*': T.BELL, '|': T.GLASS, '^': T.CUR_U, '>': T.CUR_R, 'v': T.CUR_D, '<': T.CUR_L,
  };
  const TILE_CHAR = {};
  for (const k in CHAR_TILE) TILE_CHAR[CHAR_TILE[k]] = k;
  TILE_CHAR[T.FILLED] = '='; TILE_CHAR[T.CUPFULL] = '@';
  CHAR_TILE['='] = T.FILLED; CHAR_TILE['@'] = T.CUPFULL;

  // Loose things. B pebble, R reflection pebble, S stone, u loose hollow, F ember (fire).
  const OBJ_CHARS = 'BRSuF';
  const isBall = (k) => k === 'B' || k === 'R';

  // Object status
  const ACTIVE = 0, HOME = 1, LOST = 2, GONE = 3;

  // Directions: 0 up, 1 right, 2 down, 3 left
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const RAIL_F_MAP = [1, 0, 3, 2];   // '/'
  const RAIL_B_MAP = [3, 2, 1, 0];   // '\'
  const MIRROR_H = [0, 3, 2, 1];     // reflection pebble swaps left/right
  const REVERSE = [2, 3, 0, 1];      // a bell sends you back the way you came
  const isCurrent = (t) => t >= T.CUR_U && t <= T.CUR_L;   // flows up, right, down, left

  function parse(rows) {
    const h = rows.length;
    const w = Math.max.apply(null, rows.map((r) => r.length));
    const base = new Uint8Array(w * h);
    const partner = new Int16Array(w * h).fill(-1);
    const portalId = new Int8Array(w * h).fill(-1);
    const objs = [];
    const portals = {};
    let hasPillars = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x] === undefined ? ' ' : rows[y][x];
        const i = y * w + x;
        if (OBJ_CHARS.indexOf(ch) >= 0) {
          base[i] = T.FLOOR;
          objs.push({ k: ch, x, y, s: ACTIVE });
        } else if (ch >= '1' && ch <= '9') {
          base[i] = T.PORTAL;
          portalId[i] = +ch;
          (portals[ch] = portals[ch] || []).push(i);
        } else if (ch in CHAR_TILE) {
          base[i] = CHAR_TILE[ch];
          if (base[i] === T.PILLAR_A || base[i] === T.PILLAR_B) hasPillars = true;
        } else {
          throw new Error('Unknown map char "' + ch + '"');
        }
      }
    }
    for (const id in portals) {
      const p = portals[id];
      if (p.length !== 2) throw new Error('Well ' + id + ' needs exactly two ends');
      partner[p[0]] = p[1];
      partner[p[1]] = p[0];
    }
    // Stable object order: pebbles and hollows first (for keys), stones after.
    const tail = (o) => (o.k === 'S' ? 1 : o.k === 'F' ? 2 : 0);
    objs.sort((a, b) => tail(a) - tail(b));
    const dynamic = [];
    for (let i = 0; i < w * h; i++) {
      const t = base[i];
      if (t === T.POOL || t === T.CRACK || t === T.CUP || t === T.GLASS || t === T.MOSS) dynamic.push(i);
    }
    const level = { w, h, base, partner, portalId, hasPillars, dynamic, objCount: objs.length };
    const state = { tiles: base.slice(), objs, turn: 0 };
    return { level, state };
  }

  function cloneState(S) {
    return { tiles: S.tiles.slice(), objs: S.objs.map((o) => ({ k: o.k, x: o.x, y: o.y, s: o.s })), turn: S.turn };
  }

  function pillarUp(tile, turn) {
    return (tile === T.PILLAR_A && (turn & 1) === 0) || (tile === T.PILLAR_B && (turn & 1) === 1);
  }

  // Are the given pillar/gate tiles solid right now (at rest)? Used by the renderer.
  function occupancy(L, S) {
    const occ = new Int16Array(L.w * L.h).fill(-1);
    S.objs.forEach((o, i) => { if (o.s === ACTIVE) occ[o.y * L.w + o.x] = i; });
    return occ;
  }
  function isPressed(L, S) {
    for (const o of S.objs) if (o.s === ACTIVE && S.tiles[o.y * L.w + o.x] === T.PLATE) return true;
    return false;
  }
  function restView(L, S) {
    const occ = occupancy(L, S);
    const pressed = isPressed(L, S);
    const solid = new Uint8Array(L.w * L.h);
    for (let i = 0; i < L.w * L.h; i++) {
      const t = S.tiles[i];
      if (t === T.PILLAR_A || t === T.PILLAR_B) solid[i] = pillarUp(t, S.turn) && occ[i] < 0 ? 1 : 0;
      else if (t === T.GATE) solid[i] = !pressed && occ[i] < 0 ? 1 : 0;
      else if (t === T.IGATE) solid[i] = pressed && occ[i] < 0 ? 1 : 0;
    }
    return { occ, pressed, solid };
  }

  const mergeable = (a, b) => (isBall(a.k) && b.k === 'u') || (a.k === 'u' && isBall(b.k));

  /**
   * Tilt the world in direction `dir`.
   * Returns { state, moved, result: 'none'|'win'|'fail', loop, ticks }
   * When `record` is true, ticks[] holds per-tick positions and events for animation.
   */
  // Scratch buffers reused between tilts (the solver calls step() hundreds of thousands of times).
  let scr = null;
  function scratch(N, n) {
    if (!scr || scr.N < N || scr.n < n) {
      scr = {
        N: Math.max(N, 64), n: Math.max(n, 8),
        occ: new Int16Array(Math.max(N, 64)), claims: new Int16Array(Math.max(N, 64)),
        pillarSolid: new Uint8Array(Math.max(N, 64)), weak: new Uint8Array(Math.max(N, 64)),
        dirs: new Int8Array(Math.max(n, 8)), stuck: new Uint8Array(Math.max(n, 8)),
        tgt: new Int32Array(Math.max(n, 8)), viaPortal: new Uint8Array(Math.max(n, 8)),
        momentum: new Uint8Array(Math.max(n, 8)), rang: new Uint8Array(Math.max(n, 8)),
        ndir: new Int8Array(Math.max(n, 8)), via: new Int32Array(Math.max(n, 8)),
      };
    }
    return scr;
  }

  function step(L, S0, dir, record) {
    const w = L.w, h = L.h, N = w * h;
    const S = cloneState(S0);
    const tiles = S.tiles, objs = S.objs, n = objs.length;
    const B = scratch(N, n);
    const dirs = B.dirs, stuck = B.stuck, occ = B.occ, tgt = B.tgt, viaPortal = B.viaPortal, claims = B.claims;
    // momentum: has this thing already rolled during this tilt? (bells and glass only answer to a run-up)
    const momentum = B.momentum, rang = B.rang;
    // ndir: direction after the move (rails turn it); via: first rail crossed this tick (claimed like a target)
    const ndir = B.ndir, via = B.via;
    const paths = record ? [] : null;
    for (let i = 0; i < n; i++) { dirs[i] = objs[i].k === 'R' ? MIRROR_H[dir] : dir; stuck[i] = 0; momentum[i] = 0; rang[i] = 0; }

    // Pillars are fixed for the whole tilt.
    const pillarSolid = B.pillarSolid;
    pillarSolid.fill(0);
    occ.fill(-1);
    for (let i = 0; i < n; i++) if (objs[i].s === ACTIVE) occ[objs[i].y * w + objs[i].x] = i;
    if (L.hasPillars) for (let c = 0; c < N; c++) pillarSolid[c] = pillarUp(tiles[c], S.turn) && occ[c] < 0 ? 1 : 0;

    const weak = B.weak;
    weak.fill(0);
    for (let i = 0; i < n; i++) {
      const o = objs[i];
      if (o.s === ACTIVE && tiles[o.y * w + o.x] === T.CRACK) weak[o.y * w + o.x] = 1;
    }

    const ticks = record ? [] : null;
    let moved = false, loop = true, result = 'none';
    // clash: two moving things stopped each other and at least one was going somewhere the tilt didn't send it
    // (a bell, current, bend or well turned it). Twins meeting in the middle are not a clash; levels must never need one.
    let clash = false, rung = 0;
    const natural = (i) => (objs[i].k === 'R' ? MIRROR_H[dir] : dir);
    const turned = (i) => dirs[i] !== natural(i) || via[i] >= 0 || viaPortal[i] === 1;
    const maxTicks = N * 3 + 8;

    for (let t = 0; t < maxTicks; t++) {
      occ.fill(-1);
      let pressed = false;
      for (let i = 0; i < n; i++) {
        const o = objs[i];
        if (o.s !== ACTIVE) continue;
        const c = o.y * w + o.x;
        occ[c] = i;
        if (tiles[c] === T.PLATE) pressed = true;
      }
      // Desired targets
      const rings = record ? [] : null;
      const probe = (i) => {
        const o = objs[i];
        let x = o.x, y = o.y, d = dirs[i];
        via[i] = -1; if (record) paths[i] = [];
        for (let hop = 0; hop < 9; hop++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) return -1;
          let c = ny * w + nx;
          const tt = tiles[c];
          if (tt === T.VOID || tt === T.WALL) return -1;
          if (tt === T.GATE && !pressed && occ[c] < 0) return -1;
          if (tt === T.IGATE && pressed && occ[c] < 0) return -1;
          if (pillarSolid[c]) return -1;
          if (tt === T.GLASS && !(o.k === 'S' && momentum[i])) return -1;   // only a rolling stone breaks glass
          if (tt === T.BELL) {
            if (!momentum[i] || rang[i]) return -1;                           // no run-up, or already rang: a wall
            rang[i] = 1; rung++; dirs[i] = REVERSE[dirs[i]];                  // back the way it came, through the same bends
            if (record) rings.push({ t: 'bell', o: i, x: nx, y: ny });
            return probe(i);
          }
          if (tt === T.RAIL_F || tt === T.RAIL_B) {                         // swept round the bend in the same move
            d = (tt === T.RAIL_F ? RAIL_F_MAP : RAIL_B_MAP)[d];
            if (via[i] < 0) via[i] = c;
            if (record) paths[i].push(c);
            x = nx; y = ny; continue;
          }
          if (tt === T.PORTAL && L.partner[c] >= 0) { c = L.partner[c]; viaPortal[i] = 1; }
          ndir[i] = d;
          return c;
        }
        return -1;   // bends that close on themselves
      };
      for (let i = 0; i < n; i++) {
        tgt[i] = -1; viaPortal[i] = 0;
        const o = objs[i];
        if (o.s !== ACTIVE || stuck[i]) continue;
        tgt[i] = probe(i);
      }
      // Resolve collisions until stable
      let changed = true;
      while (changed) {
        changed = false;
        claims.fill(0);
        for (let i = 0; i < n; i++) if (tgt[i] >= 0) claims[tgt[i]]++;
        for (let i = 0; i < n; i++) if (tgt[i] >= 0 && via[i] >= 0) claims[via[i]]++;
        for (let i = 0; i < n; i++) {
          if (tgt[i] >= 0 && via[i] >= 0 && claims[via[i]] >= 2) { tgt[i] = -1; changed = true; clash = true; }   // one at a time through a bend
        }
        if (changed) continue;
        for (let i = 0; i < n; i++) {
          const c = tgt[i];
          if (c < 0 || claims[c] < 2) continue;
          let ok = false;
          let rivalTurned = false;
          for (let j = 0; j < n; j++) if (j !== i && tgt[j] === c) { if (claims[c] === 2) ok = mergeable(objs[i], objs[j]); if (turned(j)) rivalTurned = true; }
          if (!ok) { if (turned(i) || rivalTurned) clash = true; tgt[i] = -1; changed = true; }
        }
        if (changed) continue;
        for (let i = 0; i < n; i++) {
          const c = tgt[i];
          if (c < 0) continue;
          const o = occ[c];
          if (o < 0 || o === i) continue;
          const here = objs[i].y * w + objs[i].x;
          if (mergeable(objs[i], objs[o])) {
            if (tgt[o] === here) { // head-on meeting: the hollow waits, the pebble drops in
              if (objs[o].k === 'u') { tgt[o] = -1; changed = true; }
            }
            continue;
          }
          if (tgt[o] === here && (turned(i) || turned(o))) clash = true;
          if (tgt[o] < 0 || tgt[o] === here) { tgt[i] = -1; changed = true; }
        }
      }
      // Apply
      let any = false;
      const ev = record ? rings : null;
      for (let i = 0; i < n; i++) {
        if (tgt[i] < 0) continue;
        const o = objs[i];
        if (record && via[i] >= 0) ev.push({ t: 'rail', o: i, x: via[i] % w, y: (via[i] / w) | 0, path: paths[i] });
        if (record && viaPortal[i]) {
          const p = paths[i].length ? paths[i][paths[i].length - 1] : -1;
          const fx = p >= 0 ? (p % w) + DX[ndir[i]] : o.x + DX[dirs[i]], fy = p >= 0 ? ((p / w) | 0) + DY[ndir[i]] : o.y + DY[dirs[i]];
          ev.push({ t: 'well', o: i, fx, fy });
        }
        dirs[i] = ndir[i];
        o.x = tgt[i] % w; o.y = (tgt[i] / w) | 0;
        momentum[i] = 1;
        any = true;
      }
      if (!any) { loop = false; break; }
      moved = true;
      // What happens where things arrived
      let lost = false;
      for (let i = 0; i < n; i++) {
        if (tgt[i] < 0) continue;
        const o = objs[i];
        const c = o.y * w + o.x;
        const tt = tiles[c];
        if (tt === T.CRACK && o.k === 'F') { tiles[c] = T.POOL; weak[c] = 0; o.s = GONE; if (record) ev.push({ t: 'melt', o: i, x: o.x, y: o.y }); }
        else if (tt === T.CRACK) weak[c] = 1;
        else if (tt === T.GLASS) { tiles[c] = T.FLOOR; if (record) ev.push({ t: 'shatter', o: i, x: o.x, y: o.y }); }
        else if (isCurrent(tt)) { dirs[i] = tt - T.CUR_U; if (record) ev.push({ t: 'current', o: i, x: o.x, y: o.y }); }
        else if (tt === T.MOSS) {
          stuck[i] = 1;
          if (o.k === 'F') { tiles[c] = T.FLOOR; if (record) ev.push({ t: 'burn', o: i, x: o.x, y: o.y }); }   // it stops, and the moss is gone
          else if (record) ev.push({ t: 'moss', o: i, x: o.x, y: o.y });
        }
        else if (tt === T.POOL && o.k === 'F') { o.s = GONE; if (record) ev.push({ t: 'douse', o: i, x: o.x, y: o.y }); }   // the water stays
        else if (tt === T.POOL) {
          if (o.k === 'S') { tiles[c] = T.FILLED; o.s = GONE; if (record) ev.push({ t: 'fill', o: i, x: o.x, y: o.y }); }
          else { o.s = LOST; lost = true; if (record) ev.push({ t: 'sink', o: i, x: o.x, y: o.y }); }
        } else if (tt === T.CUP && isBall(o.k)) {
          tiles[c] = T.CUPFULL; o.s = HOME; if (record) ev.push({ t: 'home', o: i, x: o.x, y: o.y });
        }
      }
      // Pebble meets loose hollow
      for (let i = 0; i < n; i++) {
        const a = objs[i];
        if (a.s !== ACTIVE || a.k !== 'u') continue;
        for (let j = 0; j < n; j++) {
          const b = objs[j];
          if (b.s === ACTIVE && isBall(b.k) && b.x === a.x && b.y === a.y) {
            a.s = GONE; b.s = HOME;
            if (record) ev.push({ t: 'home', o: j, cup: i, x: a.x, y: a.y });
            break;
          }
        }
      }
      // Cracked ground gives way once vacated
      occ.fill(-1);
      for (let i = 0; i < n; i++) if (objs[i].s === ACTIVE) occ[objs[i].y * w + objs[i].x] = i;
      for (let c = 0; c < N; c++) {
        if (weak[c] && tiles[c] === T.CRACK && occ[c] < 0) {
          tiles[c] = T.POOL; weak[c] = 0;
          if (record) ev.push({ t: 'crumble', x: c % w, y: (c / w) | 0 });
        }
      }
      if (record) ticks.push({ pos: objs.map((o, i) => [o.x, o.y, o.s, dirs[i]]), ev, tiles: tiles.slice() });
      if (lost) { result = 'fail'; loop = false; break; }
    }

    if (result !== 'fail') {
      let allHome = true, anyBall = false;
      for (const o of objs) {
        if (isBall(o.k)) { anyBall = true; if (o.s !== HOME) allHome = false; }
        if (o.s === LOST) result = 'fail';
      }
      if (result !== 'fail' && anyBall && allHome) result = 'win';
    }
    if (moved) S.turn++;
    return { state: moved ? S : S0, moved, result, loop, ticks, clash, rung };
  }

  function key(L, S) {
    let k = '';
    const stones = [], embers = [];
    for (const o of S.objs) {
      if (o.k === 'S') { if (o.s === ACTIVE) stones.push(o.y * L.w + o.x); }
      else if (o.k === 'F') { if (o.s === ACTIVE) embers.push(o.y * L.w + o.x); }
      else k += o.s === ACTIVE ? (o.y * L.w + o.x) + ',' : '#' + o.s + ',';
    }
    stones.sort((a, b) => a - b); embers.sort((a, b) => a - b);
    k += '|' + stones.join(',') + '|';
    if (embers.length) k += embers.join(',') + '|';
    for (const c of L.dynamic) k += S.tiles[c];
    if (L.hasPillars) k += '|' + (S.turn & 1);
    return k;
  }

  /**
   * Breadth-first search for the shortest solution.
   * Returns { solvable, moves:[dir...], explored, capped, loops }
   */
  function solve(L, S0, opts) {
    const cap = (opts && opts.cap) || 400000;
    const start = key(L, S0);
    const seen = new Map();
    seen.set(start, null);
    let frontier = [{ S: S0, k: start }];
    let explored = 0, loops = 0;
    while (frontier.length) {
      const next = [];
      for (const node of frontier) {
        explored++;
        for (let d = 0; d < 4; d++) {
          const r = step(L, node.S, d, false);
          if (!r.moved) continue;
          if (r.loop) { loops++; continue; }
          if (r.result === 'fail') continue;
          const k = key(L, r.state);
          if (seen.has(k)) continue;
          seen.set(k, { p: node.k, d });
          if (r.result === 'win') {
            const moves = [];
            let cur = k;
            while (seen.get(cur)) { const e = seen.get(cur); moves.push(e.d); cur = e.p; }
            moves.reverse();
            return { solvable: true, moves, explored, capped: false, loops, states: seen.size };
          }
          next.push({ S: r.state, k });
        }
        if (seen.size > cap) return { solvable: false, moves: null, explored, capped: true, loops, states: seen.size };
      }
      frontier = next;
    }
    return { solvable: false, moves: null, explored, capped: false, loops, states: seen.size };
  }

  function toRows(L, S) {
    const rows = [];
    const occ = occupancy(L, S);
    for (let y = 0; y < L.h; y++) {
      let r = '';
      for (let x = 0; x < L.w; x++) {
        const c = y * L.w + x;
        if (occ[c] >= 0) r += S.objs[occ[c]].k;
        else if (S.tiles[c] === T.PORTAL) r += String(L.portalId[c]);
        else r += TILE_CHAR[S.tiles[c]];
      }
      rows.push(r);
    }
    return rows;
  }

  return {
    T, DX, DY, ACTIVE, HOME, LOST, GONE, isBall, pillarUp, isCurrent,
    parse, step, solve, key, cloneState, restView, isPressed, occupancy, toRows,
    DIR_NAMES: ['up', 'right', 'down', 'left'], DIR_CHARS: 'URDL',
  };
});
