// Full movie search (live mode), through the movie-search helper on Supabase.
// Same functions as the practice catalog in catalog.js, but they wait for answers and remember them.
import { storyOrder } from './story-order.js?v=12';

export function createLiveCatalog(call) {
  const movies = new Map();   // every movie seen so far, by id
  const groups = new Map();   // every series and franchise loaded so far, by key
  const searches = new Map(); // search results, by search words

  const remember = (g) => {
    g.storyOrder = storyOrder(g);
    g.movies.forEach((m) => movies.set(m.id, { ...movies.get(m.id), ...m }));
    if (g.kind !== 'movie') groups.set(g.key, g);
    return g;
  };
  // Asks once per key; asking again while waiting shares the same answer. A failed answer is forgotten.
  const once = (cache, key, ask) => {
    if (!cache.has(key)) cache.set(key, ask().catch((e) => { cache.delete(key); throw e; }));
    return cache.get(key);
  };
  const pending = new Map();

  return {
    live: true,
    byId: (id) => movies.get(id),
    async search(term) {
      const key = term.trim().toLowerCase();
      if (!key) return [];
      return once(searches, key, async () => (await call({ action: 'search', term: key })).groups.map(remember));
    },
    async series(key) {
      if (groups.has(key)) return groups.get(key);
      // A movie series is a TMDB collection (tmdb-col:ID); a TV show's seasons are tmdb-tv:ID.
      const action = key.startsWith('tmdb-tv:') ? 'show' : 'collection';
      return once(pending, key, async () => remember((await call({ action, id: key.split(':')[1] })).group));
    },
    async franchise(name) {
      const key = `franchise:${name}`;
      if (groups.has(key)) return groups.get(key);
      return once(pending, key, async () => remember((await call({ action: 'franchise', name })).group));
    },
    // The series a movie is in, if that series has been loaded.
    seriesOf: (m) => (m.series ? groups.get(m.series) : null),
    // Fills in a movie's series and franchise before it's saved (franchise lists don't include them).
    async complete(m) {
      if (!m.id.startsWith('tmdb:') || m.detailed) return m;
      const { movie } = await call({ action: 'details', id: m.id });
      const full = { ...m, ...movie, franchise: movie.franchise || m.franchise, detailed: true };
      movies.set(full.id, full);
      return full;
    },
    async match(title, year) { return (await call({ action: 'match', title, year })).movie; },
    // Titles trending on TMDB this week, for the suggestions under the search box (asked once per visit).
    async trending() { return once(pending, 'trending', async () => (await call({ action: 'trending' })).items || []); },
  };
}
