# Free model verification — 28 September 2026

Production: https://unbound-lilac.vercel.app

## Connections
- OpenRouter: existing key validated; API reports a free-tier account. Discovery accepts only zero-priced models and requests enforce a zero-price ceiling.
- Google: the existing masked key matched the AI Studio project displaying Free tier. GEMINI_FREE_TIER_CONFIRMED enabled.
- Groq: the existing masked key matched the organization displaying Free, $0, Current Plan. GROQ_FREE_TIER_CONFIRMED enabled.
- No provider was removed. No paid account, billing upgrade, or Supabase private/service-role key was used.

## Real streamed-response tests
30 provider/model options were tested, including OpenRouter's free router.
24 returned a completed, nonempty response.
- OpenRouter: 14 of 16 passed after one retry of initial failures.
- Google: 6 of 10 passed.
- Groq: all 4 passed (Allam 2 7B, GPT-OSS 120B, GPT-OSS 20B, Qwen 3.8 27B).

Two Google 2.5 endpoints returned 404 despite appearing in the catalog. Google's documentation says these are restricted to legacy users. They were excluded from this project's selectable list. That leaves 28 eligible options, subject to live discovery.

Four options had temporary upstream failures at the last completed test:
- OpenRouter Gemma 4 26B: rate limited; direct Google Gemma 4 26B passed.
- OpenRouter Qwen 3.8 27B: rate limited; direct Groq Qwen 3.8 27B passed.
- Google Gemini 3.5 Flash: upstream 503.
- Google Gemini 3.7 Flash: timed out after 30 seconds.

A later retry of the last two was interrupted when the execution connection dropped; its outcome is unknown. Do not treat these test results as an uptime guarantee. Provider capacity and free quotas can change.

## Application verification
- Production OpenRouter chat returned a formatted answer.
- Production Google Gemma chat returned a completed answer.
- Conversation persisted after reload.
- Black dark theme, neutral light theme, and high-contrast wallpaper were visually checked.
- User and assistant messages, chat headings, and composer hints have independent readable glass surfaces.
- UI production build and all 14 regression tests passed before the final catalog-only edit.
