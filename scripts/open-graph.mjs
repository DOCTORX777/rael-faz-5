import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const marker = '<!-- URLs sociais do deploy -->';

export function applyOpenGraph(html, siteUrl) {
  const { hostname, origin, protocol } = new URL(siteUrl);
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(protocol) || host === 'localhost' || host.endsWith('.localhost')
    || host.endsWith('.local') || !host.includes('.') || /^(127\.|0\.)/.test(host)) {
    throw new Error('Configure SITE_URL com o endereço público do convite.');
  }
  const clean = html.replace(/^[ \t]*<meta property="og:(?:url|image)" content="[^"]*"[^>]*>\r?\n/gm, '');
  if (!clean.includes(marker)) throw new Error('Marcador de Open Graph ausente no convite.');
  return clean.replace(marker, [
    marker,
    '<meta property="og:url" content="' + origin + '/">',
    '<meta property="og:image" content="' + origin + '/assets/og.jpg">'
  ].join('\n  '));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const SITE_URL = process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL;
  const pageFile = new URL('../public/index.html', import.meta.url);
  if (SITE_URL) {
    const source = await readFile(pageFile, 'utf8');
    const page = applyOpenGraph(source, SITE_URL);
    if (page !== source) await writeFile(pageFile, page);
  } else if (process.env.NETLIFY === 'true') {
    throw new Error('Configure SITE_URL com o endereço público do convite.');
  }
}
