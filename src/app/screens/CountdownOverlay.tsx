import { useEffect, useState } from "react";

export function CountdownOverlay({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [n, setN] = useState(seconds);
  useEffect(() => {
    if (n <= 0) { onDone(); return; }
    const t = setTimeout(() => setN((v) => v - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  if (n <= 0) return null;
  return (
    <div className="gw-overlay-center gw-countdown">
      <span key={n} className="gw-countdown-num">{n}</span>
    </div>
  );
}
