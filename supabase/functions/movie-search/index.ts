// Movie search helper on Supabase (Edge Functions → movie-search).
// Searches TMDB first; OMDb fills in when TMDB has no match or no poster.
// The keys are secrets in Supabase (Edge Functions → Secrets), never in the app:
//   TMDB_TOKEN  the TMDB "API Read Access Token"
//   OMDB_KEY    the OMDb API key
// "Verify JWT with legacy secret" is OFF because this code checks the sign-in itself.
// Only signed-in people get results.
//
//   { action: 'search', term }        → { groups }: series and franchises together, first movie first
//   { action: 'collection', id }      → { group }: every movie in one TMDB collection (series)
//   { action: 'franchise', name }     → { group }: every movie in a franchise (Marvel, Pixar, ...)
//   { action: 'details', id }         → { movie }: one movie with its series and franchise
//   { action: 'match', title, year }  → { movie }: the best match for a title and year, or null

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w185';
const GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Sci-fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

// Franchises: bigger groups than one series. A movie belongs if it was made by one of the companies,
// is in one of the collections, or has one of the title words.
// minVotes: how many TMDB ratings a company's movie needs to count (leaves out small cartoon and video releases).
type Franchise = { name: string; aliases: string[]; companies?: string[]; minVotes?: number; collections?: string[]; titleWords?: string[] };
const FRANCHISES: Franchise[] = [
  { name: 'Marvel', aliases: ['marvel', 'mcu'], companies: ['Marvel Studios'], minVotes: 1500 },
  { name: 'Pixar', aliases: ['pixar'], companies: ['Pixar'], minVotes: 1000 },
  { name: 'Star Wars', aliases: ['star wars'], collections: ['Star Wars Collection'], titleWords: ['Star Wars'] },
  { name: 'Middle-earth', aliases: ['middle earth', 'middle-earth', 'tolkien'],
    collections: ['The Lord of the Rings Collection', 'The Hobbit Collection'] },
  { name: 'Wizarding World', aliases: ['wizarding world'],
    collections: ['Harry Potter Collection', 'Fantastic Beasts Collection'] },
];

const today = () => new Date().toISOString().slice(0, 10);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const seriesName = (n: string) => n.replace(/ Collection$/, '');

