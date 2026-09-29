// Кладёт собранную игру в docs/index.html — в репозиторий: оттуда её отдают
// githack (ссылка для друзей) и, при желании, GitHub Pages (папка /docs).
import { copyFileSync, mkdirSync, statSync } from 'node:fs';

mkdirSync('docs', { recursive: true });
copyFileSync('dist/index.html', 'docs/index.html');
console.log('docs/index.html', Math.round(statSync('docs/index.html').size / 1024) + ' KB');
