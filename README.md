# Movie Ranker

Josh's personal movie-ranking web app, a sibling of [Song Ranker](../song-ranker).

## Plan (same setup as Song Ranker)

- **The app:** plain HTML and JavaScript, no build step.
- **Sign-in and data:** Supabase (its own project, separate from song-ranker).
- **Code and hosting:** GitHub, served with GitHub Pages.
- **Movie details (decided 2026-11-24):** search TMDB first. If TMDB has no match, or is missing a poster,
  year or plot, fill in from OMDb. Both are free and need a key. The keys live in a Supabase helper
  (like Song Ranker's song-search), never in the app's files.

## Ranking (decided 2026-11-24)

Start from Song Ranker's ranking (1 to 100, tags, compare with friends), plus movie groups:
- **Series grouped together:** trilogies and other series (Lord of the Rings, Toy Story) are kept
  together as one group. TMDB already lists these as "collections".
- **Franchises:** bigger groups like Marvel movies, which can cover many series.
- **Release order first:** inside a series, the movies are listed in the order they came out in
  theaters, so the original movie is the first choice. This is the order most fans use, and TMDB
  gives every movie's release date.
- **Story order switch (later):** for the few series where the story runs in a different order
  (Star Wars, X-Men, Marvel), a button flips to story order. TMDB doesn't have story order, so
  those lists get typed in by hand, one series at a time.

## Coming next (asked for 2026-11-24)

- **Friends (practice version built):** add a friend by code. Each friend is a **Friend** or a
  **Best friend**. A best friend's letter shows in a small circle on every movie they've ranked;
  regular friends stay hidden until you open Compare. Practice codes: SAM123 and JORDAN7. Real
  invites and friend requests come with Supabase.
- **Compare (practice version built):** how close your scores are, movies you both love, where you
  disagree, what they loved that you haven't ranked, and your favorites they haven't ranked.
- **TV shows (built 2026-11-25):** shows come up in the same search. Each show works like a series: its aired
  seasons are listed Season 1 first, each season gets its own 1 to 100 score, and the show's score is the average.
  It keeps the name Movie Ranker.
- **Real posters:** these come from TMDB once the app goes live. Practice mode shows colored tiles.

## Logo (v7)

A winner's podium made of film strips: 1st in the middle, 2nd on the left, 3rd on the right.
- `img/logo-mono.svg`: black and white, used in the app header and browser tab, and for documents.
- `img/logo.svg`: the color version (gold, silver and bronze on red), kept for later.
- `img/icon-square.svg` and `img/apple-touch-icon.png`: the iPhone Home Screen icon (iPhone rounds the corners).
- The name in the header uses Futura Condensed ExtraBold, which comes with iPhones and Macs, for a cinema-marquee look.

## Screens (v6)

- **Every iPhone, upright or sideways:** one column that keeps clear of the notch, Dynamic Island and home bar.
- **iPhone Duo, outside screen:** like any iPhone; pop-up windows stop below the clock pill in the top-right corner.
- **iPhone Duo, inside screen held tall:** full width, slightly bigger text; pop-ups sit in the bottom half, below the fold.
- **iPhone Duo, inside screen held wide:** split at the fold. Left half: title, tabs and controls. Right half: the
  list, scrolling on its own. Pop-ups open in the right half. The Duo is recognised by screen size (about 669 × 951
  points), the same way Song Ranker does it, because Safari doesn't say where the fold is.

## Try it on your Mac (practice mode)

```bash
node tools/serve.mjs
```

Then open http://localhost:5174. With `config.js` left blank, rankings are saved only in that
browser, and search uses a small built-in list of about 60 movies (`js/sample-movies.js`).

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css` | The page and how it looks |
| `js/app.js` | Screens and buttons: Rank, My list, Series, Franchises |
| `js/catalog.js` | Practice-mode search and the series and franchise groups |
| `js/catalog-live.js` | Full movie search through the movie-search helper |
| `js/story-order.js` | Story order for Star Wars, Marvel and Middle-earth in full search |
| `js/sample-movies.js` | The practice movie list, including story orders |
| `js/store.js` | Saving: practice mode or Supabase |
| `supabase/setup.sql` | Database tables and who-can-see-what rules |
| `supabase/functions/movie-search/index.ts` | Search helper on Supabase: TMDB first, OMDb fills gaps |
| `config.js` | Your Supabase address and public key (blank for practice) |

## Live (since 2026-11-25)

- **Web address:** https://8tdvzfqsxn-ship-it.github.io/movie-ranker/ (GitHub Pages, from `main`)
- **Database:** Supabase project `movie-ranker`, set up with `supabase/setup.sql`. Its Site URL points
  at the web address, so sign-up emails lead back to the app.
- **Connecting a copy:** `node tools/set-key.mjs` saves the Project URL and publishable key into `config.js`.
- **Movie search:** the `movie-search` Edge Function. Its secrets `TMDB_TOKEN` and `OMDB_KEY` are set in
  Supabase → Edge Functions → Secrets. After changing its code, paste it into the function's Code tab and deploy.
- **Practice mode:** blank both values in `config.js` to try things on your Mac without the database.

## Not done yet

- Story order typed in for more series than Star Wars, Marvel and Middle-earth.

