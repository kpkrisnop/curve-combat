# Accept pasted ASCII math; offer an always-on "Format" that structures it

The math field keeps accepting whatever the player types or pastes, including flat ASCII expressions copied from the web such as `sin(100x)/(1+exp(-10*(x+-8)))`. Compute Engine already compiles these, so the shot works — but the field renders them as flat literal text instead of a structured equation. We add an **always-on Format action** that reparses the current input into proper structured MathQuill LaTeX (real fractions, superscripts, function names), and a **status-bar hint** that flags "needs formatting" when raw ASCII is detected.

## Why

New players learn functions from the internet, where math is written in ASCII (`x^2`, `a/b`, `exp(...)`), not in MathQuill's structured LaTeX (`x^{2}`, `\frac{a}{b}`). Pasting that ASCII lands as literal characters: the shot still fires (Compute Engine is lenient), but the field looks wrong, a `/` never becomes a fraction, `^` never a superscript, and editing the caret is awkward. The two forms below are the *same math* — the left is what our field wants, the right is what players paste:

```
\frac{\sin\left(100x\right)}{1+\exp\left(-10\cdot\left(x+-8\right)\right)}
sin(100x)/(1+exp(-10*(x+-8)))
```

We want the ASCII path to keep working (never punish a paste) while giving players a one-tap way to turn it into a clean, editable equation.

## Decisions

- **Always-on Format button**, not a conditional one. We considered (a) showing a button only when formatting is needed, (b) a button that replaces the status message, and (c) a persistent dedicated control. We chose **(c)** — a permanent affordance avoids the "*when* does the button appear?" problem and the status-line collision entirely. The button is always available; pressing it on already-clean input is a no-op.
- **Status bar signals "needs formatting"** when the input contains raw ASCII that structuring would change (a literal `/`, `*`, `^`, or a function typed as bare letters). This is a *hint*, not the trigger for the button's existence — the button is always there; the hint just tells beginners it's worth pressing.
- **Format = reparse ASCII → structured LaTeX.** Round-trip the current expression through a normalize-and-restructure pass and write the structured form back into the field.

## Consequences

- The lenient-input contract is now explicit and intentional: ASCII in, valid shot out, always.
- One new persistent control competes for footer space. Freeing room (e.g. shrinking the "Backspace" label to `⌫`) is a **layout** question deferred to implementation, not decided here.
- **Verify live before implementing.** Exactly what MathQuill does to a pasted ASCII string — leave it flat vs. partially auto-structure it — must be observed in a real browser, because it determines how much work Format actually has to do (and whether the "needs formatting" detector keys off the field's LaTeX or the raw paste). This ADR fixes the direction; the paste behavior is a prototype input.
- No change to `sim`, the wire protocol, or the server — this is entirely a client input-UX concern.
