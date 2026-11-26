// Finding movies and their groups (series and franchises).
// Practice mode reads the built-in list in sample-movies.js.
import { SERIES, FRANCHISE_STORY_ORDER, MOVIES } from './sample-movies.js?v=7';

const movies = MOVIES.map(([id, title, date, genres, series, franchise]) => ({
  id, title, date, year: Number(date.slice(0, 4)),
  genres: genres.split(', '),
  series: series || null,
  seriesName: series ? SERIES[series].name : null,
  franchise: series ? SERIES[series].franchise || null : franchise || null,
})).sort((a, b) => a.date.localeCompare(b.date));

const byIdMap = new Map(movies.map((m) => [m.id, m]));
export const byId = (id) => byIdMap.get(id);

// Every group lists its movies in release order; storyOrder is there only when the story differs.
export const seriesGroups = Object.entries(SERIES).map(([key, s]) => ({
  key: `series:${key}`, kind: 'series', name: s.name, franchise: s.franchise || null,
  movies: movies.filter((m) => m.series === key),
  storyOrder: s.storyOrder ? s.storyOrder.map(byId) : null,
}));

export const franchiseGroups = [...new Set(movies.map((m) => m.franchise).filter(Boolean))].map((name) => ({
  key: `franchise:${name}`, kind: 'franchise', name,
  movies: movies.filter((m) => m.franchise === name),
  storyOrder: FRANCHISE_STORY_ORDER[name] ? FRANCHISE_STORY_ORDER[name].map(byId) : null,
}));

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Search results come back as groups: a whole franchise, a whole series (first movie first),
// or a single movie. Groups are ordered by when their first movie came out.
export function search(query) {
  const q = norm(query);
  if (!q) return [];
  const groups = [];
  const shown = new Set();
  const add = (g) => { groups.push(g); g.movies.forEach((m) => shown.add(m.id)); };

  for (const f of franchiseGroups) if (norm(f.name).includes(q)) add(f);
  for (const s of seriesGroups) {
    if (s.movies.every((m) => shown.has(m.id))) continue;
    if (norm(s.name).includes(q) || s.movies.some((m) => norm(m.title).includes(q))) add(s);
  }
  for (const m of movies) {
    if (!shown.has(m.id) && norm(m.title).includes(q)) {
      add({ key: `movie:${m.id}`, kind: 'movie', name: m.title, movies: [m], storyOrder: null });
    }
  }
  return groups.sort((a, b) => a.movies[0].date.localeCompare(b.movies[0].date));
}

export const catalogSize = movies.length;

// The same functions the live catalog has (catalog-live.js), so the screens work with either.
export const live = false;
export const series = async (key) => seriesGroups.find((g) => g.key === key);
export const franchise = async (name) => franchiseGroups.find((g) => g.name === name);
export const seriesOf = (m) => seriesGroups.find((g) => g.movies.some((x) => x.id === m.id)) || null;
export const complete = async (m) => m;
export const match = async () => null;
