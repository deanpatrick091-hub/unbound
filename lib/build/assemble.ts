import type { SiteFiles } from "@/lib/build/types";

/**
 * Turns the generated files into one self-contained HTML document for the
 * sandboxed preview, and injects the Content-Security-Policy that keeps the
 * generated code isolated from UNBOUND.
 *
 * Client-safe (no secrets). Used by the iframe (srcdoc) and the new-tab route.
 */

/**
 * What generated pages may do:
 *  - run their own inline scripts and libraries from a few well-known CDNs
 *  - load styles/fonts from Google Fonts and the same CDNs
 *  - show images from any https origin
 * What they may NOT do:
 *  - talk to any server (no fetch / XHR / WebSocket / beacons)
 *  - embed frames, submit forms anywhere, or change the base URL
 * Combined with the iframe's sandbox (no allow-same-origin) the page has an
 * opaque origin: no cookies, no localStorage, no credentialed requests.
 */
export const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net",
  "font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net data:",
  "img-src https: data: blob:",
  "media-src https: data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** Sandbox flags for both the iframe attribute and the new-tab CSP header. */
export const PREVIEW_SANDBOX = "allow-scripts allow-popups allow-forms allow-modals allow-popups-to-escape-sandbox";

const EMPTY_DOCUMENT = `<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`;

/**
 * Builds the preview document. Local references to styles.css / script.js
 * are inlined (there is no file system inside srcdoc); external URLs are
 * left alone for the CSP to police.
 */
export function assembleDocument(files: SiteFiles): string {
  let html = files["index.html"]?.trim() || EMPTY_DOCUMENT;

  if (!/<html[\s>]/i.test(html)) {
    html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  }
  if (!/<head[\s>]/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, `<html$1><head><meta charset="utf-8"></head>`);
  }

  const css = files["styles.css"];
  const js = files["script.js"];

  // Inline local stylesheet links.
  html = html.replace(
    /<link\b[^>]*href=["'](?:\.\/)?styles\.css["'][^>]*>/gi,
    () => css !== undefined ? `<style>\n${escapeStyle(css)}\n</style>` : "",
  );
  // Inline local script tags (self-closing or with empty body).
  html = html.replace(
    /<script\b[^>]*src=["'](?:\.\/)?script\.js["'][^>]*>\s*<\/script>/gi,
    (tag) => {
      if (js === undefined) return "";
      // Preserve module/Babel type when inlining the generated local asset.
      const type = tag.match(/\btype=["'](module|text\/babel|text\/javascript)["']/i)?.[1];
      return `<script${type ? ` type="${type}"` : ""}>\n${escapeScript(js)}\n</script>`;
    },
  );

  // Append assets the page forgot to reference so nothing is silently lost.
  if (css !== undefined && !html.includes(escapeStyle(css))) {
    html = html.replace(/<\/head>/i, () => `<style>\n${escapeStyle(css)}\n</style></head>`);
  }
  if (js !== undefined && !html.includes(escapeScript(js))) {
    html = html.replace(/<\/body>/i, () => `<script>\n${escapeScript(js)}\n</script></body>`);
  }

  // CSP and viewport go first in <head>; a generated <meta CSP> later in the
  // document cannot loosen this one (policies only intersect).
  const headExtras =
    `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">` +
    (/<meta[^>]+name=["']viewport["']/i.test(html) ? "" : `<meta name="viewport" content="width=device-width, initial-scale=1">`);
  html = html.replace(/<head([^>]*)>/i, `<head$1>${headExtras}`);

  return html;
}

/** `</style>` inside CSS would terminate the tag early. */
function escapeStyle(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

/** `</script>` inside JS would terminate the tag early. */
function escapeScript(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}

export function siteByteSize(files: SiteFiles): number {
  return Object.values(files).reduce((n, content) => n + (content ? new TextEncoder().encode(content).length : 0), 0);
}
