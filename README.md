# Spirit Board

A talking board made of light, where AI spirits answer. The planchette appears
alone in the dark, then the board gathers around it: letters, numbers and a
candle, all made of drifting particles. Say hello and the candle lights, a
breeze comes through and a spirit arrives. You spell a question by dragging the
planchette from letter to letter, then bring it back to the center of the board.
Your message dissolves, the planchette pulls away from your fingers, and the
spirit spells its reply on its own, usually in a single word. The idea comes
from Maxime Rivest's Tom Riddle diary for the reMarkable.

<p align="center">
  <img src="docs/board-desktop.jpg" alt="The board on a laptop: letters made of particles, lit gold by the candle on the left and silver further away, with ISANYONETHERE spelled and the planchette resting on E" width="640">
  <img src="docs/board-phone.jpg" alt="The board on a phone before the candle is lit, with HI spelled as the message" width="200">
</p>

There is no typing anywhere. Even the word that unlocks the board is spelled
with the planchette.

## How to play

- **Spell with the planchette.** Drag it and pause with its window on a
  letter. A brief pause is enough: the letter is added to your message at the
  top. Letters run together the way they do on a real board
  (`WHATISYOURNAME`), and the spirit reads them fine. To spell a double letter,
  nudge off the letter and back on. Tap your message to rub out its last
  letter.
- **Send it from the center.** Bring the planchette back to the ring of light
  in the middle of the board. It sends your message the moment it stops there,
  or as soon as you let go of it there.
- **Unlock the board.** A new device starts locked. Spell the secret word and
  bring the planchette back to the center. A wrong word sends it to **NO**.
  Each device stays unlocked for 30 days.
- **Say hello to start.** The candle is out and the board is white light on
  black. Spell a greeting (`HI`, `HELLO`, `ISANYONETHERE`, or anything at all)
  and return to the center: the candle lights, a breeze stirs the particles,
  and one of 12 spirits arrives and answers. Its flame burns in one of four
  colors (orange, red, purple or green). The light falls on the letters nearest
  the candle and fades across the board, and it flickers. Each spirit also has
  its own sound and way of moving the planchette.
- **Ask anything.** Spirits answer in a word when they can, and in two or three
  only when one won't do. With nothing spelled, **YES** or **NO** answers the
  spirit's own question straight away. Ask `WHOAREYOU` and its words appear
  under its name from then on.
- **End the séance.** Rest the window on **GOODBYE**. Spirits also leave on
  their own if you're rude. The candle goes out in a curl of smoke and an end
  card shows who you met, ready to be the last shot of a video. Touch the card,
  then say hello again to call someone new.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22.12 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars   # then edit it
npm run dev                      # open the URL it prints
```

In `.dev.vars`:

- `BOARD_WORD` is the word that unlocks the board. Use letters or digits;
  5–8 letters works well.
- `COOKIE_SECRET` can be any long random string.
- `MOCK_SPIRIT=1` plays with canned replies and needs no API key. This is good
  for trying it out.
- For real spirits, set `ANTHROPIC_API_KEY` to a key from the
  [Anthropic Console](https://console.anthropic.com) and set `MOCK_SPIRIT=0`.

To play on your phone over Wi-Fi, run `npm run dev -- --host` and open the
network URL it prints.

## Put it online for your friends (free)

### On Vercel

The repository is ready for Vercel: `vercel.json` tells it to run
`npm run build:vercel`, which builds the page and the API.

1. In Vercel, add a project from this GitHub repository (or open the one you
   already linked).
2. In the project's **Settings → Environment Variables**, add:
   - `BOARD_WORD`: the word friends spell to unlock the board (letters or
     digits, 5–8 letters works well)
   - `COOKIE_SECRET`: any long random string
   - `ANTHROPIC_API_KEY`: your key from the
     [Anthropic Console](https://console.anthropic.com)
3. Redeploy. Vercel builds every push; the branch it treats as Production is
   set under **Settings → Git**.

Send your friends the project's `.vercel.app` link and the board word. Rate
limits on Vercel are counted per running instance, so they're looser than on
Cloudflare; the Anthropic spend limit below is the real cap.

### On Cloudflare

The app also runs on a Cloudflare Worker, which is free at this size.

1. Create a free account at [cloudflare.com](https://dash.cloudflare.com/sign-up).
2. Log in from this folder:

   ```bash
   npx wrangler login
   ```

3. Store the three secrets. Each command asks you to paste a value:

   ```bash
   npx wrangler secret put BOARD_WORD
   npx wrangler secret put COOKIE_SECRET
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

4. Deploy:

   ```bash
   npm run deploy
   ```

