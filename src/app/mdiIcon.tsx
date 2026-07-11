import RawIcon from "@mdi/react";

// @mdi/react ships a webpack-bundled CJS file whose named exports aren't
// statically analyzable by Vite's dep pre-bundler, which double-wraps the
// real component under `.default`/`.Icon` in dev. Normalize once here
// instead of at every call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolved = RawIcon as any;
export const Icon = (resolved.Icon ?? resolved.default ?? resolved) as typeof RawIcon;
