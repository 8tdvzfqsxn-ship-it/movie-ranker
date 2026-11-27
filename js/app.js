// Film Ranker: screens and buttons.
import { createStore, isPractice, STATUSES } from './store.js?v=18';
import * as practiceCatalog from './catalog.js?v=18';
import { createLiveCatalog } from './catalog-live.js?v=18';

// The iPhone Duo's inside screen (lessons from Song Ranker). Safari doesn't tell pages where the fold is, so the
// layout goes by screen size: about 669 × 951 points held tall, 951 × 669 held wide (fold down the middle).
// Regular iPhones, upright or sideways, never match these.
const duoTall = matchMedia('(min-width: 640px) and (max-width: 699px) and (min-height: 700px)');
const duoWide = matchMedia('(min-width: 900px) and (max-width: 1000px) and (min-height: 450px) and (max-height: 700px)');
// Held wide, the tabs sit in the strip under the clock (style.css v10). They start 222 points down the screen, which
// clears the clock, Wi-Fi, battery and the music ring; when Safari's own bars take some of the screen, the page
// starts lower, so the column moves up by the same amount (Song Ranker's measurement, v25–v26).
const DUO_SHORT = 669;
const fitScreen = () => {
  const root = document.documentElement;
  root.classList.toggle('duo-tall', duoTall.matches);
  root.classList.toggle('duo-wide', duoWide.matches);
  if (duoWide.matches) root.style.setProperty('--rail-top', `${Math.max(16, 222 - Math.max(0, DUO_SHORT - innerHeight))}px`);
};
addEventListener('resize', fitScreen);
duoTall.addEventListener('change', fitScreen);
duoWide.addEventListener('change', fitScreen);
fitScreen();

const store = await createStore();
// Practice mode searches the built-in list; live mode searches TMDB and OMDb through Supabase.
const catalog = isPractice ? practiceCatalog : createLiveCatalog((body) => store.call(body));
const state = { tab: 'rank', query: '', order: 'release', tag: '', open: new Set(), friend: null, trending: null, view: 'list' };
try { state.view = localStorage.getItem('movie-ranker:view') || 'list'; } catch { /* private window */ }
const VERSION = document.querySelector('.version')?.textContent || '';

const MOMENTS = ['Date night', 'Comfort movie', 'Family night', 'With friends', 'Rainy day', 'Holiday', 'Rewatch often'];
const BANDS = [[90, 'All-time favorite'], [75, 'Loved it'], [60, 'Liked it'], [40, 'It was fine'], [20, "Didn't like it"], [1, 'Hated it']];
const NEW_SCORE = 50; // the middle, so people move the slider on purpose

const band = (s) => BANDS.find(([min]) => s >= min)[1];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel) => document.querySelector(sel);
const scoreOf = (m) => store.get(m.id)?.score;
const movieById = (id) => catalog.byId(id) || store.get(id)?.movie || store.friendMovie(id);

// ---------- pieces ----------

function poster(m, size = '') {
  if (m.poster) return `<img class="poster ${size}" src="${esc(m.poster)}" alt="" loading="lazy">`;
  let h = 0;
  for (const c of m.title) h = (h * 31 + c.charCodeAt(0)) % 360;
  // Use the part after a colon ("Star Wars: A New Hope" → NH) and skip little words.
  const name = m.title.includes(':') ? m.title.split(':').pop() : m.title;
  const words = name.split(/\s+/).filter((w) => w && !/^(the|of|a|an|and)$/i.test(w));
  const initials = ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase();
  return `<div class="poster ${size}" style="--h:${h}" aria-hidden="true">${esc(initials)}</div>`;
}

// Best friends who have seen this movie get a small round icon with their first letter.
// Regular friends never show here; you see them only when you open Compare.
function seenIcons(m) {
  const seen = store.friends().filter((f) => f.status === 'best' && f.ratings[m.id] != null);
  if (!seen.length) return '';
  const names = seen.map((f) => f.name).join(', ');
  return `<span class="seen" title="Seen by ${esc(names)}" aria-label="Seen by ${esc(names)}">${
    seen.slice(0, 3).map((f) => `<span class="dot">${esc(f.name[0].toUpperCase())}</span>`).join('')}${
    seen.length > 3 ? `<span class="dot more">+${seen.length - 3}</span>` : ''}</span>`;
}

function movieRow(m, { num, label, extra = '' } = {}) {
  const r = store.get(m.id);
  const meta = [m.year, label, ...(r?.tags || [])].filter(Boolean).map(esc).join(' · ');
  return `<li class="movie">
    ${num ? `<span class="num">${num}</span>` : ''}
    ${poster(m)}
    <div class="info"><div class="title">${esc(m.title)}</div><div class="muted small">${meta}</div>${
      r?.note ? `<div class="note">${esc(r.note)}</div>` : ''}${extra}</div>
    ${seenIcons(m)}
    ${r ? `<button class="score" data-rate="${esc(m.id)}" aria-label="Score ${r.score}. Change it">${r.score}</button>`
        : `<button class="primary" data-rate="${esc(m.id)}">Rank</button>`}
  </li>`;
}

function ordered(g) {
  if (state.order === 'story' && g.storyOrder) return g.storyOrder;
  if (state.order === 'score') return [...g.movies].sort((a, b) => (scoreOf(b) ?? -1) - (scoreOf(a) ?? -1));
  return g.movies; // release order: the first movie comes first
}

function average(g) {
  const scores = g.movies.map(scoreOf).filter((s) => s != null);
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
}

