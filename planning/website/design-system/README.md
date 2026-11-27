# Root League

> Snapshot of the Root League design system, a Claude artifact owned by Will: https://claude.ai/artifact/YR51m4vFPwPH8awEKMYy2V. Taken on 2026-11-27 from version 1795800222-4cde: this README, `tokens.json`, and each component's guideline under `components/`. The live artifact also holds the component previews and stylesheet. The artifact is the reference; the code that ships is `site/src/ui`. Since this snapshot the font commit has landed, so the site now uses the three faces below.


The look and feel of the Root League website and anything else we make for the league: a league table set in book type, one dark green header band, and a colour seal for each of the 13 Root factions. It is plain on purpose. People come to check a pairing, enter a result or rank factions, so the page stays quiet and the numbers stay easy to read.

## Content fundamentals

- **Plain words, sentence case.** Name things the way players do: Your games, My factions, Enter result, Pick'em leaderboard. Not "submit payload" or "manage entity".
- **A button says what happens.** Save list, Void game, Start season. Never OK or Submit alone.
- **Status is always a word.** Recorded, Disputed, Void, Ready, Not ready. Colour and icons only support the word. Every status tag has text.
- **Errors say what and where.** "Use letters and spaces only." names the problem; no apology, no vague "Something went wrong".
- **Real data in examples.** Use the real roster and factions. Mark invented figures (results, points, dates) as placeholders.
- **No emoji.** Not in copy, icons, page titles or labels.

## Visual foundations

- **Ground and surfaces.** `paper` is the page. `card` (white, or `#17211c` in dark) holds anything people open or compare, with a 1px `line` border and `radius-card` corners. No shadows: the toast is the only one.
- **One band.** The header band is `forest-d` with the brand and navigation, and stays dark green in both themes. The admin sees a second `band-adm` bar below it. The current page has a 3px `amber` underline.
- **Forest is the action colour.** The one primary button per view, selected rows, solid tags and links use `forest` (lighter in dark theme, through the `link` and `sel` tokens).
- **Amber marks, never reads.** `amber` is a fill or underline for the current page and the leader. It is never text colour.
- **Status colours come in pairs.** Each has a text colour and a wash: `ok`/`ok-wash` (winner, valid, recorded), `warn`/`warn-wash` (pending, provisional, disputed), `clay`/`clay-wash` (void, error, militant), `blue`/`blue-wash` (insurgent, information).
- **Colour never carries meaning alone.** Militant is a filled dot and insurgent a ring. Every faction seal is paired with the faction's name.
- **Seals are identity.** Each of the 13 factions has a fixed colour (below). Light grounds take `ink` text, the rest take white.
- **Density.** Rows are at least 44px (`tap-target`). Phones have a 16px gutter (`gutter-phone`), desktop 64px (`gutter-desktop`), and content stops at `page-max`.
- **Contrast.** Text meets 4.5:1 in both themes. Secondary text is `ink2` and never under 12px. Focus is a 3px `focus` ring with a 2px offset on every interactive element.
- **Themes.** Light first, dark second. Tokens that have no dark value (the band, amber, focus, Discord, the seals) keep the light value in both.

## Type

Root's own rulebooks are set in Baskerville 10 Pro and Luminari, which are not free to use on the web. This system uses free stand-ins with the same book feel, all licensed OFL.

| Role | Face | Where | Notes |
| --- | --- | --- | --- |
| Display (`--font-display`) | IM Fell English | Page titles, headings, the brand | One weight only (regular, italic). Never bold it, never uppercase it. |
| Body (`--font-body`) | Baskervville | Everything people read | 17px on a 26px line. It has a small x-height, so keep it off 12 to 14px text. |
| Interface (`--font-ui`) | Alegreya Sans | Buttons, tags, labels, navigation, tables, all numbers | Set `font-variant-numeric: tabular-nums lining-nums` on anything that lines up in columns. |

Small and secondary text (kickers, tags, captions, reach) is Alegreya Sans, not Baskervville. The Type view lists every style with its size and weight.

