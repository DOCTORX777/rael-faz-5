import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { applyOpenGraph } from '../scripts/open-graph.mjs';
import { ballContext, planKick, sampleKick } from '../public/kick-motion.js';
import { daysUntil, venueUrls } from '../public/venue.js';
import { VENUE } from '../public/config.js';

const publicFile = (name) => new URL('../public/' + name, import.meta.url);

test('catálogo contém 12 ideias únicas com nome, faixa de preço e WebP nas duas resoluções', async () => {
  const gifts = JSON.parse(await readFile(publicFile('gifts.json'), 'utf8'));
  assert.equal(gifts.length, 12);
  assert.equal(new Set(gifts.map(({ id }) => id)).size, 12);
  for (const { nome, preco, arte } of gifts) {
    assert.ok(nome);
    assert.match(preco, /^R\$ \d+–\d+$/);
    assert.ok((await stat(publicFile('assets/cena/' + arte + '.webp'))).size);
    assert.ok((await stat(publicFile('assets/cena/' + arte + '@2x.webp'))).size);
  }
});

test('gera URLs sociais absolutas a cada build e rejeita localhost', async () => {
  const source = await readFile(publicFile('index.html'), 'utf8');
  assert.doesNotMatch(source, /localhost/i);
  const og = applyOpenGraph(source, 'https://convite.example/sufixo');
  assert.match(og, /property="og:url" content="https:\/\/convite\.example\/"/);
  assert.match(og, /property="og:image" content="https:\/\/convite\.example\/assets\/og\.jpg"/);
  assert.equal(applyOpenGraph(og, 'https://convite.example'), og);
  assert.throws(() => applyOpenGraph(source, 'http://localhost:8898'), /endereço público/);
});

test('sem WebGL ou com movimento reduzido não inicia o renderizador 3D', () => {
  assert.equal(ballContext({ getContext: () => null }, false), null);
  assert.equal(ballContext({ getContext() { throw Error('WebGL bloqueado'); } }, false), null);
  let probes = 0;
  assert.equal(ballContext({ getContext() { probes += 1; return {}; } }, true), null);
  assert.equal(probes, 0);
  const context = {};
  assert.equal(ballContext({ getContext: (id) => id === 'webgl' ? context : null }, false), context);
});

test('chute percorre um arco, retorna à origem e tem uma defesa a cada quatro tentativas', () => {
  const plans = Array.from({ length: 8 }, (_, index) => planKick(360, 270, null, index + 1));
  assert.deepEqual(plans.map(({ saved }) => saved), [false, false, false, true, false, false, false, true]);
  const start = sampleKick(plans[0], 0);
  const flight = sampleKick(plans[0], .25);
  const end = sampleKick(plans[0], 1);
  assert.ok(flight.y < flight.groundY && flight.shadowOpacity < start.shadowOpacity);
  assert.deepEqual([end.x, end.y, end.scale], [start.x, start.y, start.scale]);
  assert.ok(planKick(360, 270, {x: 90, y: -50}, 1).goalX > plans[0].goalX);
});

test('mapa usa o endereço enquanto faltam coordenadas e a data civil usa São Paulo', () => {
  assert.equal(venueUrls({ ...VENUE, lat: 0, lng: 0 }).embed, '');
  const exact = venueUrls({ ...VENUE, lat: -23, lng: -47 });
  assert.equal(new URL(exact.maps).searchParams.get('destination'), '-23,-47');
  assert.equal(new URL(exact.waze).searchParams.get('ll'), '-23,-47');
  assert.equal(new URL(exact.embed).searchParams.get('q'), '-23,-47');
  assert.equal(daysUntil('2026-12-13', new Date('2026-12-13T02:59:00Z')), 1);
  assert.equal(daysUntil('2026-12-13', new Date('2026-12-13T03:00:00Z')), 0);
});
