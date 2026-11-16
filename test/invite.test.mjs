import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleAdmin, handleGiftCounts, handleRsvp } from '../netlify/lib/invite.mjs';

const origin = 'https://convite.example';
const password = 'senha-ficticia-exclusiva-para-testes';
const date = 1794830400000;
const present = (name, guests = []) => ({ name, attending: true, guests });

function memoryStore({ includeReadEtag = true } = {}) {
  const entries = new Map();
  const versions = new Map();
  return {
    entries,
    async get(key) { return entries.get(key) ?? null; },
    async getWithMetadata(key) {
      return entries.has(key) ? { data: entries.get(key), etag: includeReadEtag ? versions.get(key) : undefined } : null;
    },
    async delete(key) { entries.delete(key); versions.delete(key); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...entries.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key, etag: versions.get(key) })) };
    },
    async setJSON(key, data, { onlyIfNew, onlyIfMatch } = {}) {
      if (onlyIfNew && entries.has(key)) return { modified: false };
      if (onlyIfMatch && versions.get(key) !== onlyIfMatch) return { modified: false };
      entries.set(key, data);
      versions.set(key, String(Number(versions.get(key) ?? 0) + 1));
      return { modified: true };
    }
  };
}

function setup() {
  const replies = memoryStore({ includeReadEtag: false });
  const sessions = memoryStore();
  const rate = memoryStore({ includeReadEtag: false });
  const getReplies = () => replies;
  const getSessions = () => sessions;
  return {
    replies,
    sessions,
    rate,
    rsvp(body, { ip, now = date, originHeader = origin, raw } = {}) {
      const request = new Request(origin + '/api/rsvp', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: originHeader },
        body: raw ?? JSON.stringify(body)
      });
      return handleRsvp(request, getReplies, { getRate: () => rate, ip, now });
    },
    admin(action, { cookie, body, method = action === 'replies' ? 'GET' : 'POST', originHeader = origin } = {}) {
      const headers = new Headers({ Origin: originHeader });
      if (cookie) headers.set('Cookie', cookie);
      if (body) headers.set('Content-Type', 'application/json');
      const request = new Request(origin + '/api/admin/' + action, { method, headers, body: JSON.stringify(body) });
      return handleAdmin(request, action, { getReplies, getSessions, password });
    }
  };
}

async function logIn(admin) {
  const response = await admin('login', { body: { username: 'Paloma', password } });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
  return cookie.split(';')[0];
}

test('homônimos com o mesmo grupo e resposta ganham IDs distintos', async () => {
  const { rsvp, replies } = setup();
  const payload = present('João', [{ name: 'Lia', type: 'child' }]);
  const first = await rsvp(payload);
  const second = await rsvp(payload);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const firstId = (await first.json()).id;
  const secondId = (await second.json()).id;
  assert.notEqual(firstId, secondId);
  assert.match(firstId, /^[0-9a-f-]{36}$/);
  assert.equal(replies.entries.size, 2);
});

test('escolha de presente aparece no painel e na contagem pública, e é retirada na recusa', async () => {
  const { rsvp, replies, admin } = setup();
  const editToken = randomUUID();
  const submissionId = randomUUID();
  const record = await rsvp({ ...present('Lúcia'), giftId: 'bola', editToken, submissionId });
  assert.equal(record.status, 201);
  const { id, revision, giftId } = await record.json();
  assert.equal(giftId, 'bola');
  assert.equal((await replies.get(id)).giftId, 'bola');
  assert.equal((await rsvp({ ...present('Outra família'), giftId: 'inexistente' })).status, 400);
  const cookie = await logIn(admin);
  const dashboard = await (await admin('replies', { cookie })).json();
  assert.equal(dashboard.replies[0].giftName, 'Bola de futebol infantil nº 3');
  assert.equal(dashboard.giftCounts.find((gift) => gift.name === dashboard.replies[0].giftName).count, 1);
  const count = async () => (await (await handleGiftCounts(new Request(origin + '/api/gifts'), () => replies)).json()).counts;
  assert.equal((await count()).bola, 1);
  const editedId = randomUUID();
  const change = await rsvp({ name: 'Lúcia', attending: false, guests: [], editToken,
    submissionId: editedId, edit: { id, revision } });
  assert.equal(change.status, 200);
  const editedReply = await change.json();
  assert.equal(editedReply.total, 0);
  assert.equal(editedReply.giftId, null);
  assert.equal((await count()).bola, 0);
  const receipt = await rsvp({ action: 'read', id, editToken, submissionId: editedId });
  assert.equal((await receipt.json()).submissionSaved, true);
});

test('um duplo envio da mesma solicitação devolve a confirmação anterior', async () => {
  const { rsvp, replies } = setup();
  const data = { ...present('João'), submissionId: randomUUID(), editToken: randomUUID() };
  const results = await Promise.all([rsvp(data), rsvp(data)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]);
  const records = await Promise.all(results.map((result) => result.json()));
  assert.deepEqual(records[0], records[1]);
  assert.equal(records[0].id, data.submissionId);
  assert.equal(replies.entries.size, 1);
  assert.equal((await rsvp({ ...data, name: 'Outra pessoa' })).status, 409);
  assert.equal((await rsvp({ ...data, editToken: randomUUID() })).status, 409);
});

