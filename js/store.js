// Where accounts, rankings and friends are kept.
// Two versions with the same functions: practice mode (this browser only) and Supabase (live).
// Both keep a copy in memory, so screens can read right away; saving waits for the database.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js?v=14';
import { PRACTICE_FRIENDS } from './practice-friends.js?v=14';

export const isPractice = !SUPABASE_URL || !SUPABASE_ANON_KEY;
export const STATUSES = { friend: 'Friend', best: 'Best friend' };

// The movie details saved with each ranking.
// kind is 'tv' for a TV season; episodes is how many episodes that season has.
const MOVIE_FIELDS = ['id', 'title', 'date', 'year', 'genres', 'series', 'seriesName', 'franchise', 'poster', 'kind', 'episodes'];
const pickMovie = (m) => Object.fromEntries(MOVIE_FIELDS.map((f) => [f, m[f] ?? null]));
const cleanNote = (note) => String(note || '').trim().slice(0, 280) || null;
const cleanTags = (tags) => [...new Set(tags.map((t) => String(t).trim().slice(0, 30)).filter(Boolean))].slice(0, 30);

export async function createStore() {
  return isPractice ? practiceStore() : supabaseStore();
}

// ---------------------------------------------------------------- practice mode

function practiceStore() {
  const KEY = 'movie-ranker:practice:v1';
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
  data = { ratings: {}, customTags: [], friends: [], ...(data || {}) };
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private window: not saved */ }
  };
  // In practice mode a friend's id is their code.
  const withRatings = (f) => ({ id: f.code, name: f.name, status: f.status, ratings: PRACTICE_FRIENDS[f.code]?.ratings || {} });

  return {
    async currentUser() { return 'practice'; },
    me: () => ({ name: 'You', code: null }),
    all: () => Object.values(data.ratings),
    get: (id) => data.ratings[id],
    async rate(movie, score, tags, note) {
      data.ratings[movie.id] = { movie: pickMovie(movie), score, tags: cleanTags(tags), note: cleanNote(note), ratedAt: new Date().toISOString() };
      save();
    },
    async remove(id) { delete data.ratings[id]; save(); },
    customTags: () => data.customTags,
    async addTag(tag) { if (!data.customTags.includes(tag)) { data.customTags.push(tag); save(); } },

    friends: () => data.friends.map(withRatings),
    friend: (id) => { const f = data.friends.find((x) => x.code === id); return f && withRatings(f); },
    friendMovie: () => null,
    isKeeper: () => false,
    async sendFeedback() { throw new Error('Feedback works in the live app, once you’re signed in.'); },
    async feedbackList() { return []; },
    async updateFeedback() {},
    requests: () => ({ incoming: [], outgoing: [] }),
    async refresh() {},
    async addFriend(rawCode) {
      const code = rawCode.trim().toUpperCase();
      if (!code) throw new Error('Type a friend code.');
      if (data.friends.some((f) => f.code === code)) throw new Error('They’re already your friend.');
      const known = PRACTICE_FRIENDS[code];
      if (!known) throw new Error(`No one has the code ${code}.`);
      data.friends.push({ code, name: known.name, status: 'friend' });
      save();
      return `${known.name} added as a Friend.`;
    },
    async acceptFriend() {},
    async setStatus(id, status) {
      const f = data.friends.find((x) => x.code === id);
      if (f && STATUSES[status]) { f.status = status; save(); }
    },
    async removeFriend(id) { data.friends = data.friends.filter((f) => f.code !== id); save(); },
  };
}

// ---------------------------------------------------------------- live (Supabase)