const KIND = { franchise: 'Franchise', series: 'Series', show: 'TV show', movie: 'Movie' };

function groupCard(g, { collapsible = true } = {}) {
  const ms = ordered(g);
  const ranked = g.movies.filter((m) => scoreOf(m) != null).length;
  const avg = average(g);
  const rowLabel = (m) => (g.kind === 'franchise' ? m.seriesName : g.kind === 'show' && m.episodes ? `${m.episodes} episodes` : '');
  const sub = g.kind === 'movie' ? '' :
    `<div class="muted small">${g.kind === 'show' && g.movies[0]?.year ? `Started ${g.movies[0].year} · ` : ''}${ranked} of ${g.movies.length} ${
      g.kind === 'show' ? (g.movies.length === 1 ? 'season ' : 'seasons ') : ''}ranked${g.storyOrder ? ' · has story order' : ''}</div>`;
  const head = `<div class="grow"><div class="kind">${KIND[g.kind]}</div><div class="title">${esc(g.name)}</div>${sub}</div>
    ${avg != null && g.kind !== 'movie' ? `<span class="score" title="Average of your scores">${avg}</span>` : ''}`;
  const list = `<ol class="movies">${ms.map((m) => movieRow(m, { label: rowLabel(m) })).join('')}</ol>`;
  if (g.kind === 'movie') return `<div class="card group"><ol class="movies">${movieRow(g.movies[0])}</ol></div>`;
  if (!collapsible) return `<div class="card group"><div class="head">${head}</div>${list}</div>`;
  return `<details class="card group" data-key="${esc(g.key)}" ${state.open.has(g.key) ? 'open' : ''}>
    <summary>${head}</summary>${list}</details>`;
}

function orderSwitch(note) {
  const b = (v, label) => `<button data-order="${v}" class="${state.order === v ? 'on' : ''}">${label}</button>`;
  return `<div class="seg" role="group" aria-label="Order">${b('release', 'Release order')}${b('story', 'Story order')}${b('score', 'My scores')}</div>
    <p class="muted small">${state.order === 'story' ? note : '&nbsp;'}</p>`;
}

// ---------- screens ----------

