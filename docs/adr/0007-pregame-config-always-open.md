# Pre-game always shows the config panel — the settings open/close toggle is removed

The pre-game (config) phase renders the side config panel unconditionally; the gear button that opened and closed it is removed from the local flow. Panel presence is now the visual signature of the phase: **pre-game = arena + config panel + Start footer; in-game = arena + fire footer, no panel.**

## Why

The toggle created a state — pre-game with the panel closed — that had no job. Pre-game exists to configure the match and press Start; hiding the only controls on the screen bought nothing, and a closed pre-game shell was visually ambiguous with the in-game shell (both read as "map + footer"). Removing the toggle makes the two states distinguishable at a glance and deletes a piece of UI chrome from the premium pass.

## Consequences

- `LocalFlow` and `OnlineFlow` both drop the `settingsOpen` state and the `.gear` button; `.arena-shell--open` is applied whenever the flow is in its config/lobby phase.
- The 52px top strip the side panel reserved for the fixed gear is reclaimed for both flows — the base `.comp.side-panel` top padding is now `--gw-space-5`, and the `.gear` styles are deleted from `theme.css`.
- **Config-flash re-anchor (online).** The gear had done double duty as the config-flash target — the border pulse a guest sees when the host changes a setting. With the panel now always present in the lobby, `configFlashRef` moves onto the `.comp.side-panel` element itself, so the guest sees the panel border pulse. Guests also no longer collapse the read-only panel, consistent with the "panel presence = phase" rule above.
