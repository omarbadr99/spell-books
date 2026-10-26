// The card shown after GOOD BYE, made to be the last shot of a video, and the
// per-device record of which spirits you've met.

import { SPIRITS, type PublicSpirit } from "../../shared/presence";

const MET_KEY = "spirit-board:met";

function readMet(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MET_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function markMet(id: string): void {
  const met = new Set(readMet());
  met.add(id);
  try {
    localStorage.setItem(MET_KEY, JSON.stringify([...met]));
  } catch {
    // Private mode or storage disabled: the count just won't persist.
  }
}

export function metCount(): number {
  const known = new Set(SPIRITS.map((s) => s.id));
  return readMet().filter((id) => known.has(id)).length;
}

export class EndCard {
  constructor(
    private readonly el: HTMLElement,
    onDismiss: () => void,
  ) {
    el.addEventListener("click", () => {
      if (!el.hidden) onDismiss();
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(spirit: PublicSpirit, named: boolean, questions: number): void {
    this.el.querySelector(".endcard-name")!.textContent = named ? spirit.name : "Unnamed";
    this.el.querySelector(".endcard-epitaph")!.textContent = spirit.epitaph;
    const asked = `${questions} ${questions === 1 ? "question" : "questions"} asked`;
    this.el.querySelector(".endcard-stats")!.textContent = `${asked}\nSpirits met ${metCount()}/${SPIRITS.length}`;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
