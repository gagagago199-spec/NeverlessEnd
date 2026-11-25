# NeverLess • Mobile Legends Lab

A separate feature set for the NeverLess **main Discord bot** (`BOT_MODE=main`). No OpenAI key, additional bot, or extra Railway service is required.

## Discord setup

After deployment, `/mlbb help` displays the features. The existing `guild.commands.set(commands)` registers the `/mlbb` command for each guild when NeverLess starts. All replies are ephemeral by default. The training leaderboard is accessible through a private ephemeral response, and public profiles are opt-in.

## Included features

- `/mlbb link`, `verify`, `confirm`, `profile`, `unlink` — manual role/zone link; optional one-time authenticated identity lookup through a third-party API with an in-game mail code (never store a token or password)
- `/mlbb update`, `rate`, `progress` — self-entered rank and win rate, evidence-weighted estimate, mathematically correct required-win count
- `/mlbb mastery`, `hero`, `collection` — hero mastery logs, community hero stats, collection *breadth* score (not a resale appraisal)
- `/mlbb match`, `coach` — match journaling, KDA, rotation/objective guidance and measurable improvement tasks
- `/mlbb meta`, `draft`, `roulette` — seven-day ranked hero data, counters and lane hero selection
- `/mlbb quiz`, `challenge`, `leaderboard` — macro/draft multiple-choice buttons, daily missions, bounded training points (self-reported matches are not verified)
- `/mlbb privacy` — opt in/out of public profile visibility

## External API & truthfulness

The Rone Arena API at `https://arena.fastapicloud.dev/api` (fallback `https://arena.rone.dev/api`) is unofficial, subject to throttling, deprecation and outages. Public hero requests have a 12-minute in-process cache. Authenticated profile read uses one-time credentials and performs an optional logout. Profile identity is marked as verified only when the returned role and zone match. Manual rank, stats, hero mastery and match logs remain labelled **manually entered** even on a verified profile. In-game mail verification and historical matches are not guaranteed to be available on every account or server; there is no direct official Moonton integration. The code never asks for a Moonton password and never stores the JWT or the OTP.

The public ranked API's win, pick and ban rates are statistical associations, not guarantees of success. Account collection score describes the amount/rarity of manually reported inventory, *not* a financial estimate. No automatic screenshot OCR or match-replay AI is claimed.

## Persistence & security

Records are compressed and stored one per player in the dedicated private `neverless-mlbb-data` Discord channel, with a local fallback file in `DATA_DIR`. Channel permissions are checked; it refuses to write records if `@everyone` can view the channel. On Railway the local filesystem is ephemeral, so persistent storage requires the private data channel. `/mlbb unlink` removes the record. Public profile sharing is off by default. Do not grant untrusted roles access to the internal data channel. Keep `Rone Arena` login confirmations ephemeral, and never send game passwords, OTPs or JWTs to public channels.

## Validation

```bash
node --test src/mlbb/core.test.js
node --check src/mlbb/commands.js
node --check src/mlbb/core.js
node --check src/mlbb/arena.js
node --check src/mlbb/data.js
```

### Troubleshooting

If slash commands do not appear, verify `NeverlessEnd` is online and that `Registered ... commands` logged on guild startup. If online hero endpoints fail, the API may be unavailable; self-reported commands, coaching and quizzes still work. If persistence warns about `No private MLBB data channel`, give the main bot Manage Channels permission to create a private `neverless-mlbb-data` channel. If creation fails, the local fallback is ephemeral on Railway.
