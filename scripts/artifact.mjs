// Готовит собранную игру к публикации ссылкой: страница без собственных
// <html>/<head>/<body> (их добавляет площадка), <title> в самом начале.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const title = html.match(/<title>([\s\S]*?)<\/title>/)[1];
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
const out = [`<title>${title}</title>`, ...styles, body, ...scripts].join('\n');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/korolevstvo.html', out);
console.log('dist/korolevstvo.html', Math.round(out.length / 1024) + ' KB', 'scripts:', scripts.length, 'styles:', styles.length);
