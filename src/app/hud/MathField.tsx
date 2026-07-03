import { useEffect, useRef } from "react";
import { MathInput } from "../../ui/MathInput";
import type { HudInputRegistry, Team } from "./hudStore";

interface MathInputLike {
  el: HTMLElement;
  getLatex(): string;
  setLatex(v: string): void;
  focus(): void;
  setEnabled(e: boolean): void;
  reflow(): void;
  onEnter(cb: () => void): void;
}

interface Props {
  team: Team;
  registry: HudInputRegistry;
  onEnter: () => void;
  placeholder?: string;
  /** Test seam: inject a fake instead of a real MathQuill field. */
  makeInput?: () => MathInputLike;
}

export function MathField({ team, registry, onEnter, placeholder = "type a function in x", makeInput }: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;

  useEffect(() => {
    const input: MathInputLike = makeInput ? makeInput() : new MathInput("", placeholder);
    hostRef.current!.appendChild(input.el);
    input.reflow();
    input.onEnter(() => onEnterRef.current());
    registry.register(team, input);
    return () => {
      registry.unregister(team);
      input.el.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- makeInput and placeholder are mount-only by design
  }, [team, registry]);

  return <span ref={hostRef} className="hud-input" />;
}
