import type { SiteFiles } from "@/lib/build/types";
import { getStyle, type DesignConfig } from "@/lib/design/registry";
import { DESIGN_RUNTIME } from "@/lib/design/runtime";

const HEAD_START = "<!-- UNBOUND_DESIGN_HEAD_V1 -->";
const HEAD_END = "<!-- /UNBOUND_DESIGN_HEAD_V1 -->";
const BODY_START = "<!-- UNBOUND_DESIGN_BODY_V1 -->";
const BODY_END = "<!-- /UNBOUND_DESIGN_BODY_V1 -->";

/** Managed blocks are stripped before AI editing and replaced once, never recursively appended. */
export function stripDesign(files: SiteFiles): SiteFiles {
  const html = files["index.html"];
  if(!html) return {...files};
  return {...files,"index.html":html.replace(/<!-- UNBOUND_DESIGN_HEAD_V1 -->[\s\S]*?<!-- \/UNBOUND_DESIGN_HEAD_V1 -->/g,"").replace(/<!-- UNBOUND_DESIGN_BODY_V1 -->[\s\S]*?<!-- \/UNBOUND_DESIGN_BODY_V1 -->/g,"")};
}

export function designCss(config: DesignConfig): string {
  if(!config.styles.length) return "";
  const primary = getStyle(config.styles[0]);
  const intensity = {subtle:.35,balanced:.6,expressive:.85,maximum:1}[config.motion];
  const variables = Object.entries(primary.tokens).map(([key,value])=>`--ub-${key}:${value}`).join(";");
  return `:root{${variables};--ub-speed:${config.speed*(.6+intensity*.8)};--ub-intensity:${intensity};--ub-dot:${Math.max(4,14-config.density/8)}px}
:where(body){margin:0;background:var(--ub-background);color:var(--ub-ink);font:16px/1.6 var(--ub-font)}
:where(h1,h2,h3){font-family:var(--ub-heading);line-height:1.08;text-wrap:balance}
.ub-display{font-family:var(--ub-heading);font-size:clamp(2.5rem,7vw,6rem);line-height:1.02;letter-spacing:-.04em}
.ub-lead{max-width:58ch;font-size:clamp(1rem,2vw,1.2rem)}
.ub-card{background:var(--ub-surface);border:1px solid var(--ub-border);border-radius:var(--ub-radius);padding:clamp(1rem,3vw,2rem)}
.ub-button{display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:44px;padding:.6em 1.1em;background:var(--ub-accent);color:var(--ub-background);border:1px solid transparent;border-radius:var(--ub-radius);font:600 1rem var(--ub-font);text-decoration:none;cursor:pointer;transition:transform calc(.18s / var(--ub-speed)),box-shadow .18s}
.ub-button:hover{transform:translateY(calc(-2px * var(--ub-intensity)))}
:where(a,button,input,select,textarea):focus-visible{outline:3px solid var(--ub-accent);outline-offset:4px}
.ub-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:clamp(1rem,3vw,2rem)}
.ub-art{position:relative;min-height:240px;overflow:hidden;isolation:isolate;pointer-events:none}
.ub-motion-toggle{position:fixed;z-index:1000;right:10px;bottom:10px;padding:7px 12px;min-height:36px;border:1px solid var(--ub-border);border-radius:50px;background:var(--ub-surface);color:var(--ub-ink);font:12px var(--ub-font);cursor:pointer}
@keyframes ub-float{to{transform:translateY(calc(-12px * var(--ub-intensity))) rotate(5deg)}}
${[...config.styles].sort((a,b)=>(a==="glass"?-1:a==="mesh"?1:0)-(b==="glass"?-1:b==="mesh"?1:0)).map(id=>getStyle(id).css).join("\n")}
@media(max-width:600px){.ub-art{min-height:180px}.ub-cube{scale:.8}}
html[data-ub-paused="true"] .ub-art,html[data-ub-paused="true"] .ub-art *,html[data-ub-paused="true"] .ub-art:before,html[data-ub-paused="true"] .ub-art:after,html[data-ub-paused="true"] .ub-reveal{animation:none!important;transition:none!important}
${config.reducedMotion?'.ub-art,.ub-art *,.ub-art:before,.ub-art:after,.ub-reveal,.ub-button{animation:none!important;transition:none!important;transform:none}':""}
@media(prefers-reduced-motion:reduce){.ub-art,.ub-art *,.ub-art:before,.ub-art:after,.ub-reveal,.ub-button{animation:none!important;transition:none!important;scroll-behavior:auto!important}.ub-reveal{clip-path:none!important;transform:none!important}}
`;
}

