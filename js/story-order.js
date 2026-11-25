// Story order for full movie search: the order things happen in the story, where it differs from release order.
// Each list is matched against movie titles (lowercase). Movies that match nothing go at the end in release order.
// Marvel follows the Disney+ timeline up to Endgame.

const exact = (...titles) => titles.map((t) => new RegExp(`^${t}$`));

const STAR_WARS_SAGA = [/phantom menace/, /attack of the clones/, /revenge of the sith/, /^star wars$|new hope/,
  /empire strikes back/, /return of the jedi/, /force awakens/, /last jedi/, /rise of skywalker/];

const STORY = {
  'Star Wars': STAR_WARS_SAGA,
  'franchise:Star Wars': [/phantom menace/, /attack of the clones/, /revenge of the sith/, /^solo/, /^rogue one/,
    /^star wars$|new hope/, /empire strikes back/, /return of the jedi/, /force awakens/, /last jedi/, /rise of skywalker/],
  'franchise:Middle-earth': [/unexpected journey/, /desolation of smaug/, /five armies/,
    /fellowship of the ring/, /two towers/, /return of the king/],
  'franchise:Marvel': exact('captain america the first avenger', 'captain marvel', 'iron man', 'iron man 2',
    'the incredible hulk', 'thor', 'the avengers', 'thor the dark world', 'iron man 3',
    'captain america the winter soldier', 'guardians of the galaxy', 'guardians of the galaxy vol 2',
    'avengers age of ultron', 'ant man', 'captain america civil war', 'black widow', 'black panther',
    'spider man homecoming', 'doctor strange', 'thor ragnarok', 'ant man and the wasp', 'avengers infinity war',
    'avengers endgame'),
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Returns the group's movies in story order, or null when this group has no story order.
export function storyOrder(group) {
  const rules = STORY[group.kind === 'franchise' ? `franchise:${group.name}` : group.name];
  if (!rules) return null;
  const place = (m) => {
    const t = norm(m.title);
    const i = rules.findIndex((r) => r.test(t));
    return i < 0 ? rules.length : i;
  };
  return [...group.movies].sort((a, b) => place(a) - place(b) || a.date.localeCompare(b.date));
}
