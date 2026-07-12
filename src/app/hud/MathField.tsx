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
  insertText(chars: string): void;
  onEnter(cb: () => void): void;
  onEdit(cb: () => void): void;
  onUpOutOf(cb: () => void): void;
  onDownOutOf(cb: () => void): void;
}

interface Props {
  team: Team;
  registry: HudInputRegistry;
  onEnter: () => void;
  /** Fires on every content change, including programmatic ones (recall, chip insert). */
  onEdit?: () => void;
  /** Cursor at the top level with nowhere higher to go (equation recall — "older"). */
  onUpOutOf?: () => void;
  /** Cursor at the bottom level with nowhere lower to go (equation recall — "newer"). */
  onDownOutOf?: () => void;
  placeholder?: string;
  /** Test seam: inject a fake instead of a real MathQuill field. */
  makeInput?: () => MathInputLike;
}

export function MathField({
  team, registry, onEnter, onEdit, onUpOutOf, onDownOutOf,
  placeholder = "type a function in x", makeInput,
}: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const onUpOutOfRef = useRef(onUpOutOf);
  onUpOutOfRef.current = onUpOutOf;
  const onDownOutOfRef = useRef(onDownOutOf);
  onDownOutOfRef.current = onDownOutOf;

  useEffect(() => {
    const input: MathInputLike = makeInput ? makeInput() : new MathInput("", placeholder);
    hostRef.current!.appendChild(input.el);
    input.reflow();
    input.onEnter(() => onEnterRef.current());
    input.onEdit(() => onEditRef.current?.());
    input.onUpOutOf(() => onUpOutOfRef.current?.());
    input.onDownOutOf(() => onDownOutOfRef.current?.());
    registry.register(team, input);
    return () => {
      registry.unregister(team);
      input.el.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- makeInput and placeholder are mount-only by design
  }, [team, registry]);

  return <span ref={hostRef} className="hud-input" />;
}
