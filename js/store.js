// Saving rankings and friends. Practice mode keeps everything in this browser only.
// Supabase (sign-in, saving across devices, real friends) comes later; it will plug in here.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js?v=2';
import { PRACTICE_FRIENDS } from './practice-friends.js?v=2';

export const isPractice = !SUPABASE_URL || !SUPABASE_ANON_KEY;
const KEY = 'movie-ranker:practice:v1';
export const STATUSES = { friend: 'Friend', best: 'Best friend' };

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.ratings) return { customTags: [], friends: [], ...d };
  } catch { /* private window or blocked storage: start empty */ }
  return { ratings: {}, customTags: [], friends: [] };
}

export function createStore() {
  const data = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* not saved; the app still works */ }
  };
  // A friend as the app sees it: name, code, status and their scores by movie id.
  const withRatings = (f) => ({ ...f, ratings: PRACTICE_FRIENDS[f.code]?.ratings || {} });

  return {
    all: () => Object.values(data.ratings),
    get: (id) => data.ratings[id],
    rate(movie, score, tags) {
      data.ratings[movie.id] = { movie, score, tags, ratedAt: new Date().toISOString() };
      save();
    },
    remove(id) { delete data.ratings[id]; save(); },
    customTags: () => data.customTags,
    addTag(tag) { if (!data.customTags.includes(tag)) { data.customTags.push(tag); save(); } },

    friends: () => data.friends.map(withRatings),
    friend: (code) => { const f = data.friends.find((x) => x.code === code); return f && withRatings(f); },
    // Returns an error message, or '' when the friend was added.
    addFriend(rawCode) {
      const code = rawCode.trim().toUpperCase();
      if (!code) return 'Type a friend code.';
      if (data.friends.some((f) => f.code === code)) return 'They’re already your friend.';
      const known = PRACTICE_FRIENDS[code];
      if (!known) return `No one has the code ${code}.`;
      data.friends.push({ code, name: known.name, status: 'friend' });
      save();
      return '';
    },
    setStatus(code, status) {
      const f = data.friends.find((x) => x.code === code);
      if (f && STATUSES[status]) { f.status = status; save(); }
    },
    removeFriend(code) { data.friends = data.friends.filter((f) => f.code !== code); save(); },
  };
}