// Suggestions under the search box: live, what's trending on TMDB this week; practice, a fixed list.
function rankScreen() {
  const tries = catalog.live ? (state.trending || []) : ['Star Wars', 'Marvel', 'Toy Story', 'Harry Potter', 'Lord of the Rings', 'Jaws'];
  if (catalog.live && state.trending === null) loadTrending();
  return `<div class="pane-head"><h1>${catalog.live ? 'Rank a movie or show' : 'Rank a movie'}</h1>
    <input type="search" id="q" placeholder="${catalog.live ? 'Search a movie, TV show, series or franchise' : 'Search a movie, series or franchise'}" value="${esc(state.query)}" autocomplete="off">
    <div class="chips" ${state.query || !tries.length ? 'hidden' : ''}>${catalog.live && tries.length ? '<span class="chips-label">Trending this week</span>' : ''}${
      tries.map((t) => `<button class="chip" data-try="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
    <div class="pane-list"><div id="results"></div></div>`;
}

async function loadTrending() {
  state.trending = [];
  try { state.trending = await catalog.trending(); } catch { state.trending = []; }
  if (state.tab === 'rank' && !state.query) render();
}

// Shows search results. Live search waits until typing pauses, and ignores answers to older searches.
let searchTimer;
let searchCount = 0;
function showResults() {
  const box = $('#results');
  if (!box) return;
  const query = state.query.trim();
  clearTimeout(searchTimer);
  if (!query) {
    box.innerHTML = `<p class="muted small">Series come back together, with the first movie at the top.${
      catalog.live ? ' TV shows come with their seasons, Season 1 first.' : ''}${
      isPractice ? ` Practice mode has ${catalog.catalogSize} movies to try.` : ''}</p>`;
    return;
  }
  const mine = ++searchCount;
  const show = (html) => { if (mine === searchCount && $('#results')) $('#results').innerHTML = html; };
  const run = async () => {
    if (catalog.live) show('<p class="muted small">Searching…</p>');
    try {
      const groups = await catalog.search(query);
      show(groups.length ? groups.map((g) => groupCard(g, { collapsible: false })).join('')
        : `<p class="empty">No movies found for “${esc(query)}”.</p>`);
    } catch (e) {
      show(`<p class="empty">${esc(e.message || 'Search didn’t work. Try again.')}</p>`);
    }
  };
  if (catalog.live) searchTimer = setTimeout(run, 350); else run();
}

function listScreen() {
  const all = store.all().sort((a, b) => b.score - a.score || a.movie.title.localeCompare(b.movie.title));
  if (!all.length) return `<div class="pane-head"><h1>My list</h1><p class="empty">Nothing ranked yet. Start on the Rank tab.</p></div>`;
  const tags = [...new Set(all.flatMap((r) => r.tags))];
  if (state.tag && !tags.includes(state.tag)) state.tag = '';
  const shown = state.tag ? all.filter((r) => r.tags.includes(state.tag)) : all;
  const view = VIEWS[state.view] ? state.view : 'list';
  const switcher = `<div class="views" role="group" aria-label="View">${Object.entries(VIEWS).map(([key, v]) =>
    `<button data-view="${key}" class="${view === key ? 'on' : ''}" aria-label="${v.name}" aria-pressed="${view === key}" title="${v.name}">${v.icon}</button>`).join('')}</div>`;
  return `<div class="pane-head"><h1>My list</h1><div class="list-bar"><p class="muted small">${all.length} ranked, highest first.</p>${switcher}</div>
    ${tags.length ? `<div class="chips"><button class="chip ${state.tag ? '' : 'on'}" data-tag="">All</button>${
      tags.map((t) => `<button class="chip ${state.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}</div>
    <div class="pane-list">${VIEWS[view].render(shown.map((r) => movieById(r.movie.id)), shown)}</div>`;
}

// My list can be shown three ways; the choice is remembered on this device.
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const VIEWS = {
  list: {
    name: 'List', icon: svg('<rect x="3" y="4" width="5" height="7" rx="1"/><rect x="3" y="13" width="5" height="7" rx="1"/><path d="M11 6h10M11 9h6M11 15h10M11 18h6"/>'),
    render: (movies, rs) => `<div class="card"><ol class="movies">${movies.map((m, i) => movieRow(m, { num: i + 1, label: rs[i].movie.seriesName })).join('')}</ol></div>`,
  },
  grid: {
    name: 'Grid', icon: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
    render: (movies) => `<ol class="grid">${movies.map((m, i) => `<li><button class="tile" data-rate="${esc(m.id)}" aria-label="${esc(m.title)}, number ${i + 1}, score ${scoreOf(m)}. Change it">
      ${poster(m, 'fill')}<span class="rank">${i + 1}</span><span class="gscore">${scoreOf(m)}</span>${seenIcons(m)}</button>
      <div class="gtitle">${esc(m.title)}</div></li>`).join('')}</ol>`,
  },
  compact: {
    name: 'Compact', icon: svg('<path d="M4 5h16M4 9.7h16M4 14.3h16M4 19h16"/>'),
    render: (movies) => `<div class="card"><ol class="movies compact">${movies.map((m, i) => `<li class="movie">
      <span class="num">${i + 1}</span><div class="info"><span class="title">${esc(m.title)}</span> <span class="muted small">${m.year || ''}</span></div>
      ${seenIcons(m)}<button class="score" data-rate="${esc(m.id)}" aria-label="Score ${scoreOf(m)}. Change it">${scoreOf(m)}</button></li>`).join('')}</ol></div>`,
  },
};
const VIEW_KEY = 'movie-ranker:view';

// Practice mode lists every series and franchise in the built-in list. Live mode lists the ones
// you've ranked a movie from, each with all of its movies.
async function groupsFor(kind) {
  if (!catalog.live) return kind === 'series' ? catalog.seriesGroups : catalog.franchiseGroups;
  const keys = [...new Set(store.all().map((r) => (kind === 'series' ? r.movie.series : r.movie.franchise)).filter(Boolean))];
  const loaded = await Promise.allSettled(keys.map((k) => (kind === 'series' ? catalog.series(k) : catalog.franchise(k))));
  return loaded.filter((x) => x.status === 'fulfilled' && x.value).map((x) => x.value);
}

function groupsScreen(title, intro, groups, note) {
  const started = groups.filter((g) => average(g) != null).sort((a, b) => average(b) - average(a));
  const rest = groups.filter((g) => average(g) == null);
  const empty = catalog.live ? 'Rank a movie that’s part of one to see it here.' : 'Rank a movie from any of these to see its score here.';
  return `<div class="pane-head"><h1>${title}</h1><p class="muted small">${intro}</p>${orderSwitch(note)}</div>
    <div class="pane-list">${started.length ? started.map((g) => groupCard(g)).join('') : `<p class="empty">${empty}</p>`}
    ${rest.length ? `<h3>Not started</h3>${rest.map((g) => groupCard(g)).join('')}` : ''}</div>`;
}

function friendsScreen() {
  const friends = store.friends();
  const me = store.me();
  const card = (f) => {
    const count = Object.keys(f.ratings).length;
    const seg = Object.entries(STATUSES).map(([v, label]) =>
      `<button data-status="${v}" data-id="${esc(f.id)}" class="${f.status === v ? 'on' : ''}">${label}</button>`).join('');
    return `<div class="card friend">
      <div class="head"><div class="avatar">${esc(f.name[0].toUpperCase())}</div>
        <div class="grow"><div class="title">${esc(f.name)}</div><div class="muted small">${count} movie${count === 1 ? '' : 's'} ranked</div></div>
        <button class="primary" data-compare="${esc(f.id)}">Compare</button></div>
      <div class="seg" role="group" aria-label="Status for ${esc(f.name)}">${seg}</div>
      <div class="friend-foot"><span class="muted small">${f.status === 'best'
        ? 'Shows an icon on movies they’ve seen.' : 'Stays out of the way until you compare.'}</span>
        <span class="foot-btns"><button class="danger small" data-report="${esc(f.id)}">Report</button>
        <button class="danger small" data-unfriend="${esc(f.id)}">Remove</button></span></div>
    </div>`;
  };
  return `<div class="pane-head"><h1>Friends</h1>
    <p class="muted small">Make a friend a <b>Best friend</b> to see a small icon with their letter on every movie
      they’ve seen. Regular friends stay out of the way until you open Compare.</p>
    <div class="addtag"><input type="text" id="f-code" placeholder="Friend code" autocomplete="off" autocapitalize="characters">
      <button class="primary" id="f-add">Add friend</button></div>
    <p class="err small" id="f-err"></p>
    ${isPractice ? '<p class="muted small">Practice mode: try the codes <b>SAM123</b> and <b>JORDAN7</b>.</p>'
      : `<p class="muted small">Your friend code is <b>${esc(me.code)}</b>. Send it to a friend so they can add you.</p>`}</div>
    <div class="pane-list">${requestsHtml()}
    ${friends.length ? friends.map(card).join('') : '<p class="empty">No friends yet.</p>'}
</div>`;
}

// Friend requests waiting on you (Accept) or on them.
function requestsHtml() {
  const { incoming, outgoing } = store.requests();
  if (!incoming.length && !outgoing.length) return '';
  const row = (p, action) => `<li class="movie"><div class="avatar">${esc(p.name[0].toUpperCase())}</div>
    <div class="info"><div class="title">${esc(p.name)}</div></div>${action}</li>`;
  return `<h3>Friend requests</h3><div class="card"><ol class="movies">${
    incoming.map((p) => row(p, `<button class="primary" data-accept="${esc(p.id)}">Accept</button>
      <button class="danger small" data-unfriend="${esc(p.id)}" aria-label="Decline ${esc(p.name)}">Decline</button>
      <button class="danger small" data-report="${esc(p.id)}" aria-label="Report or block ${esc(p.name)}">Block</button>`)).join('')}${
    outgoing.map((p) => row(p, `<span class="muted small">Waiting for them</span>`)).join('')}</ol></div>`;
}

function compareScreen() {
  const f = store.friend(state.friend);
  if (!f) { state.tab = 'friends'; return friendsScreen(); }
  const mine = Object.fromEntries(store.all().map((r) => [r.movie.id, r.score]));
  const both = Object.keys(f.ratings).filter((id) => mine[id] != null && movieById(id))
    .map((id) => ({ m: movieById(id), me: mine[id], them: f.ratings[id] }));
  const diff = (x) => Math.abs(x.me - x.them);
  const agree = both.length ? Math.round(100 - both.reduce((s, x) => s + diff(x), 0) / both.length) : null;
  const bothLove = both.filter((x) => x.me >= 75 && x.them >= 75).sort((a, b) => b.me + b.them - a.me - a.them);
  const apart = both.filter((x) => diff(x) >= 20).sort((a, b) => diff(b) - diff(a)).slice(0, 5);
  const theirPicks = Object.entries(f.ratings).filter(([id, s]) => s >= 75 && mine[id] == null && movieById(id))
    .sort((a, b) => b[1] - a[1]).map(([id, s]) => ({ m: movieById(id), them: s }));
  const myPicks = store.all().filter((r) => r.score >= 75 && f.ratings[r.movie.id] == null).sort((a, b) => b.score - a.score);

  // Notes on a movie: yours, then your friend's (named).
  const notes = (id) => [store.get(id)?.note && `<div class="note">${esc(store.get(id).note)}</div>`,
    f.notes?.[id] && `<div class="note"><b>${esc(f.name)}:</b> ${esc(f.notes[id])}</div>`].filter(Boolean).join('');
  const pairRow = (x) => `<li class="movie">${poster(x.m)}
    <div class="info"><div class="title">${esc(x.m.title)}</div><div class="muted small">${x.m.year}</div>${notes(x.m.id)}</div>
    <div class="pair"><span><small>You</small>${x.me}</span><span><small>${esc(f.name)}</small>${x.them}</span></div></li>`;
  const section = (title, rows, emptyText) => `<h3>${title}</h3>${rows.length
    ? `<div class="card"><ol class="movies">${rows.join('')}</ol></div>` : `<p class="muted small">${emptyText}</p>`}`;

  return `<div class="pane-head"><button class="link" data-tab="friends">‹ Friends</button>
    <h1>You and ${esc(f.name)}</h1>
    <div class="card agree"><div class="big">${agree == null ? '–' : `${agree}%`}</div>
      <div class="muted small">${agree == null
        ? `Rank some movies ${esc(f.name)} has seen to find out how close your tastes are.`
        : `How close your scores are, across the ${both.length} movie${both.length === 1 ? '' : 's'} you’ve both ranked.`}</div></div></div>
    <div class="pane-list">${section('You both love', bothLove.map(pairRow), 'No shared favorites yet (75 and up from both of you).')}
    ${section('Where you disagree', apart.map(pairRow), 'Nothing yet with 20 or more points between you.')}
    ${section(`${esc(f.name)} loved, you haven’t ranked`, theirPicks.map((x) => movieRow(x.m, { label: `${f.name} gave it ${x.them}`, extra: notes(x.m.id) })),
      `You’ve ranked everything ${esc(f.name)} loved.`)}
    ${section(`Your favorites ${esc(f.name)} hasn’t ranked`, myPicks.map((r) => pairRow({ m: movieById(r.movie.id), me: r.score, them: '–' })),
      'Nothing here yet.')}</div>`;
}

function render() {
  const tabOn = state.tab === 'compare' ? 'friends' : state.tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tabOn));
  const screens = {
    rank: rankScreen,
    list: listScreen,
    friends: friendsScreen,
    compare: compareScreen,
    series: async () => groupsScreen('Series', catalog.live
      ? 'Movie series and TV shows, scored by the average of the movies or seasons you’ve ranked.'
      : 'Trilogies and other series, scored by the average of the movies you’ve ranked.',
      await groupsFor('series'), 'Story order only changes Star Wars. The others stay in release order.'),
    franchises: async () => groupsScreen('Franchises', 'Bigger groups like Marvel, which hold several series.',
      await groupsFor('franchise'), 'Story order changes Marvel, Star Wars and Middle-earth. The others stay in release order.'),
  };
  const tab = state.tab;
  const out = screens[tab]();
  if (typeof out === 'string') $('#app').innerHTML = out;
  else {
    if (!$('#app').dataset.tab || $('#app').dataset.tab !== tab) $('#app').innerHTML = '<p class="muted center">Loading…</p>';
    out.then((html) => { if (state.tab === tab) $('#app').innerHTML = html; })
      .catch((e) => { if (state.tab === tab) $('#app').innerHTML = `<p class="empty">${esc(e.message || 'Couldn’t load this.')}</p>`; });
  }
  $('#app').dataset.tab = tab;
  if (tab === 'rank') showResults();
}

// ---------- ranking a movie ----------

function openRate(id) {
  const m = movieById(id);
  if (!m) return;
  const existing = store.get(id);
  let score = existing?.score ?? NEW_SCORE;
  const tags = new Set(existing?.tags || []);
  const root = $('#modal-root');

  const tagChips = () => [...new Set([...MOMENTS, ...store.customTags(), ...tags])]
    .map((t) => `<button class="chip ${tags.has(t) ? 'on' : ''}" data-mtag="${esc(t)}">${esc(t)}</button>`).join('');

  root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="Rank ${esc(m.title)}">
    <div class="film">${poster(m, 'big')}<div><h2>${esc(m.title)}</h2>
      <div class="muted small">${m.year}${m.seriesName ? ` · ${esc(m.seriesName)}` : ''}${m.franchise && m.franchise !== m.seriesName ? ` · ${esc(m.franchise)}` : ''}</div>
      <div class="muted small">${(m.genres || []).map(esc).join(', ')}</div></div></div>
    <div class="bigscore" id="m-score">${score}</div><div class="band" id="m-band">${band(score)}</div>
    <input id="m-range" type="range" min="1" max="100" value="${score}" aria-label="Score from 1 to 100">
    <h3>Moments</h3><div class="chips" id="m-tags">${tagChips()}</div>
    <div class="addtag"><input type="text" id="m-newtag" placeholder="Add your own moment" maxlength="30"><button id="m-addtag">Add</button></div>
    <h3>Note <span class="muted small">· optional · friends can see this</span></h3>
    <textarea id="m-note" rows="2" maxlength="280" placeholder="I watch this every Thanksgiving">${esc(existing?.note || '')}</textarea>
    <div class="actions">${existing ? '<button class="danger" id="m-remove">Remove</button>' : ''}
      <div class="right"><button id="m-cancel">Cancel</button><button class="primary" id="m-save">Save</button></div></div>
  </div></div>`;

  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const addTag = () => {
    const t = $('#m-newtag').value.trim().slice(0, 30);
    if (!t) return;
    tags.add(t);
    $('#m-tags').innerHTML = tagChips();
    $('#m-newtag').value = '';
    attempt(() => store.addTag(t));
  };

  root.querySelector('.modal-back').addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList.contains('modal-back') || t.id === 'm-cancel') close();
    else if (t.dataset.mtag != null) { tags.has(t.dataset.mtag) ? tags.delete(t.dataset.mtag) : tags.add(t.dataset.mtag); t.classList.toggle('on'); }
    else if (t.id === 'm-addtag') addTag();
    else if (t.id === 'm-remove') {
      t.disabled = true;
      attempt(() => store.remove(id), () => { close(); render(); toast(`Removed ${m.title}`); }, () => { t.disabled = false; });
    }
    else if (t.id === 'm-save') {
      t.disabled = true;
      t.textContent = 'Saving…';
      attempt(async () => { const full = await catalog.complete(m); await store.rate(full, score, [...tags], $('#m-note').value); return full; },
        (full) => { close(); render(); afterSave(full, score); },
        () => { t.disabled = false; t.textContent = 'Save'; });
    }
  });
  $('#m-newtag').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTag(); });
  $('#m-range').addEventListener('input', (e) => {
    score = Number(e.target.value);
    $('#m-score').textContent = score;
    $('#m-band').textContent = band(score);
  });
}

