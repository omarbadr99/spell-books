// The farewell after GOODBYE, made to be the last shot of a video. The board's
// points become the land, the stream of light and the sitter and the spirit
// holding hands (see scene/land.ts); here are the few words under them, and a
// way to begin again.

export class Farewell {
  constructor(
    private readonly el: HTMLElement,
    onRestart: () => void,
  ) {
    el.querySelector("#restart")!.addEventListener("click", () => {
      if (!el.hidden) onRestart();
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(): void {
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