/** Inject trusted, fixed runtime without modifying generated scripts or other files. Export uses these same bytes. */
export function applyDesign(files: SiteFiles, config: DesignConfig): SiteFiles {
  const clean = stripDesign(files);
  const html = clean["index.html"];
  if(!html || !config.styles.length) return clean;
  if(!/<\/head\s*>/i.test(html) || !/<\/body\s*>/i.test(html)) throw new Error("The site needs a complete head and body before applying a design.");
  const payload = JSON.stringify(config).replace(/</g,"\\u003c");
  const head = `${HEAD_START}<style id="ub-design-style">${designCss(config)}</style>${HEAD_END}`;
  const body = `${BODY_START}<script type="application/json" id="ub-design-config">${payload}</script><script>${DESIGN_RUNTIME}</script>${BODY_END}`;
  return {...clean,"index.html":html.replace(/<\/head\s*>/i,()=>`${head}</head>`).replace(/<\/body\s*>/i,()=>`${body}</body>`)};
}

export function designInstructions(config: DesignConfig): string {
  if(!config.styles.length) return "";
  const primary=getStyle(config.styles[0]);
  return `\nPROJECT DESIGN SYSTEM (persistent v1): ${config.styles.map(id=>getStyle(id).name).join(" + ")}.\n${config.styles.map(id=>getStyle(id).direction).join("\n")}\nUse these design tokens throughout: ${JSON.stringify(primary.tokens)}. The server supplies --ub-background, --ub-surface, --ub-ink, --ub-accent, --ub-border, --ub-radius, --ub-heading and --ub-font CSS variables; use them in styles.css. Use reusable .ub-card, .ub-button, .ub-display, .ub-lead, .ub-grid components where appropriate. Include exactly one empty decorative <div class="ub-art" aria-hidden="true"></div> in a thoughtful hero or illustration position; the trusted runtime renders the chosen effect there. For kinetic text use .ub-reveal on a heading. The engine supplies the motion controls and artwork. Do not duplicate its animation scripts or managed blocks. Motion is ${config.motion}, speed ${config.speed}, reduced motion ${config.reducedMotion}. Preserve this identity across edits and new sections; keep meaningful content and interactions outside the decorative art. Use a composition suited to the request, not the gallery demo.`;
}

/** Representative rendered sample, not an AI-generated customer website. */
export function designDemo(config: DesignConfig): SiteFiles {
  const name=config.styles.length?getStyle(config.styles[0]).name:"Design preview";
  return applyDesign({"index.html":`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} — design sample</title><link rel="stylesheet" href="styles.css"></head><body><header><a href="#main">FORM / STUDIO</a><a href="#details">Discover ↗</a></header><main id="main"><section class="hero"><div><p class="eyebrow">${name} · MATERIAL STUDY 01</p><h1 class="ub-display ub-reveal">A different<br>point of view.</h1><p class="ub-lead">Considered details. A clear direction. An experience that makes room for what matters.</p><a class="ub-button" href="#details">Explore the details ↗</a></div><div class="ub-art" aria-hidden="true"></div></section><section class="ub-grid" id="details"><article class="ub-card"><h2>Built with intention.</h2><p>Typography, spacing and materials work as one coherent system.</p></article><article class="ub-card"><h2>Made for everyone.</h2><p>Responsive composition and motion that respects your preferences.</p></article></section></main><footer>FORM / STUDIO <span>Independent by design.</span></footer></body></html>`,"styles.css":`*{box-sizing:border-box}html{scroll-behavior:smooth}body{min-width:0}a{color:inherit}header,main,footer{max-width:1120px;margin:auto;padding:24px clamp(20px,5vw,60px)}header,footer{display:flex;justify-content:space-between;gap:24px;font-size:12px;letter-spacing:.05em}header a{text-decoration:none}header{border-bottom:1px solid var(--ub-border)}.hero{display:grid;grid-template-columns:1.2fr 1fr;gap:32px;align-items:center;padding:32px 0 56px}.hero h1{margin:18px 0;font-size:clamp(2.5rem,6vw,4.8rem)}.hero p{margin-bottom:24px}.hero .ub-art{min-height:320px}.eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase}.ub-card h2{font-size:23px;margin-top:0}.ub-card p{margin-bottom:0;font-size:15px}footer{padding-top:48px;padding-bottom:56px}@media(max-width:600px){.hero{grid-template-columns:1fr;padding-top:10px;gap:20px}.hero .ub-art{min-height:200px}.ub-display{font-size:clamp(2.5rem,11vw,4rem)}footer{flex-wrap:wrap}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`},config);
}
