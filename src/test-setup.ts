import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Ensure @testing-library/react DOM is cleaned up after every test.
// Required because vitest does not inject global afterEach, so the library's
// module-level auto-cleanup registration doesn't fire.
afterEach(cleanup);
