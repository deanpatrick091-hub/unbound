import type {SiteFiles} from './types';
export type QualityIssue={code:string;message:string;severity:'error'|'warning'};
/** Static preflight only. Never executes generated JavaScript or claims visual testing. */
export function inspectSite(files:SiteFiles):QualityIssue[]{
 const html=files['index.html']??'';const issues:QualityIssue[]=[];
 const add=(code:string,message:string,severity:'error'|'warning'='warning')=>issues.push({code,message,severity});
 if(!/<html[\s>]/i.test(html)||!/<\/html\s*>/i.test(html)||!/<body[\s>]/i.test(html)||!/<\/body\s*>/i.test(html))add('document','Return a complete HTML document with closing body and html tags.','error');
 for(const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)){
 const ref=match[1];if(/^(?:\.\/)?(?:styles\.css|script\.js)$/.test(ref)&&!files[ref.replace(/^\.\//,'') as keyof SiteFiles]?.trim())add('missing-file',`Referenced file ${ref} is missing.`,'error');
 if(/^(?:\.\/)?[^:/?#]+\.html(?:[?#].*)?$/.test(ref)&&!/^\.?\/?index\.html(?:[?#].*)?$/.test(ref))add('missing-page',`Navigation references an unsupported page: ${ref}. Use working section links in this static workspace.`,'error');
 }
 if(!/<title>[^<]+<\/title>/i.test(html))add('title','Add a descriptive page title.');
 if(!/<html[^>]+lang\s*=/i.test(html))add('language','Declare the document language.');
 if(!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(html))add('viewport','Add a mobile viewport meta tag.');
 if(!/<meta[^>]+name\s*=\s*["']description["']/i.test(html))add('description','Add an SEO description.');
 if(!/<main[\s>]/i.test(html))add('landmark','Use a main landmark.');
 if(/<img\b(?![^>]*\balt\s*=)[^>]*>/i.test(html))add('alt','Some images are missing alternative text.');
 if(/href\s*=\s*["']#["']/i.test(html))add('placeholder-link','Replace placeholder links with meaningful destinations.');
 if(/<form[\s>]/i.test(html))add('form','Review form behaviour: this static workspace has no connected form backend.');
 return issues;
}
