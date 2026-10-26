// The two lines of writing around the board: the sitters' ink on the paper slip,
// and the spirit's glowing reply above the board.

const SOAK_STAGGER_MS = 45;
const SOAK_MS = 1100;

export class InkLine {
  private chars: string[] = [];

  constructor(private readonly el: HTMLElement) {}

  /** What the sitters have spelled so far. */
  get text(): string {
    return this.chars.join("").replace(/\s+/g, " ").trim();
  }

  get empty(): boolean {
    return this.text.length === 0;
  }

  add(ch: string, className = "wet"): void {
    this.chars.push(ch);
    const span = document.createElement("span");
    span.className = `ink-char ${className}`;
    span.textContent = ch;
    this.el.append(span);
  }

  /** Adds a whole word with a space either side, e.g. YES resting on a half-spelled question. */
  addWord(word: string): void {
    if (this.chars.length && this.chars[this.chars.length - 1] !== " ") this.add(" ");
    for (const ch of word) this.add(ch);
    this.add(" ");
  }

  unsay(): void {
    while (this.chars.length && this.chars[this.chars.length - 1] === " ") this.popSpan();
    this.popSpan(true);
  }

  private popSpan(smear = false): void {
    this.chars.pop();
    const spans = this.el.querySelectorAll<HTMLElement>(".ink-char:not(.gone)");
    const last = spans[spans.length - 1];
    if (!last) return;
    last.classList.add("gone");
    if (!smear) return last.remove();
    last.classList.add("smear");
    setTimeout(() => last.remove(), 420);
  }

  /** The ink soaks into the paper, the way the diary drinks it. Returns what was written. */
  soak(): string {
    const text = this.text;
    this.chars = [];
    const spans = [...this.el.querySelectorAll<HTMLElement>(".ink-char:not(.gone)")];
    spans.forEach((span, i) => {
      span.classList.add("gone", "soak");
      span.style.animationDelay = `${i * SOAK_STAGGER_MS}ms`;
    });
    setTimeout(() => spans.forEach((s) => s.remove()), spans.length * SOAK_STAGGER_MS + SOAK_MS);
    return text;
  }

  /** Brings a question back, e.g. when the spirit fell silent. */
  restore(text: string): void {
    this.clear();
    for (const ch of text) this.add(ch, "resurface");
  }

  clear(): void {
    this.chars = [];
    this.el.replaceChildren();
  }
}

export class SpiritLine {
  private fadeTimer = 0;
  /** Letters of the word being spelled, kept together so a line never breaks mid-word. */
  private word: HTMLElement | null = null;

  constructor(private readonly el: HTMLElement) {}

  get text(): string {
    return this.el.textContent ?? "";
  }

  begin(): void {
    clearTimeout(this.fadeTimer);
    this.el.classList.remove("fading");
    this.el.replaceChildren();
    this.word = null;
  }

  add(text: string): void {
    if (!this.word) {
      this.word = document.createElement("span");
      this.word.className = "word";
      this.el.append(this.word);
    }
    const span = document.createElement("span");
    span.className = "ghost";
    span.textContent = text;
    this.word.append(span);
  }

  space(): void {
    this.word = null;
    this.el.append(document.createTextNode(" "));
  }

  fadeLater(ms = 3400): void {
    clearTimeout(this.fadeTimer);
    this.fadeTimer = window.setTimeout(() => this.el.classList.add("fading"), ms);
  }
}