async function supabaseStore() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

  let uid = null;
  let profile = null;
  let ratings = {};
  let friends = [];
  let requests = { incoming: [], outgoing: [] };
  let friendMovies = new Map(); // movie details from friends' rankings, for Compare
  let keeper = false;            // can read feedback (supabase/setup.sql: app_keepers)

  const toRating = (r) => ({ movie: r.movie, score: r.score, tags: r.tags, note: r.note || null, ratedAt: r.rated_at });

  // Loads everything the screens need: my profile and rankings, my friends, their rankings, my labels.
  async function load() {
    profile = ok(await sb.from('profiles').select('id, display_name, friend_code, custom_tags').eq('id', uid).single());
    try { keeper = ok(await sb.rpc('is_keeper')) === true; } catch { keeper = false; } // before the feedback setup is run
    const mine = ok(await sb.from('ratings').select('movie_id, movie, score, tags, note, rated_at').eq('user_id', uid));
    ratings = Object.fromEntries(mine.map((r) => [r.movie_id, toRating(r)]));

    const links = ok(await sb.from('friendships').select('requester, addressee, status'));
    const other = (f) => (f.requester === uid ? f.addressee : f.requester);
    const ids = [...new Set(links.map(other))];
    const people = ids.length ? ok(await sb.from('profiles').select('id, display_name').in('id', ids)) : [];
    const name = (id) => people.find((p) => p.id === id)?.display_name || 'Someone';
    const labels = ok(await sb.from('friend_labels').select('friend, label'));
    const labelOf = (id) => labels.find((l) => l.friend === id)?.label || 'friend';

    const accepted = links.filter((f) => f.status === 'accepted').map(other);
    const theirs = accepted.length
      ? ok(await sb.from('ratings').select('user_id, movie_id, movie, score, note').in('user_id', accepted)) : [];
    friendMovies = new Map(theirs.map((r) => [r.movie_id, r.movie]));
    friends = accepted.map((id) => ({
      id, name: name(id), status: labelOf(id),
      ratings: Object.fromEntries(theirs.filter((r) => r.user_id === id).map((r) => [r.movie_id, r.score])),
      notes: Object.fromEntries(theirs.filter((r) => r.user_id === id && r.note).map((r) => [r.movie_id, r.note])),
    }));
    requests = {
      incoming: links.filter((f) => f.status === 'pending' && f.addressee === uid).map((f) => ({ id: f.requester, name: name(f.requester) })),
      outgoing: links.filter((f) => f.status === 'pending' && f.requester === uid).map((f) => ({ id: f.addressee, name: name(f.addressee) })),
    };
  }

  return {
    async currentUser() {
      const { data } = await sb.auth.getSession();
      uid = data.session?.user.id || null;
      if (uid) await load();
      return uid;
    },
    async signUp(name, email, password) {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { display_name: name.trim() }, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw error;
      uid = data.session?.user.id || null;
      if (uid) await load();
      return { needsConfirm: !data.session };
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      uid = data.user.id;
      await load();
    },
    async signOut() { await sb.auth.signOut(); uid = null; },
    me: () => ({ name: profile?.display_name || 'You', code: profile?.friend_code || null }),

    all: () => Object.values(ratings),
    get: (id) => ratings[id],
    async rate(movie, score, tags, note) {
      const row = { user_id: uid, movie_id: movie.id, movie: pickMovie(movie), score, tags: cleanTags(tags), note: cleanNote(note), rated_at: new Date().toISOString() };
      ok(await sb.from('ratings').upsert(row));
      ratings[movie.id] = toRating(row);
    },
    async remove(id) {
      ok(await sb.from('ratings').delete().eq('user_id', uid).eq('movie_id', id));
      delete ratings[id];
    },
    customTags: () => profile?.custom_tags || [],
    async addTag(tag) {
      const tags = cleanTags([...(profile.custom_tags || []), tag]);
      ok(await sb.from('profiles').update({ custom_tags: tags }).eq('id', uid));
      profile.custom_tags = tags;
    },

    friends: () => friends,
    friend: (id) => friends.find((f) => f.id === id),
    friendMovie: (id) => friendMovies.get(id) || null,
    // Feedback (supabase/setup.sql: feedback). Anyone signed in can send; only the keeper reads and sets a status.
    isKeeper: () => keeper,
    async sendFeedback({ kind, message, appVersion }) {
      const text = String(message || '').trim().slice(0, 2000);
      if (!text) throw new Error('Write a few words first.');
      ok(await sb.from('feedback').insert({
        user_id: uid, kind: ['idea', 'problem', 'other'].includes(kind) ? kind : 'other', message: text,
        display_name: (profile?.display_name || '').slice(0, 80) || null, app_version: String(appVersion || '').slice(0, 120) || null,
      }));
    },
    async feedbackList() {
      return ok(await sb.from('feedback').select('id, kind, message, display_name, app_version, status, created_at')
        .order('created_at', { ascending: false }).limit(300));
    },
    async updateFeedback(id, status) {
      if (!['new', 'planned', 'done', 'wont'].includes(status)) return;
      ok(await sb.from('feedback').update({ status }).eq('id', id));
    },
    // Calls the movie-search helper (supabase/functions/movie-search); turns its error answer into a readable message.
    async call(body) {
      const { data, error } = await sb.functions.invoke('movie-search', { body });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch { /* keep the general message */ }
        if (/Failed to send|not found|404/i.test(msg)) msg = 'Movie search isn’t switched on yet.';
        throw new Error(msg);
      }
      return typeof data === 'string' ? JSON.parse(data) : data;
    },
    requests: () => requests,
    async refresh() { if (uid) await load(); },
    async addFriend(code) {
      if (!code.trim()) throw new Error('Type a friend code.');
      const msg = ok(await sb.rpc('send_friend_request', { code }));
      await load();
      return msg;
    },
    async acceptFriend(id) {
      ok(await sb.from('friendships').update({ status: 'accepted' }).eq('requester', id).eq('addressee', uid));
      await load();
    },
    async setStatus(id, status) {
      if (!STATUSES[status]) return;
      ok(await sb.from('friend_labels').upsert({ owner: uid, friend: id, label: status }));
      const f = friends.find((x) => x.id === id);
      if (f) f.status = status;
    },
    async removeFriend(id) {
      ok(await sb.from('friendships').delete().eq('requester', uid).eq('addressee', id));
      ok(await sb.from('friendships').delete().eq('requester', id).eq('addressee', uid));
      ok(await sb.from('friend_labels').delete().eq('owner', uid).eq('friend', id));
      await load();
    },
  };
}
