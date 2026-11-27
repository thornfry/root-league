A rounded square in the faction's colour with its two-letter code. Colour is identity only: the faction name is always written beside the seal, so the seal is `aria-hidden` unless it stands alone (then `role="img"` with the name as `aria-label`).

- **Sizes:** 30px (`.seal`) in rows and lists, 40px (`.seal.lg2`) on cards.
- **Class:** `.seal` plus the faction code: `cats`, `rats`, `badgers`, `moles`, `birds`, `frogs`, `otters`, `vagabond`, `knaves`, `bats`, `crows`, `WA`, `lizards`.
- **Colours:** `seal-<code>` and `seal-<code>-ink` tokens. Light grounds (cats, moles, otters, lizards) take `ink` text; the rest take white.
- **Pair it with:** the faction name in `body-strong`, a Militant or Insurgent tag, and the `.reach` number. `.fchip` lines up seal and name; `.fmeta` lines up tag and reach.
- Each seal has a faint inset outline so the dark ones (knaves, bats) still read on the dark theme.
