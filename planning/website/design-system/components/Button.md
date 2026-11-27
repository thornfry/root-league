A button states what happens when it is pressed. Use `.btn` on a real `<button>` or on an `<a>` that navigates.

- **Variants:** default (`.btn`), primary (`.pri`, forest, one per view), danger (`.danger`, clay outline for destructive actions), Discord (`.discord`, the sign-in button only), ghost (`.ghost`, text only, `link` colour).
- **Size:** 44px high (`tap-target`). `.sm` is 36px, only inside dense rows.
- **Label:** a verb phrase in sentence case: Save list, Enter result, Void game. Never OK or Submit alone.
- **Disabled:** use the native `disabled` attribute. It drops to half opacity.
- **Focus:** every control shows the 3px `focus` ring with a 2px offset. Do not remove it.
- **Icon button:** `.ib`, 40px square, needs an `aria-label`.

The consumer supplies the click handler and the label.