test('grava todos os convidados, idade opcional e recado, com nomes Unicode normalizados', async () => {
  const { rsvp, replies } = setup();
  const guests = [
    { name: " D'Ávila  Silva ", type: 'adult' },
    { name: 'Ana-Luísa', type: 'child', age: 7 },
    { name: '⚽', type: 'child' }
  ];
  const result = await rsvp({ ...present('  Zé   ', guests), note: '  Sem amendoim  ' });
  assert.equal(result.status, 201);
  const { id, name, guests: savedGuests, total, companions } = await result.json();
  assert.equal(name, 'Zé');
  assert.equal(total, 4);
  assert.equal(companions, 3);
  assert.deepEqual(savedGuests, [{ ...guests[0], name: "D'Ávila Silva" }, ...guests.slice(1)]);
  const saved = await replies.get(id);
  assert.equal(saved.adults, 1);
  assert.equal(saved.children, 2);
  assert.equal(saved.note, 'Sem amendoim');
});

test('valida nomes, presença, tipo, idade e recado e indica o campo', async () => {
  const { rsvp, replies } = setup();
  const bad = [
    [present('  '), 'name'],
    [present('💛'.repeat(101)), 'name'],
    [{ name: 'Zé', attending: 'yes', guests: [] }, 'attendance'],
    [present('Zé', [{ name: '', type: 'child' }]), 'guests.0.name'],
    [present('Zé', [{ name: 'Lia', type: 'other' }]), 'guests.0.type'],
    [present('Zé', [{ name: 'Lia', type: 'child', age: 20 }]), 'guests.0.age'],
    [{ ...present('Zé'), note: 'a'.repeat(301) }, 'note']
  ];
  for (const [payload, field] of bad) {
    const response = await rsvp(payload);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).field, field);
  }
  assert.equal(replies.entries.size, 0);
  assert.equal((await rsvp(present('💛'.repeat(100)))).status, 201);
});

test('aceita cinquenta acompanhantes e corpo acima de 4 KB até o limite de 64 KiB', async () => {
  const { rsvp, replies } = setup();
  const guests = Array.from({ length: 50 }, () => ({ name: '⚽'.repeat(90), type: 'adult' }));
  const allowed = await rsvp(present('Zé', guests));
  assert.equal(allowed.status, 201);
  assert.equal((await allowed.json()).total, 51);
  const excess = await rsvp(present('Zé', [...guests, guests[0]]));
  assert.equal(excess.status, 400);
  assert.equal((await excess.json()).field, 'guests');
  const large = await rsvp(null, { raw: JSON.stringify({ ...present('Zé'), note: 'a'.repeat(65 * 1024) }) });
  assert.equal(large.status, 413);
  assert.equal(replies.entries.size, 1);
});

test('bloqueia honeypot e origem externa sem gravar resposta', async () => {
  const { rsvp, replies } = setup();
  const bot = await rsvp({ ...present('Robô'), website: 'https://example.com' });
  assert.equal(bot.status, 400);
  assert.equal((await rsvp(present('Zé'), { originHeader: 'https://outro.example' })).status, 403);
  assert.equal(replies.entries.size, 0);
});

test('limita envios por IP na mesma janela sem limitar outro IP ou minuto', async () => {
  const { rsvp, replies } = setup();
  const ip = '192.0.2.2';
  for (let index = 0; index < 12; index += 1) {
    assert.equal((await rsvp(present('Lia'), { ip })).status, 201);
  }
  const limited = await rsvp(present('Lia'), { ip });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);
  assert.equal((await rsvp(present('Lia'), { ip: '192.0.2.3' })).status, 201);
  assert.equal((await rsvp(present('Lia'), { ip, now: date + 60000 })).status, 201);
  assert.equal(replies.entries.size, 14);
});

test('editar com autorização atualiza o mesmo registro e recusa zera o grupo', async () => {
  const { rsvp, replies } = setup();
  const id = randomUUID();
  const editToken = randomUUID();
  const first = await rsvp({ ...present('Ana', [{ name: 'Lia', type: 'child' }]), submissionId: id, editToken, note: 'Recado original' });
  assert.equal(first.status, 201);
  const check = await rsvp({ action: 'read', id, editToken });
  assert.equal((await check.json()).note, 'Recado original');
  assert.equal((await rsvp({ action: 'read', id, editToken: randomUUID() })).status, 404);
  const payload = { name: 'Ana', attending: false, guests: [], submissionId: randomUUID(), editToken, edit: { id, revision: 1 } };
  assert.equal((await rsvp({ ...payload, editToken: randomUUID() })).status, 404);
  const edited = await rsvp(payload, { now: date + 1000 });
  assert.equal(edited.status, 200);
  assert.deepEqual(await edited.json(), { id, name: 'Ana', attending: false, total: 0, companions: 0, revision: 2, guests: [] });
  assert.equal((await rsvp(payload)).status, 200);
  assert.equal((await rsvp({ ...payload, submissionId: randomUUID() })).status, 409);
  assert.equal(replies.entries.size, 1);
  const saved = await replies.get(id);
  assert.notEqual(saved.submittedAt, saved.updatedAt);
  assert.notEqual(saved.editProof, editToken);
});