// After ranking a movie in a series, offer the next one you haven't ranked (in release order).
function afterSave(m, score) {
  const series = catalog.seriesOf(m);
  const next = series && series.movies.find((x) => scoreOf(x) == null);
  if (next) toast(`Saved ${score}`, { label: `Next: ${next.title}`, run: () => openRate(next.id) });
  else toast(`Saved ${score}`);
}

// Runs a save. On success runs done(); on failure shows the reason and runs failed().
async function attempt(work, done, failed) {
  try { const result = await work(); done?.(result); }
  catch (e) { toast(e.message || 'Something went wrong. Try again.'); failed?.(); }
}

let toastTimer;
// A small one-line note at the bottom of the screen. It goes away by itself, when you tap ×, or as soon as you
// tap anywhere else, so it never sits in the way.
function toast(text, action) {
  const el = $('#toast');
  el.innerHTML = `<span class="msg">${esc(text)}</span>${action ? `<button class="act">${esc(action.label)}</button>` : ''}`
    + '<button class="x" aria-label="Close">×</button>';
  if (action) el.querySelector('.act').onclick = () => { hideToast(); action.run(); };
  el.querySelector('.x').onclick = hideToast;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 4500 : 2200);
}
function hideToast() { clearTimeout(toastTimer); $('#toast').classList.remove('show'); }
document.addEventListener('pointerdown', (e) => {
  if ($('#toast').classList.contains('show') && !e.target.closest('#toast')) hideToast();
}, true);

