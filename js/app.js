// Movie Ranker: screens and buttons.
import { createStore, isPractice, STATUSES } from './store.js?v=9';
import * as practiceCatalog from './catalog.js?v=9';
import { createLiveCatalog } from './catalog-live.js?v=9';

// The iPhone Duo's inside screen (lessons from Song Ranker). Safari doesn't tell pages where the fold is, so the
// layout goes by screen size: about 669 × 951 points held tall, 951 × 669 held wide (fold down the middle).
// Regular iPhones, upright or sideways, never match these.
const duoTall = matchMedia('(min-width: 640px) and (max-width: 699px) and (min-height: 700px)');
const duoWide = matchMedia('(min-width: 900px) and (max-width: 1000px) and (min-height: 450px) and (max-height: 700px)');
const fitScreen = () => {
  document.documentElement.classList.toggle('duo-tall', duoTall.matches);
  document.documentElement.classList.toggle('duo-wide', duoWide.matches);
};
duoTall.addEventListener('change', fitScreen);
duoWide.addEventListener('change', fitScreen);
fitScreen();

const store = await createStore();
// Practice mode searches the built-in list; live mode searches TMDB and OMDb through Supabase.
const catalog = isPractice ? practiceCatalog : createLiveCatalog((body) => store.call(body));
const state = { tab: 'rank', query: '', order: 'release', tag: '', open: new Set(), friend: null };

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

function movieRow(m, { num, label } = {}) {
  const r = store.get(m.id);
  const meta = [m.year, label, ...(r?.tags || [])].filter(Boolean).map(esc).join(' · ');
  return `<li class="movie">
    ${num ? `<span class="num">${num}</span>` : ''}
    ${poster(m)}
    <div class="info"><div class="title">${esc(m.title)}</div><div class="muted small">${meta}</div></div>
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

function rankScreen() {
  const tries = catalog.live ? ['Star Wars', 'Marvel', 'Toy Story', 'Harry Potter', 'Breaking Bad', 'The Office']
    : ['Star Wars', 'Marvel', 'Toy Story', 'Harry Potter', 'Lord of the Rings', 'Jaws'];
  return `<div class="pane-head"><h1>${catalog.live ? 'Rank a movie or show' : 'Rank a movie'}</h1>
    <input type="search" id="q" placeholder="${catalog.live ? 'Search a movie, TV show, series or franchise' : 'Search a movie, series or franchise'}" value="${esc(state.query)}" autocomplete="off">
    <div class="chips" ${state.query ? 'hidden' : ''}>${tries.map((t) => `<button class="chip" data-try="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
    <div class="pane-list"><div id="results"></div></div>`;
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
  return `<div class="pane-head"><h1>My list</h1><p class="muted small">${all.length} ranked, highest first.</p>
    ${tags.length ? `<div class="chips"><button class="chip ${state.tag ? '' : 'on'}" data-tag="">All</button>${
      tags.map((t) => `<button class="chip ${state.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}</div>
    <div class="pane-list"><div class="card"><ol class="movies">${shown.map((r, i) => movieRow(movieById(r.movie.id), { num: i + 1, label: r.movie.seriesName })).join('')}</ol></div></div>`;
}

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
        <button class="danger small" data-unfriend="${esc(f.id)}">Remove</button></div>
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
    ${isPractice ? '' : `<p class="muted small center">Signed in as ${esc(me.name)} · <button class="link" id="sign-out">Sign out</button></p>`}</div>`;
}

// Friend requests waiting on you (Accept) or on them.
function requestsHtml() {
  const { incoming, outgoing } = store.requests();
  if (!incoming.length && !outgoing.length) return '';
  const row = (p, action) => `<li class="movie"><div class="avatar">${esc(p.name[0].toUpperCase())}</div>
    <div class="info"><div class="title">${esc(p.name)}</div></div>${action}</li>`;
  return `<h3>Friend requests</h3><div class="card"><ol class="movies">${
    incoming.map((p) => row(p, `<button class="primary" data-accept="${esc(p.id)}">Accept</button>
      <button class="danger small" data-unfriend="${esc(p.id)}" aria-label="Decline ${esc(p.name)}">Decline</button>`)).join('')}${
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

  const pairRow = (x) => `<li class="movie">${poster(x.m)}
    <div class="info"><div class="title">${esc(x.m.title)}</div><div class="muted small">${x.m.year}</div></div>
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
    ${section(`${esc(f.name)} loved, you haven’t ranked`, theirPicks.map((x) => movieRow(x.m, { label: `${f.name} gave it ${x.them}` })),
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
      attempt(async () => { const full = await catalog.complete(m); await store.rate(full, score, [...tags]); return full; },
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
  else if (t.dataset.accept) attempt(() => store.acceptFriend(t.dataset.accept), () => { render(); toast('You are now friends.'); });
  else if (t.id === 'f-add') addFriend();
  else if (t.id === 'sign-out') attempt(() => store.signOut(), () => location.reload());
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

// ---------- signing in (live mode only) ----------

function authScreen(mode = 'signin', message = '') {
  $('#tabs').hidden = true;
  const signup = mode === 'signup';
  $('#app').innerHTML = `<div class="pane-head"><h1>${signup ? 'Create your account' : 'Sign in'}</h1>
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
      <button class="link" id="a-switch">${signup ? 'Sign in' : 'Create an account'}</button></p></div>`;
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
      if (m && !store.get(m.id)) { await store.rate(m, r.score, r.tags); await store.remove(r.movie.id); linked++; }
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