test('permite repetir depois de falha de gravação', async () => {
  const { rsvp, replies } = setup();
  const write = replies.setJSON;
  replies.setJSON = async () => { throw new Error('falha simulada'); };
  const payload = { ...present('Ana Lima'), submissionId: randomUUID(), editToken: randomUUID() };
  const failed = await rsvp(payload);
  assert.equal(failed.status, 503);
  assert.match((await failed.json()).error, /Tente novamente/);
  replies.setJSON = write;
  assert.equal((await rsvp(payload)).status, 201);
  assert.equal(replies.entries.size, 1);
});

test('painel inclui legados e conta adultos, crianças e tipo desconhecido', async () => {
  const { rsvp, admin, replies } = setup();
  const dated = { attending: true, submittedAt: '2026-11-12T12:00:00.000Z' };
  const legacyId = 'a'.repeat(64);
  await replies.setJSON(legacyId, { ...dated, name: 'Carlos', companions: 3, total: 4 });
  await replies.setJSON('b'.repeat(64), { ...dated, name: 'Luísa', adults: 2, children: 1 });
  await rsvp({ ...present('Ana', [{ name: 'Lia', type: 'child', age: 0 }]), note: 'Sem leite', submissionId: randomUUID(), editToken: randomUUID() });
  await rsvp({ name: 'Bia', attending: false, guests: [] });
  const cookie = await logIn(admin);
  const response = await admin('replies', { cookie });
  assert.equal(response.status, 200);
  const { replies: listed, totals } = await response.json();
  assert.deepEqual(totals, { attending: 3, declined: 1, companions: 7, expected: 10, adults: 5, children: 2, unknown: 3 });
  assert.equal(listed.find((record) => record.id === legacyId).unknown, 3);
  assert.equal(listed.find((record) => record.name === 'Ana').note, 'Sem leite');
  assert.equal(listed.find((record) => record.name === 'Ana').guests[0].age, 0);
  for (const record of listed) {
    assert.ok(!Object.hasOwn(record, 'editProof'));
    assert.ok(!Object.hasOwn(record, 'lastSubmissionId'));
  }
});

test('compatibilidade de entrada com companions e a divisão legada', async () => {
  const { rsvp, replies } = setup();
  const first = await rsvp({ name: 'Carlos', attending: true, companions: 3 });
  const second = await rsvp({ name: 'Luísa', attending: true, adults: 2, children: 1, companions: 3 });
  for (const response of [first, second]) {
    assert.equal(response.status, 201);
    assert.equal((await response.json()).total, 4);
  }
  assert.equal(replies.entries.size, 2);
});

test('ignorar e excluir exigem sessão e POST, ignorar retira dos totais e pode ser revertido', async () => {
  const { rsvp, admin, sessions } = setup();
  const id = (await (await rsvp(present('Lia', [{ name: 'Ana', type: 'child' }]))).json()).id;
  const body = { id, ignored: true };
  assert.equal((await admin('login', { body: { username: 'Paloma', password: 'incorreta' } })).status, 401);
  assert.equal((await admin('replies')).status, 401);
  assert.equal((await admin('ignore', { body })).status, 401);
  assert.equal((await admin('delete', { body })).status, 401);
  const cookie = await logIn(admin);
  assert.equal((await admin('delete', { method: 'GET', cookie })).status, 405);
  assert.equal((await admin('ignore', { method: 'GET', cookie })).status, 405);
  assert.equal((await admin('ignore', { cookie, body, originHeader: 'https://outro.example' })).status, 403);
  assert.equal((await admin('ignore', { cookie, body })).status, 200);
  const ignored = await (await admin('replies', { cookie })).json();
  assert.equal(ignored.replies[0].ignored, true);
  assert.equal(ignored.totals.expected, 0);
  assert.equal(ignored.totals.children, 0);
  assert.equal((await admin('ignore', { cookie, body: { id, ignored: false } })).status, 200);
  assert.equal((await (await admin('replies', { cookie })).json()).totals.expected, 2);
  assert.equal((await admin('delete', { cookie, body })).status, 200);
  assert.deepEqual((await (await admin('replies', { cookie })).json()).replies, []);
  assert.equal((await admin('logout', { cookie, body: {} })).status, 200);
  assert.equal(sessions.entries.size, 0);
  assert.equal((await admin('delete', { cookie, body })).status, 401);
});