The command prints a link like `https://spirit-board.<you>.workers.dev`. Send
your friends the link and the board word. To change the word later, run
`npx wrangler secret put BOARD_WORD` again.

## What it costs

The spirits run on **Claude Haiku 5.5**. Replies are a word or two, so one
question costs roughly $0.0002, and 1,000 questions cost about 20 cents. The
spirit's instructions are cached between questions, which cuts the cost
further.

Safety nets:

- **Spend limit (do this first).** In the Anthropic Console, set a monthly
  spend limit under *Settings → Limits*. That's the hard cap.
- **Rate limits.** Each device can ask about 15 questions a minute. Wrong
  board words are limited to 5 tries a minute per network. On Cloudflare you
  can change both under `ratelimits` in `wrangler.jsonc`.
- **Choosing a model.** The model is one setting, `SPIRIT_MODEL` (in
  `wrangler.jsonc`, or as a Vercel environment variable). Haiku 5.5 suits
  replies this short.

## Tune the spirits

Each spirit has two halves:

- `shared/presence.ts` holds what everyone sees: name, epitaph, candle color
  (one of the four in `CANDLE_COLORS`), motion style, sound, and the opening
  and farewell lines. The motion style sets how the spirit moves the
  planchette: its speed, how much its paths bow, how unsteady it is, how long
  it rests on each letter, how far it slides past a letter, and how long it
  pauses before setting off.
- `worker/spirits.ts` holds what only the server knows: voice, secret, how it
  dodges questions too big for a board, and 5–6 example exchanges. The
  examples set the tone more than anything else.

The rules every spirit follows are in `BASE_RULES` in the same file: one word
(two or three only when one can't carry it), YES or NO when it fits, leave when
insulted, and gentle guardrails.

To hear how they actually sound before you film:

```bash
npm run sample                                  # every spirit, 20 questions (a few cents)
npm run sample -- --spirit pip --effort medium  # one spirit, more thinking
```

This asks each spirit the same 20 questions through the real model and prints
the replies side by side. It flags any reply that breaks the board's format.
It reads `ANTHROPIC_API_KEY` from your shell or from `.dev.vars`.

To add a spirit, add it to both files. The unit tests check that every spirit
is complete and that its lines fit on the board.

## How it's built

- **Front end** (`src/`) is plain TypeScript built with Vite, with
  [Three.js](https://threejs.org) for the particles. It has no framework.
  - The board layouts are data (`src/board/layout.ts`): two arcs of letters
    on wide screens, three arcs on phones held upright.
  - Every glyph and the candle are drawn into a mask and sampled into points
    (`src/scene/masks.ts`, `src/scene/sampling.ts`). The points crowd the
    edges and run in short threads through the strokes, which keeps the
    letters legible. Each point also has a start position out in the dark, so
    the board can form, and later morph into other shapes.
  - The shaders (`src/scene/shaders.ts`) light every point by the candle with
    an inverse-square fall-off, sway it in the breeze, and make it twinkle.
    The flame, the glow and the planchette are soft gradients, not particles.
  - Behind it all, stars drift and the sky turns very slowly
    (`src/scene/sky.ts`).
  - The page's own layout decides where the board sits; the camera lines the
    particles up with it (`src/scene/stage.ts`), and the planchette is drawn
    over them as plain HTML.
  - A spirit moves the planchette the way fingers do
    (`src/planchette/possess.ts`): a pause before it sets off, a smooth glide
    that bows a little, a slide past the letter and a pull back.
  - Every sound is synthesized with Web Audio, so there are no audio files.
- **Server** (`worker/api.ts`) answers three endpoints: `/api/me`,
  `/api/enter` and `/api/ask`. It checks the signed cookie, validates and
  cleans everything it receives, and calls Claude through `@anthropic-ai/sdk`.
  The same code runs as a Cloudflare Worker (`worker/index.ts`) or as Vercel
  Functions (`vercel/handler.ts`, built by `scripts/build-vercel.ts`).
- **Preview** (`npm run build:artifact`) builds a one-file copy for a
  claude.ai artifact, where the spirits answer through the viewer's own
  Claude.
- **Shared** (`shared/`) holds the rules for what the board can spell and the
  spirits' public data.

## Tests

```bash
npm run typecheck
npm test            # unit tests: layout, dwell, text rules, spirits, API (with a fake Claude)
npm run test:e2e    # full séances in a real browser at phone and laptop sizes (canned spirits)
```

---

*For entertainment. The spirits are fictional characters played by an AI.
"Ouija" is a trademark of Hasbro, and this project is not affiliated with
it.*
