// src/app/screens/NetCountdown.tsx
import { useEffect, useState } from "react";

export function NetCountdown({ startAt }: { startAt: number }) {
  const calc = () => Math.max(0, Math.ceil((startAt - Date.now()) / 1000));
  const [n, setN] = useState(calc);
  useEffect(() => {
    const iv = setInterval(() => setN(calc()), 200);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt]);
  if (n <= 0) return null;
  return (
    <div className="gw-overlay-center gw-countdown">
      <span className="gw-countdown-num">{n}</span>
    </div>
  );
}