// ---------- wiring ----------

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || t.closest('#modal-root') || t.closest('#toast')) return;
  if (t.dataset.tab) { state.tab = t.dataset.tab; render(); window.scrollTo(0, 0); }
  else if (t.dataset.rate) openRate(t.dataset.rate);
  else if (t.dataset.order) { state.order = t.dataset.order; render(); }
  else if (t.dataset.tag != null) { state.tag = t.dataset.tag; render(); }
  else if (t.dataset.view) { state.view = t.dataset.view; try { localStorage.setItem(VIEW_KEY, state.view); } catch { /* fine */ } render(); }
  else if (t.dataset.try) { state.query = t.dataset.try; render(); $('#q').focus(); }
  else if (t.dataset.status) { attempt(() => store.setStatus(t.dataset.id, t.dataset.status), render); }
  else if (t.dataset.compare) { state.friend = t.dataset.compare; state.tab = 'compare'; render(); window.scrollTo(0, 0); }
  else if (t.dataset.unfriend) {
    const f = store.friend(t.dataset.unfriend);
    const name = f?.name || [...store.requests().incoming, ...store.requests().outgoing].find((p) => p.id === t.dataset.unfriend)?.name;
    if (name && confirm(f ? `Remove ${name} from your friends?` : `Decline ${name}’s friend request?`)) {
      attempt(() => store.removeFriend(t.dataset.unfriend), () => { render(); toast(f ? `Removed ${name}` : 'Request declined'); });
    }
  }
  else if (t.dataset.report) openReport(t.dataset.report);
  else if (t.dataset.accept) attempt(() => store.acceptFriend(t.dataset.accept), () => { render(); toast('You are now friends.'); });
  else if (t.id === 'f-add') addFriend();
  else if (t.id === 'me-btn') openProfile();
});

