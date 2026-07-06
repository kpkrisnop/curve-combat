import { useState } from "react";

/**
 * Reusable 4-letter room-code entry. Filters to letters, uppercases, and
 * auto-submits (navigates to `#room=CODE`) once 4 letters are entered.
 * Shared by the landing page's inline "Play Online" panel and `JoinRoom`.
 */
export function RoomCodeInput({ autoFocus = false }: { autoFocus?: boolean }) {
  const [value, setValue] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const filtered = e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4);
    setValue(filtered);
    if (filtered.length === 4) {
      location.hash = `#room=${filtered}`;
    }
  }

  return (
    <input
      className="gw-code-entry"
      type="text"
      autoFocus={autoFocus}
      maxLength={4}
      value={value}
      onChange={handleChange}
      placeholder="CODE"
      aria-label="Room code"
    />
  );
}