async function tmdb(path: string, params: Record<string, string> = {}) {
  const token = Deno.env.get('TMDB_TOKEN');
  if (!token) throw new Error('Movie search isn’t set up yet: the TMDB_TOKEN secret is missing.');
  const res = await fetch(`${TMDB}${path}?${new URLSearchParams({ language: 'en-US', ...params })}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) throw new Error('TMDB didn’t accept the TMDB_TOKEN secret. Check it was copied fully.');
  if (!res.ok) throw new Error('TMDB answered ' + res.status);
  return res.json();
}

// deno-lint-ignore no-explicit-any
async function omdb(params: Record<string, string>): Promise<any> {
  const key = Deno.env.get('OMDB_KEY');
  if (!key) return null;
  try {
    const res = await fetch('https://www.omdbapi.com/?' + new URLSearchParams({ apikey: key, ...params }),
      { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = await res.json();
    return j.Response === 'True' ? j : null;
  } catch { return null; }
}

// deno-lint-ignore no-explicit-any
function toMovie(m: any, extra: Record<string, unknown> = {}) {
  const genres = m.genres ? m.genres.map((g: { name: string }) => g.name === 'Science Fiction' ? 'Sci-fi' : g.name)
    : (m.genre_ids ?? []).map((id: number) => GENRES[id]).filter(Boolean);
  return {
    id: 'tmdb:' + m.id,
    title: m.title,
    date: m.release_date || '',
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    genres: genres.slice(0, 3),
    poster: m.poster_path ? IMG + m.poster_path : null,
    series: null, seriesName: null, franchise: null,
    ...extra,
  };
}

// deno-lint-ignore no-explicit-any
function franchiseOf(d: any): string | null {
  const companies = (d.production_companies ?? []).map((c: { name: string }) => c.name);
  const col = d.belongs_to_collection?.name ?? '';
  for (const f of FRANCHISES) {
    if (f.companies?.some((c) => companies.includes(c))) return f.name;
    if (f.collections?.includes(col)) return f.name;
    if (f.titleWords?.some((w) => d.title?.includes(w) || col.includes(w))) return f.name;
  }
  return null;
}

// deno-lint-ignore no-explicit-any
const released = (m: any) => m.release_date && m.release_date <= today();
// deno-lint-ignore no-explicit-any
const byDate = (a: any, b: any) => a.date.localeCompare(b.date);

// One movie with its series and franchise, and a poster from OMDb if TMDB has none.
async function details(id: number) {
  const d = await tmdb(`/movie/${id}`);
  const col = d.belongs_to_collection;
  const movie = toMovie(d, {
    series: col ? 'tmdb-col:' + col.id : null,
    seriesName: col ? seriesName(col.name) : null,
    franchise: franchiseOf(d),
  });
  if (!movie.poster && d.imdb_id) {
    const o = await omdb({ i: d.imdb_id });
    if (o?.Poster && o.Poster !== 'N/A') movie.poster = o.Poster;
  }
  return movie;
}

async function collectionGroup(id: number, franchise: string | null = null) {
  const c = await tmdb(`/collection/${id}`);
  const key = 'tmdb-col:' + id;
  const name = seriesName(c.name);
  // deno-lint-ignore no-explicit-any
  const movies = (c.parts ?? []).filter(released)
    // deno-lint-ignore no-explicit-any
    .map((p: any) => toMovie(p, { series: key, seriesName: name, franchise })).sort(byDate);
  return { key, kind: 'series', name, franchise, movies };
}

async function franchiseGroup(f: Franchise) {
  const found = new Map<string, ReturnType<typeof toMovie>>();
  const add = (m: ReturnType<typeof toMovie>) => { if (!found.has(m.id)) found.set(m.id, m); };

  for (const company of f.companies ?? []) {
    const hit = (await tmdb('/search/company', { query: company })).results?.find((c: { name: string }) => c.name === company);
    if (!hit) continue;
    for (let page = 1; page <= 3; page++) {
      const r = await tmdb('/discover/movie', {
        with_companies: String(hit.id), sort_by: 'primary_release_date.asc', include_adult: 'false',
        'primary_release_date.lte': today(), 'with_runtime.gte': '60', 'vote_count.gte': String(f.minVotes ?? 50), page: String(page),
      });
      // deno-lint-ignore no-explicit-any
      r.results.forEach((m: any) => add(toMovie(m, { franchise: f.name })));
      if (page >= r.total_pages) break;
    }
  }
  for (const colName of f.collections ?? []) {
    const hit = (await tmdb('/search/collection', { query: seriesName(colName) })).results
      ?.find((c: { name: string }) => c.name === colName);
    if (hit) (await collectionGroup(hit.id, f.name)).movies.forEach(add);
  }
  for (const word of f.titleWords ?? []) {
    const r = await tmdb('/search/movie', { query: word, include_adult: 'false' });
    // deno-lint-ignore no-explicit-any
    r.results.filter((m: any) => released(m) && m.title.includes(word) && m.vote_count >= 500)
      // deno-lint-ignore no-explicit-any
      .forEach((m: any) => add(toMovie(m, { franchise: f.name })));
  }
  return { key: 'franchise:' + f.name, kind: 'franchise', name: f.name, movies: [...found.values()].sort(byDate) };
}

async function search(term: string) {
  const groups: Record<string, unknown>[] = [];
  const shown = new Set<string>();
  const addGroup = (g: { movies: { id: string }[] } & Record<string, unknown>) => {
    if (!g.movies.length || g.movies.every((m) => shown.has(m.id))) return;
    groups.push(g);
    g.movies.forEach((m) => shown.add(m.id));
  };

  const f = FRANCHISES.find((x) => x.aliases.includes(norm(term)) || norm(x.name) === norm(term));
  if (f) addGroup(await franchiseGroup(f));

  // Movies hardly anyone has rated on TMDB are left out, unless they're all there is.
  // deno-lint-ignore no-explicit-any
  const all = (await tmdb('/search/movie', { query: term, include_adult: 'false' })).results.filter((m: any) => m.release_date);
  // deno-lint-ignore no-explicit-any
  const known = all.filter((m: any) => m.vote_count >= 25);
  const hits = (known.length ? known : all).slice(0, 8);
  if (!hits.length && !groups.length) {
    // TMDB found nothing: try OMDb.
    const o = await omdb({ s: term, type: 'movie' });
    // deno-lint-ignore no-explicit-any
    for (const r of (o?.Search ?? []).slice(0, 8) as any[]) {
      const year = parseInt(r.Year, 10) || null;
      addGroup({ key: 'movie:imdb:' + r.imdbID, kind: 'movie', name: r.Title, movies: [{
        id: 'imdb:' + r.imdbID, title: r.Title, date: year ? `${year}-01-01` : '', year, genres: [],
        poster: r.Poster && r.Poster !== 'N/A' ? r.Poster : null, series: null, seriesName: null, franchise: null,
      }] });
    }
    return { groups };
  }

  // deno-lint-ignore no-explicit-any
  const full = await Promise.all(hits.map((h: any) => details(h.id).catch(() => toMovie(h))));
  const collections = new Map<string, Promise<unknown>>();
  // Only well-known movies bring their whole series along; others show on their own.
  // deno-lint-ignore no-explicit-any
  const wellKnown = new Set(hits.filter((h: any) => h.vote_count >= 300).map((h: any) => 'tmdb:' + h.id));
  for (const m of full) {
    if (shown.has(m.id)) continue;
    if (m.series && wellKnown.has(m.id)) {
      const id = Number(String(m.series).split(':')[1]);
      if (!collections.has(m.series)) collections.set(m.series, collectionGroup(id, m.franchise as string | null));
      // deno-lint-ignore no-explicit-any
      const g: any = await collections.get(m.series);
      // The searched movie's own details (poster from OMDb, genres) replace the shorter collection copy.
      g.movies = g.movies.map((x: { id: string }) => (x.id === m.id ? m : x));
      addGroup(g);
    } else {
      addGroup({ key: 'movie:' + m.id, kind: 'movie', name: m.title, movies: [m] });
    }
  }
  return { groups };
}

async function match(title: string, year: number | null) {
  const params: Record<string, string> = { query: title, include_adult: 'false' };
  const r = await tmdb('/search/movie', params);
  // deno-lint-ignore no-explicit-any
  const ok = (m: any) => !year || Math.abs(Number(m.release_date?.slice(0, 4)) - year) <= 1;
  const hit = r.results.find(ok);
  return hit ? details(hit.id) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Ask Supabase who this is; refuse anyone not signed in.
  const auth = req.headers.get('authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? '';
  if (!auth.startsWith('Bearer ') || !apikey) return json({ error: 'Please sign in first.' }, 401);
  const who = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', { headers: { authorization: auth, apikey } });
  if (!who.ok) return json({ error: 'Please sign in first.' }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }

  try {
    switch (body.action) {
      case 'search': {
        const term = String(body.term ?? '').slice(0, 100).trim();
        return json(term ? await search(term) : { groups: [] });
      }
      case 'collection': return json({ group: await collectionGroup(Number(body.id)) });
      case 'franchise': {
        const f = FRANCHISES.find((x) => x.name === body.name);
        return f ? json({ group: await franchiseGroup(f) }) : json({ error: 'Unknown franchise.' }, 400);
      }
      case 'details': return json({ movie: await details(Number(String(body.id).replace('tmdb:', ''))) });
      case 'match': return json({ movie: await match(String(body.title ?? '').slice(0, 200), Number(body.year) || null) });
      default: return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Search failed.' }, 502);
  }
});