async function addFriend() {
  const button = $('#f-add');
  button.disabled = true;
  try {
    const msg = await store.addFriend($('#f-code').value);
    render();
    toast(msg);
  } catch (e) {
    $('#f-err').textContent = e.message;
    button.disabled = false;
  }
}

document.addEventListener('keydown', (e) => { if (e.target.id === 'f-code' && e.key === 'Enter') addFriend(); });

document.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  state.query = e.target.value;
  showResults();
  const chips = $('#app .pane-head > .chips');
  if (chips) chips.hidden = !!state.query;
});

// Remember which series and franchises are opened, so they stay open after ranking.
document.addEventListener('toggle', (e) => {
  const key = e.target.dataset?.key;
  if (!key) return;
  e.target.open ? state.open.add(key) : state.open.delete(key);
}, true);

// ---------- profile menu: invite a friend, feedback, sign out ----------

// A pop-up sheet in the same style as the ranking window. Returns its element; close() removes it.
function sheet(title, body) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="x-btn" data-close aria-label="Close">×</button></div>${body}</div></div>`;
  const back = root.querySelector('.modal-back');
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  return { el: back, close };
}

function openProfile() {
  const me = store.me();
  const s = sheet('Profile', isPractice
    ? `<p class="muted">Practice mode: you're not signed in. Invites, feedback and signing out work in the live app.</p>`
    : `<div class="me-card"><div class="avatar big">${esc((me.name || 'Y')[0].toUpperCase())}</div>
        <div><div class="title">${esc(me.name)}</div><div class="muted small">Friend code <b>${esc(me.code || '')}</b></div></div></div>
      <div class="menu">
        <button data-act="invite"><span>Invite a friend</span><span class="muted small">Send a link to join and connect with you</span></button>
        <button data-act="feedback"><span>Send feedback</span><span class="muted small">Ideas, problems, anything</span></button>
        ${store.isKeeper() ? '<button data-act="inbox"><span>Feedback inbox</span><span class="muted small">Only you can see this</span></button>' : ''}
        <button data-act="signout" class="danger"><span>Sign out</span></button>
        <button data-act="delete" class="danger quiet"><span>Delete my account</span><span class="muted small">Removes your rankings, notes and friends for good</span></button>
      </div>
      <p class="legal small"><a href="privacy.html">Privacy policy</a> · <a href="support.html">Help &amp; support</a></p>`);
  s.el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'invite') { s.close(); invite(); }
    else if (act === 'feedback') { s.close(); openFeedback(); }
    else if (act === 'inbox') { s.close(); openInbox(); }
    else if (act === 'signout') attempt(() => store.signOut(), () => location.reload());
    else if (act === 'delete') { s.close(); openDeleteAccount(); }
  });
}

// Apple requires that anyone who can make an account can delete it from inside the app.
function openDeleteAccount() {
  const s = sheet('Delete my account', `<p>This deletes your Film Ranker account and everything in it: your ${store.all().length} rankings,
    moments, notes, friends and feedback. <b>It can’t be undone.</b></p>
    <p class="muted small">Type <b>DELETE</b> to confirm.</p>
    <input type="text" id="del-word" autocomplete="off" autocapitalize="characters" placeholder="DELETE">
    <p class="err small" id="del-err"></p>
    <div class="actions"><div class="right"><button data-close>Cancel</button><button class="primary danger-fill" id="del-go" disabled>Delete forever</button></div></div>`);
  const word = s.el.querySelector('#del-word');
  const go = s.el.querySelector('#del-go');
  word.addEventListener('input', () => { go.disabled = word.value.trim().toUpperCase() !== 'DELETE'; });
  go.addEventListener('click', () => {
    go.disabled = true; go.textContent = 'Deleting…';
    store.deleteAccount()
      .then(() => { try { Object.keys(localStorage).filter((k) => k.startsWith('movie-ranker')).forEach((k) => localStorage.removeItem(k)); } catch { /* fine */ }
        s.close(); authScreen('signin', 'Your account was deleted.'); })
      .catch((e) => { s.el.querySelector('#del-err').textContent = e.message; go.disabled = false; go.textContent = 'Delete forever'; });
  });
}

