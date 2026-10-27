# Spirit Board

A talking board made of light, where AI spirits answer. It opens in the dark:
the stars come out, the planchette appears, and SPIRIT BOARD gathers out of a
whirl of dust until a gust tears it away and carries the board in after it:
letters, numbers and a candle, all made of particles. Greet the spirits and the
candle lights, a breeze gets up and one of four spirits arrives. You spell by
dragging the planchette from letter to letter, then bring it back to the center
of the board. Your message dissolves, the planchette pulls away from your
fingers, and the spirit spells its reply on its own, usually in a single word,
while its candle flares and the wind rises. The idea comes from Maxime Rivest's
Tom Riddle diary for the reMarkable.

<p align="center">
  <img src="docs/board-desktop.jpg" alt="The board on a laptop as Fable answers YES: its orange candle flares on the left, the flame bent over by the wind and a wisp of heat trailing off it, the letters lit gold near the flame and silver further away" width="640">
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
- **Greet the spirits to start.** The candle is out and the board is white
  light on black. Spell a greeting and return to the center: `HI`, `HELLO`,
  `HEY`, `ISANYONETHERE`, `WHOSTHERE`, or a hello in another language (`HOLA`,
  `SALAM`, `BONJOUR`...). Anything that isn't a greeting fades into the dark
  board and nothing comes. A greeting lights the candle, a breeze gets up, and
  a spirit arrives and greets you back in a way that starts a conversation
  (`WHO CALLS`, `HELLO STRANGER`). Touching the screen during the opening
  hurries it along.
- **Ask anything.** Spirits answer in a word when they can, and in two or three
  only when one won't do. A yes-or-no question gets a bare **YES** or **NO**.
  With nothing spelled, resting on **YES** or **NO** answers the spirit's own
  question straight away. Ask `WHOAREYOU` and its words appear under its name
  from then on. While a spirit thinks, the planchette simply waits; then it
  moves.
- **End the séance.** Rest the window on **GOODBYE** and the spirit leaves
  without a word: a last gust blows the candle out. Spirits also leave on their
  own if you're rude. An end card shows who you met, ready to be the last shot
  of a video. Touch the card, then greet the spirits again to call another.

## The spirits

There are four, each named after the Claude model it answers on. A séance gets
one of them at random, never the same one twice in a row.

| Spirit | Answers on | Candle | Who it is |
| --- | --- | --- | --- |
| Haiku | Claude Haiku 5.5 | green | A wandering poet who sat down by an old pond and never got up. Quiet, sparing, speaks in images. |
| Sonnet | Claude Sonnet 5.5 | red | A lovesick poet who wrote fourteen lines a night to someone who never wrote back. |
| Fable | Claude Fable 5.1 | orange | The sly fox from every tale told by the winter fire, tired of being the villain. |
| Opus | Claude Opus 5.5 | purple | A grand maestro who died at the crescendo of his own opening night, in 1881. |

Each also has its own sound and its own way of moving the planchette: Haiku is
light and exact, Sonnet swings wide, Fable darts past the letters, and Opus is
slow and heavy.

## Light and wind

The candle is the only light on the board, and the air in the room is one
simulation that everything shares.

- **Wind.** Still until a spirit comes; then a breeze that wanders a little in
  strength and direction, with gusts that roll across the board from the
  candle's side and eddies the air carries along with it. Dust in the air
  drifts with it and glints as it passes near the flame. Heat and smoke rise
  off the flame and bend away downwind. The letters lean as each gust passes,
  a moment late, and swing back a little after it, while staying readable. The
  planchette stirs the air it moves through.
- **Light.** The flame flickers and now and then gutters, more often in a
  draught. Gusts bend it over and dim it. Its light falls off with distance,
  and the edge of each stroke that faces the flame catches more of it. The
  planchette throws a soft shadow across the board, away from the candle.
- **When a spirit speaks,** the flame flares up taller and whiter, its light
  reaches further, and the wind rises with it. You can hear the wind too.

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

Each spirit answers on its own model, at low effort. Replies are a word or two,
and the spirit's instructions are cached between questions, so most of the cost
is the model's brief thinking before it answers. Rough costs per 1,000
questions:

