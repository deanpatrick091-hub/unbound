# Tavily web search

The existing Tavily catalog entry and research adapter are reused. No SDK or dependency was added, and no AI provider was removed.

## Configuration

Set **TAVILY_API_KEY** in the server environment. It must never have a `NEXT_PUBLIC_` prefix. This integration does not require the older `TAVILY_FREE_TIER_CONFIRMED` flag: adding the legitimate server key enables Tavily. Other integrations keep their existing configuration rules.

On 2026-10-24, metadata inspection found the key in Vercel Production only. For development testing, add it securely in Vercel → Unbound → Settings → Environment Variables, targeting **Preview**, branch **feature/unified-studio**, and redeploy that branch. Keep the existing Production entry. Do not paste the key into chat, source, logs or a browser request.

Tavily documents 1,000 free credits per month and one credit per basic search. Keep pay-as-you-go disabled in the Tavily account if you require a strict free-only budget. The application cannot determine the account's billing plan from the key and does not change billing settings.

## Chat behavior

- Select **+ → Search the web**, or ask explicitly: “Search the web for the latest Next.js release.”
- Conservative rules also recognize current-information questions, news, weather, exchange rates and leadership questions. This is keyword/intent routing, not a universal freshness classifier. Select the tool explicitly if a question is missed; ambiguous follow-ups should name their subject.
- Ordinary chat and creative prompts continue through existing AI providers. Explicitly selected other tools take priority. Instructions such as “do not search” disable automatic routing.
- Only the current message becomes the search query. Conversation history and attached documents are never sent to Tavily. Attachments disable implicit external-tool routing.
- Each request makes one basic search, with `auto_parameters: false`, five results, no raw-page extraction, no images and no Tavily-generated answer. There are no automatic Tavily retries or paid-provider fallbacks.
- Unbound's existing model/fallback system summarizes bounded excerpts. Retrieved text is untrusted evidence with no tool execution. Output is text with numbered citations; clickable source links are assembled from validated URLs. Search results remain available if the summarizing model fails.
- The answer and source list persist as the normal assistant message.

## Failure behavior

Missing key and 401/403 credentials failures explain server setup. HTTP 402/432/433 report credit/account limits, not rate limiting. HTTP 429 respects numeric or HTTP-date Retry-After, with a bounded best-effort cooldown per server instance. Provider quotas remain authoritative across instances. The 15-second timeout covers the search request/response body; cancellation propagates. Invalid JSON, unsafe URLs, empty results and outages never become fabricated answers. Raw upstream error bodies, keys and prompts are not logged by the adapter.

Both chat and the existing integrations endpoint require authentication and usage checks; mutation requests enforce same-origin checks. No database changes are required.

## Verification

Automated tests cover request shape and server auth, missing/invalid keys, HTTP 402/432/433/429/5xx, Retry-After, timeout/cancellation, malformed/empty responses, source URL filtering, synthesis failure, routing, attachment isolation and authenticated chat dispatch. These are fixture tests, not successful live API calls.

With a legitimate key already supplied securely to the local process environment:

```sh
node --import ./scripts/test-loader.mjs scripts/check-tavily.mjs
```

This makes one real basic search and reports only the result count and status; it never prints the key or raw provider errors. It consumes one credit if accepted.

For signed-in Preview testing, select Search the web, ask for a recent public fact, open the returned source links, refresh the chat and verify the source list persists. Verify ordinary chat and image generation still use their existing routes.

## Official references (checked 2026-10-24)

- https://docs.tavily.com/documentation/api-reference/endpoint/search
- https://docs.tavily.com/documentation/api-reference/openapi.json
- https://docs.tavily.com/documentation/api-credits

Checkpoint validation: TypeScript, lint and production build passed; the full suite passed 105 tests, including nine added Tavily/routing tests. No live Tavily success or signed-in Preview search is claimed: the key is Production-only and the isolated Preview still needs its own server setting and sign-in.