// Report a friend to the app's keeper, and block them (on by default) so they can't send requests again.
function openReport(id) {
  const name = store.friend(id)?.name || store.requests().incoming.find((p) => p.id === id)?.name || 'this person';
  const s = sheet(`Report ${name}`, `<p class="muted small">Tell us what happened. Only the app’s keeper reads reports.</p>
    <textarea id="rep-text" rows="4" maxlength="1800" placeholder="What’s wrong?"></textarea>
    <label class="check"><input type="checkbox" id="rep-block" checked> Also block ${esc(name)}: removes them and stops their friend requests</label>
    <p class="err small" id="rep-err"></p>
    <div class="actions"><div class="right"><button data-close>Cancel</button><button class="primary" id="rep-send">Send report</button></div></div>`);
  s.el.querySelector('#rep-send').addEventListener('click', (e) => {
    e.target.disabled = true;
    const block = s.el.querySelector('#rep-block').checked;
    store.report(id, name, s.el.querySelector('#rep-text').value)
      .then(() => (block ? store.block(id) : null))
      .then(() => { s.close(); render(); toast(block ? `Reported and blocked ${name}` : 'Report sent'); })
      .catch((err) => { s.el.querySelector('#rep-err').textContent = err.message; e.target.disabled = false; });
  });
}