**Loading the fonts.** In a page: `https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Baskervville:ital,wght@0,400..700;1,400..700&family=Alegreya+Sans:wght@400;500;700;800&display=swap`. In the website, self-host the Latin subsets through `@fontsource/im-fell-english`, `@fontsource/baskervville` and `@fontsource/alegreya-sans`, so no page loads from another site.

## Faction seals

Colour is identity only. The code is the faction's two letters; the name always sits beside the seal.

| Code | Seal | Faction | Type | Reach | Ground |
| --- | --- | --- | --- | --- | --- |
| `cats` | CA | Marquise de Cat | Militant | 10 | `seal-cats` |
| `rats` | LH | Lord of the Hundreds | Militant | 9 | `seal-rats` |
| `badgers` | KI | Keepers in Iron | Militant | 8 | `seal-badgers` |
| `moles` | UD | Underground Duchy | Militant | 8 | `seal-moles` (tan) |
| `birds` | ED | Eyrie Dynasties | Militant | 7 | `seal-birds` |
| `frogs` | LD | Lilypad Diaspora | Militant | 7 | `seal-frogs` |
| `otters` | RC | Riverfolk Company | Insurgent | 5 | `seal-otters` |
| `vagabond` | VB | Vagabond | Insurgent | 5 | `seal-vagabond` |
| `knaves` | KD | Knaves of the Deepwood | Insurgent | 4 | `seal-knaves` (black) |
| `bats` | TC | Twilight Council | Insurgent | 4 | `seal-bats` (dark brown) |
| `crows` | CC | Corvid Conspiracy | Insurgent | 3 | `seal-crows` (purple) |
| `WA` | WA | Woodland Alliance | Insurgent | 3 | `seal-WA` |
| `lizards` | LC | Lizard Cult | Insurgent | 2 | `seal-lizards` |

The data (names, type, reach) lives in the website's `factions.ts`, which matches `league/factions.md`. Change it there, not here.

## Iconography

Inline SVG on a 16 by 16 viewBox, `fill="none"`, `stroke="currentColor"`, stroke width 2, round caps and joins. 12px in tags, 14px in buttons, 18px in alerts. Decorative icons are `aria-hidden="true"`; an icon-only button has an `aria-label`. No emoji, no icon font.

| Name | Path (`d`) | Used for |
| --- | --- | --- |
| check | `M3 8.5l3.2 3.2L13 4.8` | Submitted, winner, valid, success |
| warn | `M8 2.2l6.2 11H1.8z M8 6.8v3 M8 11.9v.2` | Needs attention, disputed, warning |
| x | `M4 4l8 8M12 4l-8 8` | Void, error |
| lock | `M4.5 7V5.5a3.5 3.5 0 017 0V7 M3.5 7h9v7h-9z` | Locked, information |
| clock | `M8 2a6 6 0 100 12A6 6 0 008 2z M8 5v3.2l2 1.3` | Provisional, waitlisted, paused |
| eye | `M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z M8 6.2a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6` | Picks open, hidden until result |
| chevron | `M3 6l5 5 5-5` | Select, move |

## Components

Button, Tag, Alert, Field, Card (with Stat), FactionSeal, HeaderBand and Icon each have a guideline and a live preview. Their styles are in `components/bundle.css`, written against this system's token names. Wrap a page in `class="lg"` and load `tokens.css` and `bundle.css`.

## Using it

- **Colour, spacing, radius:** use the tokens by name (`--forest`, `--space-4`, `--radius-card`), never a hex.
- **Type:** the three families above, and the Type view's styles.
- **New things:** add a token or a component here first, then use it in the site, so this stays the single reference.

## Not synced

- Built by hand from the website's `site/src/ui` CSS (`tokens.css`, `components.css`, `shell.css`) at the `website-build` branch, commit 0f20712, with the fonts taken from the approved Font trial on the Root League design canvas. The site still ships Barlow Condensed and Inter until the font commit lands; the faction recolours (knaves black, bats dark brown, corvids purple, duchy tan) are already in.
- `--radius` is `radius-md` here, `--f-display` and `--f-body` are `--font-display` and `--font-body`, and `--font-ui` is new.
- Not included yet: the React components themselves (the previews are static markup), Modal, Toast, the page-level tables (standings, pairings) and the phone menu.
- Hosted fonts: the faces load from Google Fonts and no font files are stored here.
