# Free AI connections

Verified against official documentation on 26 September 2026. Free means usage within a recurring no-payment allowance or a zero-priced route, not unlimited compute. Provider prices and availability can change. No new account or API key has been created by this update.

## Connected credentials found in the supplied project

- OpenRouter: enabled. The current catalog contains 18 zero-priced chat choices including the free router. Two harness-only Inkling routes returned 403 and are excluded, leaving 16 selectable OpenRouter choices.
- Google: the existing key supports model discovery. The two Gemma 4 variants are free-only in Google's pricing and enabled; Flash models remain hidden until the account's Free tier is confirmed.
- Groq: catalog authentication succeeded. Chat remains paused until the owner verifies that the organization uses the Free plan.
- Cerebras: removed from selection. The current offer is an expiring, payment-method-required trial.
- Hugging Face: the supplied token was empty.

## Supported connections

| Connection | Models and free scope | What enables it |
|---|---|---|
| OpenRouter | Live zero-priced chat catalog, including `openrouter/free`. Each request enforces zero prompt/completion/request/image price. | `OPENROUTER_API_KEY` |
| Google | Gemma 4 26B A4B and 31B are free-only. Eight eligible Gemini Flash variants are also supported under the Gemini Free tier. | `GEMINI_API_KEY`; add `GEMINI_FREE_TIER_CONFIRMED=true` only after confirming the project has no paid billing tier |
| Groq | Discover active chat models, excluding audio, safeguards and Compound tool systems. Four chat candidates were visible at audit time. | `GROQ_API_KEY` plus `GROQ_FREE_TIER_CONFIRMED=true` for a Free organization |
| Cloudflare | 18 curated chat routes and FLUX.1 Schnell images, sharing Workers Free's 10,000 neurons/day. Paid-only and known deprecated models are excluded. | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_FREE_TIER_CONFIRMED=true` on Workers Free |
| Mistral | Live models supporting chat completion, within the recurring Free-mode allowance. | `MISTRAL_API_KEY`, `MISTRAL_FREE_TIER_CONFIRMED=true`; Free mode and pay-as-you-go OFF |
| Hugging Face | Live chat catalog; 138 models advertised on its public catalog at audit time, before this app's additional non-chat filter. The entire allowance is only $0.10/month. | `HF_TOKEN`, `HUGGINGFACE_FREE_TIER_CONFIRMED=true`; personal Free account, no purchased credits, no paid/custom-provider billing or automatic top-ups |
| Z.ai | Exactly `glm-4.7-flash`, `glm-4.5-flash`, `glm-4.6v-flash`. Paid FlashX, search tools, images and Coding Plan endpoints are excluded. | `ZAI_API_KEY`, `ZAI_FREE_TIER_CONFIRMED=true`; verify the zero-priced models and no paid balance |
| Ollama | Installed completion-capable models discovered from your own running server. No per-token API fees; uses your own hardware and electricity. | `OLLAMA_BASE_URL`; run locally or use an already secured, reachable endpoint |

Supported does not mean connected or response-tested. Missing connections appear as such in the provider folders; their model tiles are not invented. Adding a verified key refreshes the real model list automatically. Cloudflare and Z.ai use curated IDs rather than a live price catalog.

## No-payment configuration

Do not set a confirmation flag merely because a key exists. It records your verification of the provider's actual account/billing configuration, which this app cannot inspect reliably. Recheck the flag if an account plan changes. The app does not purchase credits, enable overage, attach a card, or sign up for services.

The Hugging Face allowance is useful for experimentation, not sustained public traffic. Although many models can be listed, they share the same tiny free balance. Mistral usage is shared across its apps and API. OpenRouter free quotas are shared across models on the account. More tiles do not increase the allowance of a single account.

## Intentionally omitted

- Puter: its user-pays model can require visitors to pay.
- Cerebras: $5 trial expires after 30 days and requires a verified payment method.
- Cohere trial keys: not permitted for production/commercial use.
- One-off promotional credits, unofficial shared keys, and paid image/video APIs.
- Kimi K2.5 on Cloudflare: deprecated and aliased to a paid-only successor.
- `thinkingmachines/inkling:free` and `thinkingmachines/inkling-small:free`: general-chat access explicitly refused in the live audit.

## Official documentation and key pages

- OpenRouter routing/pricing ceiling: https://openrouter.ai/docs/guides/routing/provider-selection
- OpenRouter keys: https://openrouter.ai/keys
- Google pricing: https://ai.google.dev/gemini-api/docs/pricing
- Google keys: https://aistudio.google.com/apikey
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Groq keys: https://console.groq.com/keys
- Cloudflare pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cloudflare deprecations: https://developers.cloudflare.com/changelog/product/workers-ai/
- Cloudflare REST setup: https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- Mistral Free mode: https://docs.mistral.ai/admin/billing-usage/subscriptions
- Mistral API setup: https://docs.mistral.ai/getting-started/quickstarts/developer/first-api-request
- Hugging Face free credit: https://huggingface.co/docs/inference-providers/pricing
- Hugging Face model discovery: https://huggingface.co/docs/inference-providers/hub-api
- Hugging Face tokens: https://huggingface.co/settings/tokens
- Z.ai pricing: https://docs.z.ai/guides/overview/pricing
- Z.ai API setup: https://docs.z.ai/guides/overview/quick-start
- Puter user-pays policy: https://docs.puter.com/user-pays-model/
- Cerebras trial policy: https://inference-docs.cerebras.ai/support/rate-limits
