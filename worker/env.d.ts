// Secrets live outside wrangler.jsonc, so `wrangler types` only sees them when a
// .dev.vars file happens to exist. Declaring them here keeps the types stable.
interface Env {
  BOARD_WORD: string;
  COOKIE_SECRET: string;
  ANTHROPIC_API_KEY: string;
  /** Optional: the model the spirit answers on, instead of Opus. */
  SPIRIT_MODEL?: string;
}
