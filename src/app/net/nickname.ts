const KEY = "curvecombat.nickname";

export function getNickname(): string {
  return localStorage.getItem(KEY) ?? "Player";
}

export function setNickname(n: string): void {
  localStorage.setItem(KEY, n.trim().slice(0, 12));
}