// Invite link: the app's address with your friend code. Whoever opens it and signs in sends you a friend request.
async function invite() {
  const url = `${location.origin}${location.pathname}?invite=${encodeURIComponent(store.me().code)}`;
  const text = 'Rank movies and shows with me on Film Ranker:';
  try {
    if (navigator.share) { await navigator.share({ title: 'Film Ranker', text, url }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Invite link copied'); }
  catch { sheet('Invite a friend', `<p>Send this link to a friend:</p><input type="text" readonly value="${esc(url)}" onfocus="this.select()">`); }
}

// Opening an invite link remembers the code until you're signed in, then sends the friend request.
const INVITE_KEY = 'movie-ranker:invite';
function pendingInvite() { try { return localStorage.getItem(INVITE_KEY); } catch { return null; } }
(function keepInviteFromLink() {
  const code = new URLSearchParams(location.search).get('invite');
  if (!code) return;
  try { localStorage.setItem(INVITE_KEY, code.trim().toUpperCase().slice(0, 12)); } catch { /* private window */ }
  history.replaceState(null, '', location.pathname);
})();
async function acceptInvite() {
  const code = pendingInvite();
  if (!code) return;
  try { localStorage.removeItem(INVITE_KEY); } catch { /* fine */ }
  if (code === store.me().code) return;
  try { const msg = await store.addFriend(code); toast(msg); if (state.tab === 'friends') render(); }
  catch (e) { toast(e.message || 'That invite didn’t work.'); }
}

function openFeedback() {
  let kind = 'idea';
  const s = sheet('Send feedback', `<p class="muted small">Tell us what you'd like, or what isn't working. Only the app's keeper reads these.</p>
    <div class="seg" role="group" aria-label="Kind"><button data-kind="idea" class="on">Idea</button><button data-kind="problem">Problem</button><button data-kind="other">Other</button></div>
    <textarea id="fb-text" rows="5" maxlength="2000" placeholder="Write here…"></textarea>
    <p class="err small" id="fb-err"></p>
    <div class="actions"><div class="right"><button data-close>Cancel</button><button class="primary" id="fb-send">Send</button></div></div>`);
  s.el.addEventListener('click', (e) => {
    const k = e.target.closest('[data-kind]');
    if (k) { kind = k.dataset.kind; s.el.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b === k)); }
    if (e.target.id === 'fb-send') {
      e.target.disabled = true;
      store.sendFeedback({ kind, message: $('#fb-text').value, appVersion: `${VERSION} · ${innerWidth}×${innerHeight}` })
        .then(() => { s.close(); toast('Thanks! Feedback sent'); })
        .catch((err) => { $('#fb-err').textContent = err.message; e.target.disabled = false; });
    }
  });
}

const STATUS = { new: 'New', planned: 'Planned', done: 'Done', wont: 'Won’t do' };
async function openInbox() {
  const s = sheet('Feedback inbox', '<p class="muted">Loading…</p>');
  let items = [];
  const draw = () => {
    s.el.querySelector('.modal').innerHTML = `<div class="sheet-head"><h2>Feedback inbox</h2><button class="x-btn" data-close aria-label="Close">×</button></div>
      ${items.length ? items.map((f) => `<div class="fb card">
        <div class="muted small">${esc(f.display_name || 'Someone')} · ${f.kind === 'report' ? '<b class="report-tag">Report</b>' : esc(f.kind)} · ${new Date(f.created_at).toLocaleDateString()}</div>
        <p>${esc(f.message)}</p>
        <div class="seg">${Object.entries(STATUS).map(([v, l]) => `<button data-fb="${esc(f.id)}" data-status="${v}" class="${f.status === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      </div>`).join('') : '<p class="empty">No feedback yet.</p>'}`;
  };
  try { items = await store.feedbackList(); draw(); } catch (e) { s.el.querySelector('.modal').innerHTML += `<p class="err">${esc(e.message)}</p>`; }
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fb]');
    if (!b) return;
    e.stopPropagation();
    attempt(() => store.updateFeedback(b.dataset.fb, b.dataset.status), () => {
      items.find((f) => f.id === b.dataset.fb).status = b.dataset.status; draw();
    });
  }, true);
}

// ---------- signing in (live mode only) ----------

function authScreen(mode = 'signin', message = '') {
  $('#tabs').hidden = true;
  const signup = mode === 'signup';
  $('#me-btn').hidden = true;
  $('#app').innerHTML = `<div class="pane-head">${pendingInvite() ? '<p class="banner">A friend invited you to Film Ranker. Sign in or create an account and you’ll be connected.</p>' : ''}
    <h1>${signup ? 'Create your account' : 'Sign in'}</h1>
    <p class="muted small">Your rankings are saved to your account, so they show on every device.
      Only you and the friends you accept can see them.</p>
    <form id="auth" class="stack">
      ${signup ? '<input type="text" id="a-name" placeholder="Your first name" maxlength="40" required autocomplete="given-name">' : ''}
      <input type="email" id="a-email" placeholder="Email" required autocomplete="email">
      <input type="password" id="a-pass" placeholder="Password${signup ? ' (at least 6 characters)' : ''}" minlength="6" required
        autocomplete="${signup ? 'new-password' : 'current-password'}">
      <button class="primary" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
      <p class="err small" id="a-err">${esc(message)}</p>
    </form>
    <p class="center small">${signup ? 'Already have an account?' : 'New here?'}
      <button class="link" id="a-switch">${signup ? 'Sign in' : 'Create an account'}</button></p>
    <p class="legal small center">${signup ? 'By creating an account you agree to the ' : ''}<a href="privacy.html">Privacy policy</a> · <a href="support.html">Help &amp; support</a></p></div>`;
  $('#a-switch').onclick = () => authScreen(signup ? 'signin' : 'signup');
  $('#auth').onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('button[type=submit]');
    button.disabled = true;
    $('#a-err').textContent = '';
    try {
      if (signup) {
        const { needsConfirm } = await store.signUp($('#a-name').value, $('#a-email').value, $('#a-pass').value);
        if (needsConfirm) {
          $('#app').innerHTML = `<h1>Check your email</h1><p>We sent a link to confirm your account. Open it on this
            device, then come back here and sign in.</p><button class="primary" onclick="location.reload()">Sign in</button>`;
          return;
        }
      } else {
        await store.signIn($('#a-email').value, $('#a-pass').value);
      }
      start();
    } catch (err) {
      $('#a-err').textContent = err.message || 'That didn’t work. Try again.';
      button.disabled = false;
    }
  };
}

function start() {
  $('#tabs').hidden = false;
  const btn = $('#me-btn');
  btn.querySelector('.avatar').textContent = (store.me().name || 'Y')[0].toUpperCase();
  btn.hidden = false;
  if (!isPractice) acceptInvite();
  $('#banner').innerHTML = isPractice
    ? '<div class="banner">Practice mode: rankings are saved only in this browser, using a small built-in movie list.</div>' : '';
  render();
  if (catalog.live) linkOldRankings();
}

// Rankings made before full search (from the built-in list) get linked to the same movie in TMDB,
// so they show posters and join their series. Any that can't be matched stay as they are.
async function linkOldRankings() {
  const old = store.all().filter((r) => !String(r.movie.id).includes(':'));
  let linked = 0;
  for (const r of old) {
    try {
      const m = await catalog.match(r.movie.title, r.movie.year);
      if (m && !store.get(m.id)) { await store.rate(m, r.score, r.tags, r.note); await store.remove(r.movie.id); linked++; }
    } catch { return; } // search isn't working yet: try again next time
  }
  if (linked) { render(); toast(`Linked ${linked} earlier ranking${linked === 1 ? '' : 's'} to full movie search.`); }
}

// ---------- opening animation ----------
// The podium rises while the app loads (index.html #splash, style.css). When the app is ready: if the animation is
// still playing it hurries to the end, then the logo and name shrink into their place in the header and the
// cover fades away. With Reduce Motion on there's no movement, just a short fade.
async function endSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const brand = splash.querySelector('.splash-brand');
  const playing = brand.getAnimations({ subtree: true });
  playing.forEach((a) => { a.playbackRate = 3; });
  // Never wait more than about a second (animations pause while the page is in the background).
  await Promise.race([Promise.all(playing.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1200))]);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const to = document.querySelector('.top .brand')?.getBoundingClientRect();
  const from = brand.getBoundingClientRect();
  if (!reduce && to && to.width && from.width) {
    const scale = to.height / from.height;
    brand.style.transition = 'transform .38s cubic-bezier(.4, 0, .2, 1)';
    brand.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`;
  }
  splash.classList.add('leaving');
  await new Promise((r) => setTimeout(r, reduce ? 200 : 400));
  splash.remove();
}

try {
  if (await store.currentUser()) start();
  else authScreen();
} catch (e) {
  $('#app').innerHTML = `<h1>Can’t reach the database</h1><p class="muted">${esc(e.message || '')}</p>
    <button class="primary" onclick="location.reload()">Try again</button>`;
}
endSplash();
