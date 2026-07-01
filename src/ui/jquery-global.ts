// MathQuill 0.11 reads `window.jQuery` at module-evaluation time and throws if
// it's absent. This shim publishes jQuery onto the global so the MathQuill
// build can find it. It MUST be imported before "@edtr-io/mathquill" — and it
// is, because static imports evaluate in source order (see MathInput.ts).
//
// This is the ONLY place jQuery touches the app. Nothing else imports it.
import $ from "jquery";

const g = window as unknown as { jQuery: unknown; $: unknown };
g.jQuery = $;
g.$ = $;
