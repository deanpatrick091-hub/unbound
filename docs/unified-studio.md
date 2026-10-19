# Unified chat and Studio — implementation checkpoint

This is an incremental upgrade of Unbound, not a replacement application.

## Implemented

- Standard `/api/chat` dispatches an allowlisted tool selected in the composer; explicit image/video creation requests can also route automatically.
- Public repository/domain reads, Wikipedia, Crossref, OpenAlex, Semantic Scholar, arXiv, Jina Reader, npm and Open Library use existing authenticated request limits and fixed server adapters.
- GitHub uses the existing per-user encrypted OAuth connection and read-only MCP tool allowlist. Account connection is checked before planning; resource identifiers must be present in the user's message. No write operations or autonomous follow-up tool calls.
- Image/video API handlers are shared with chat. Existing provider routing, consent, owner checks and history remain intact. Successful media references persist in assistant messages and reopen in chat. Queue polling does not resubmit generation.
- Plugins is the integration directory; Studio reuses existing Build projects; Library links to saved image/video workspaces. Existing `/build`, `/image-gen`, `/video-gen` URLs remain valid. `/tools` redirects to Studio.
- npm public package search and Open Library book metadata adapters added. No API key, installation or code execution involved.

## Self-hosted video option

The deployed Hugging Face → fal.ai Wan model returned a credit failure in the earlier investigation. This is not resolved by retries. Existing providers are preserved.

A ComfyUI adapter uses the official self-hosted `/prompt`, `/history/{prompt_id}`, `/view`, `/queue` APIs. It runs an **owner-reviewed workflow**, changes only the positive text prompt, accepts MP4 output from the configured output node, bounds downloads to 24 MiB, and uses authenticated HTTPS without redirects. It never accepts workflow code or remote URLs from a user/model.

This initial adapter fits the current background generation architecture: 270 seconds maximum generation, persisted video job/status and saved MP4. It is **not an unlimited-duration durable worker**. A host interruption can stop collection; stale jobs become failed rather than falsely complete. Cancellation stops tracking; an already-running ComfyUI job may continue. It never globally interrupts a shared worker.

No GPU worker is connected or live-tested. Hardware/electricity are not free. No claim of free hosted video generation is made.

### Owner configuration (server-side only)

1. Install official ComfyUI on hardware compatible with a video model whose license allows your intended use. Use local model nodes, not paid partner/API nodes.
2. Generate a landscape MP4 in ComfyUI and verify it finishes within 4½ minutes and is under 24 MiB. Export the workflow in API format.
3. Place the worker behind an authenticated HTTPS reverse proxy. **ComfyUI does not provide the Bearer-token protection assumed here**: configure the proxy to check the token and expose only the required endpoints. Do not publish an unprotected ComfyUI server.
4. Configure:
   - `COMFYUI_VIDEO_URL`: worker HTTPS origin, ending `/`.
   - `COMFYUI_VIDEO_API_KEY`: reverse-proxy secret, at least 32 characters.
   - `COMFYUI_VIDEO_WORKFLOW`: exported API-format JSON, as a server environment variable.
   - `COMFYUI_VIDEO_PROMPT_NODE`: node whose `inputs.text` is the positive prompt.
   - `COMFYUI_VIDEO_OUTPUT_NODE`: node returning an MP4 in `videos`, `gifs` or `images` output metadata.
   - `COMFYUI_VIDEO_ENABLED=true`.
   - `COMFYUI_VIDEO_VERIFIED=true` only after verifying the actual worker workflow and authorization.
5. Redeploy Preview and test an MP4 generation/playback before enabling this in production. No fallback into a paid provider is performed after the configured worker fails.

Official sources reviewed 2026-10-19:
- https://docs.comfy.org/development/comfyui-server/comms_routes
- https://github.com/Lightricks/LTX-Video (model hardware/license varies by release)
- https://huggingface.co/docs/hub/spaces-zerogpu (limited shared demo GPU access is not a guaranteed production video API)
- https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md
- https://openlibrary.org/developers/api
- https://openlibrary.org/dev/docs/api/search

## Verification at checkpoint

- TypeScript: passed after `next typegen`.
- Lint: passed.
- Production build: passed.
- Automated tests: 91 passed, including media reference validation, explicit tool consent, read-only selection, ComfyUI request/poll/download contract using fixtures, credential failures and existing OAuth/image tests.
- Real npm request: 5 results; real Open Library request: 5 results.
- Previous production AI Horde image generation/persistence/download test remains documented in `docs/image-generation.md`.
- New signed-in chat UI flow: pending Preview verification.
- ComfyUI: fixture-tested only; no configured GPU worker.
- GitHub live read: depends on an authorized per-user connection; credentials remain scoped to the earlier MCP Preview branch.

## Not yet complete

This checkpoint does not implement Slack/Google personal-account OAuth, general attachment parsing, complete media editing/enhancement, or unlimited-duration self-hosted jobs. Specialist integrations not yet in chat retain their existing workspace rather than pretending to work through chat. No production schema changes are required by this checkpoint.