| Spirit | Model | Per 1,000 questions |
| --- | --- | --- |
| Haiku | Claude Haiku 5.5 | about $0.20 |
| Sonnet | Claude Sonnet 5.5 | about $3 |
| Opus | Claude Opus 5.5 | about $6 |
| Fable | Claude Fable 5.1 | about $15 |

With spirits picked at random that averages out to roughly $6 per 1,000
questions, well under a cent a question. A whole séance of a dozen questions
costs a few cents at most.

Safety nets:

- **Spend limit (do this first).** In the Anthropic Console, set a monthly
  spend limit under *Settings → Limits*. That's the hard cap.
- **Rate limits.** Each device can ask about 15 questions a minute. Wrong
  board words are limited to 5 tries a minute per network. On Cloudflare you
  can change both under `ratelimits` in `wrangler.jsonc`.
- **One model for everyone.** Set `SPIRIT_MODEL` (a var in `wrangler.jsonc`,
  or a Vercel environment variable) to put all four spirits on one model, for
  example `claude-haiku-5-5` to keep costs at the Haiku level. Leave it unset
  and each spirit uses its own.

Two more things to know:

- **Refusals.** Sonnet, Opus and Fable ask with server-side fallbacks turned
  on: if Claude's safety checks decline a question, another model answers it
  in the same call. Haiku has no fallback, so a declined question makes it
  spell `I CANNOT SAY`.
- **Fable and data retention.** Claude Fable 5.1 needs your Anthropic
  organization to keep data for 30 days. If your organization has zero data
  retention, Fable's requests fail and that spirit falls silent; the server
  log says why. Use `SPIRIT_MODEL`, or ask Anthropic about access.

## Tune the spirits

Each spirit has two halves:

- `shared/presence.ts` holds what everyone sees: name, epitaph, candle color
  (one of the four in `CANDLE_COLORS`), motion style and sound. The motion
  style sets how the spirit moves the planchette: its speed, how much its
  paths bow, how unsteady it is, how long it rests on each letter, how far it
  slides past a letter, and how long it pauses before setting off.
- `worker/spirits.ts` holds what only the server knows: the model it answers
  on, its voice, a secret, how it dodges questions too big for a board, and 6
  example exchanges, the first of them a greeting. The examples set the tone
  more than anything else.

The rules every spirit follows are in `BASE_RULES` in the same file: greet the
sitters back in a way that invites them to talk, one word (two or three only
when one can't carry it), YES or NO alone for a yes-or-no question, leave when
insulted, and gentle guardrails. What counts as a greeting is `isGreeting` in
`shared/text.ts`.

To hear how they actually sound before you film:

```bash
npm run sample                                    # every spirit on its own model (well under a dollar)
npm run sample -- --spirit fable --effort medium  # one spirit, more thinking
npm run sample -- --model claude-haiku-5-5        # every spirit on one model
```

This greets each spirit three ways, then asks it the same 20 questions after
a `HELLO`, through the real model, and prints the replies side by side with
what the run cost. It flags any reply that breaks the board's format. It reads
`ANTHROPIC_API_KEY` from your shell or from `.dev.vars`.

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
  - The wind (`src/scene/wind.ts`) is a mean breeze, gusts that travel
    across the board, and curl noise for eddies, so the air swirls without
    piling up. The dust and the motes off the flame are moved through it on
    the CPU (`src/scene/air.ts`) and drawn as short streaks. The shaders
    (`src/scene/shaders.ts`) read the same gusts, so each letter leans as a
    gust passes and springs back after.
  - The candle's light (`src/scene/light.ts`) flickers on noise rather than
    on a loop, gutters, bends with the wind and flares while a spirit speaks.
    The shaders light every point with an inverse-square fall-off, and more
    where its stroke's edge faces the flame. The flame, the glow and the
    planchette are soft gradients, not particles.
  - Behind it all, stars drift and the sky turns very slowly
    (`src/scene/sky.ts`). The opening's title is its own set of particles
    (`src/scene/title.ts`), and the camera drifts in while it plays.
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
npm test            # unit tests: layout, dwell, text rules, greetings, wind, spirits, API (with a fake Claude)
npm run test:e2e    # full séances in a real browser at phone and laptop sizes (canned spirits)
```

---

*For entertainment. The spirits are fictional characters played by an AI.
"Ouija" is a trademark of Hasbro, and this project is not affiliated with
it.*
