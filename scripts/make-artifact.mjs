// Turns the single-file preview build into a page for a claude.ai preview link.
// The host wraps the page in its own <html>/<head>/<body>, so only the title,
// font link, styles, root element and the module script are kept.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-preview/index.html', 'utf8');
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const scripts = [...html.matchAll(/<script type="module"[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n');
if (!scripts) throw new Error('no module script found in the build');
const page = `<title>鉤織 3D 工作室</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Huninn&family=Noto+Sans+TC:wght@400;500;700&family=JetBrains+Mono:wght@500;700&display=swap">
${styles}
<div id="root"></div>
${scripts}
`;
writeFileSync('dist-preview/artifact.html', page);
console.log(`dist-preview/artifact.html ${(page.length / 1024).toFixed(0)} KB`);
