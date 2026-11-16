import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import gifts from '../../public/gifts.json' with { type: 'json' };

const SESSION_AGE = 8 * 60 * 60;
const COOKIE_NAME = 'rael_admin_session';
const MAX_BODY = 64 * 1024;
const MAX_GUESTS = 50;
const RATE_LIMIT = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LEGACY_ID = /^[0-9a-f]{64}$/;
const giftIds = new Set(gifts.map((item) => item.id));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const sessionProof = (password, key) => createHmac('sha256', password).update(key).digest('hex');
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', ...headers }
});
const error = (message, status, field) => json({ error: message, ...(field && { field }) }, status);
const methodNotAllowed = (allow) => json({ error: 'Método indisponível.' }, 405, { Allow: allow });
const normalizeName = (value) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ').normalize('NFC') : '';
const tooLong = (value, max) => [...value].length > max;
const isCount = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const isUuid = (value) => typeof value === 'string' && UUID.test(value);
const sameSecret = (value, expected) => typeof expected === 'string'
  && expected.length === 64 && timingSafeEqual(Buffer.from(digest(value)), Buffer.from(expected));

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return request.headers.get('sec-fetch-site') !== 'cross-site'
    && (!origin || origin === new URL(request.url).origin);
}

async function readJson(request, limit = MAX_BODY) {
  const malformed = { problem: error('Envie os dados em um formulário válido.', 400) };
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '') || !request.body) return malformed;
  const large = { problem: error('O envio passa de 64 KB. Reduza o tamanho da lista ou do recado.', 413) };
  if (Number(request.headers.get('content-length')) > limit) return large;
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    let size = 0;
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return large;
      }
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    return body && typeof body === 'object' && !Array.isArray(body) ? { body } : malformed;
  } catch {
    return malformed;
  } finally {
    reader.releaseLock();
  }
}

export function validateReply(input) {
  const name = normalizeName(input?.name);
  if (!name || tooLong(name, 100)) return { error: 'Digite seu nome com até 100 caracteres.', field: 'name' };
  const { attending } = input;
  if (typeof attending !== 'boolean') return { error: 'Escolha se você vem à festa.', field: 'attendance' };
  const note = input.note === undefined ? '' : typeof input.note === 'string' ? input.note.trim() : null;
  if (note === null || tooLong(note, 300)) return { error: 'O recado pode ter até 300 caracteres.', field: 'note' };
  const giftId = attending && input.giftId ? input.giftId : null;
  if (attending && input.giftId != null && input.giftId !== '' && !giftIds.has(input.giftId)) {
    return { error: 'Escolha uma ideia da lista ou deixe em branco.', field: 'giftId' };
  }
  const gift = Object.hasOwn(input, 'giftId') ? { giftId } : {};
  if (Object.hasOwn(input, 'guests')) {
    if (!Array.isArray(input.guests) || input.guests.length > MAX_GUESTS) {
      return { error: 'Você pode adicionar até 50 acompanhantes por envio.', field: 'guests' };
    }
    const guests = [];
    for (const [index, guest] of input.guests.entries()) {
      const guestName = normalizeName(guest?.name);
      if (!guestName || tooLong(guestName, 100)) return { error: 'Digite o nome com até 100 caracteres.', field: 'guests.' + index + '.name' };
      if (guest.type !== 'adult' && guest.type !== 'child') {
        return { error: 'Escolha Adulto ou Criança.', field: 'guests.' + index + '.type' };
      }
      const { type, age } = guest;
      if (type === 'child' && age !== undefined && age !== null && !isCount(age, 17)) {
        return { error: 'Informe uma idade inteira entre 0 e 17 anos ou deixe o campo vazio.', field: 'guests.' + index + '.age' };
      }
      guests.push({ name: guestName, type, ...(type === 'child' && age != null && { age }) });
    }
    const present = attending ? guests : [];
    const children = present.filter((guest) => guest.type === 'child').length;
    return { name, attending, note, guests: present, adults: present.length - children, children, companions: present.length, total: attending ? present.length + 1 : 0, ...gift };
  }

  // Aceita os formatos do convite anterior, que ainda pode estar em cache.
  const split = Object.hasOwn(input, 'adults') || Object.hasOwn(input, 'children');
  const adults = attending ? (input.adults ?? 0) : 0;
  const children = attending ? (input.children ?? 0) : 0;
  const companions = attending ? (input.companions ?? adults + children) : 0;
  if (!isCount(companions, MAX_GUESTS) || (split && (
    !isCount(adults, MAX_GUESTS) || !isCount(children, MAX_GUESTS) || adults + children !== companions
  ))) return { error: 'Informe até 50 acompanhantes no total.', field: 'guests' };
  return { name, attending, note, companions, total: attending ? companions + 1 : 0, ...(split && { adults, children }), ...gift };
}

async function readVersion(store, key) {
  const entry = await store.getWithMetadata(key, { type: 'json' });
  if (!entry || entry.etag) return entry;
  // O emulador local inclui a versão na listagem quando ela falta no GET.
  const { blobs } = await store.list({ prefix: key });
  const etag = blobs.find((item) => item.key === key)?.etag;
  if (!etag) return null;
  const data = await store.get(key, { type: 'json' });
  return data && { data, etag };
}

async function takeRateSlot(store, ip, now) {
  const key = digest(ip);
  const minute = Math.floor(now / 60000);
  for (let attempt = 0; attempt < RATE_LIMIT + 2; attempt += 1) {
    const entry = await readVersion(store, key);
    const count = entry?.data.minute === minute ? entry.data.count : 0;
    if (count >= RATE_LIMIT) return false;
    const result = await store.setJSON(key, { minute, count: count + 1 },
      entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
    if (result.modified) return true;
  }
  return false;
}

function publicReply(id, data) {
  const { name, attending, guests = [], companions, total, revision } = data;
  return { id, name, attending, guests, companions, total, revision,
    ...(Object.hasOwn(data, 'giftId') && { giftId: data.giftId }) };
}

export async function handleRsvp(request, getReplies, { getRate, ip, now = Date.now() } = {}) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!sameOrigin(request)) return error('Origem não autorizada.', 403);
  try {
    const { body, problem } = await readJson(request);
    if (problem) return problem;
    if (body.website) return error('Não foi possível validar este envio.', 400);
    if (body.action === 'read') {
      if (!isUuid(body.id) || !isUuid(body.editToken)) return error('Identificador de resposta inválido.', 400);
      const saved = await getReplies().get(body.id, { type: 'json' });
      if (!saved || !sameSecret(body.editToken, saved.editProof)) {
        return error('Essa resposta já foi excluída ou não pode ser editada neste aparelho.', 404);
      }
      return json({ ...publicReply(body.id, saved), note: saved.note ?? '',
        ...(isUuid(body.submissionId) && { submissionSaved: body.submissionId === saved.lastSubmissionId }) });
    }
    const reply = validateReply(body);
    if (reply.error) return error(reply.error, 400, reply.field);
    const { submissionId, editToken, edit } = body;
    if ((edit || submissionId !== undefined || editToken !== undefined) && (!isUuid(submissionId) || !isUuid(editToken))) {
      return error('Não foi possível identificar o envio. Reabra o formulário e tente novamente.', 400);
    }
    if (edit && (!isUuid(edit.id) || !Number.isSafeInteger(edit.revision) || edit.revision < 1 || !Array.isArray(body.guests))) {
      return error('Não foi possível identificar a resposta que você quer editar.', 400);
    }

    if (getRate && ip && !await takeRateSlot(getRate(), ip, now)) {
      return json({ error: 'Muitos envios deste acesso. Aguarde um minuto e tente novamente.' }, 429,
        { 'Retry-After': String(60 - Math.floor((now % 60000) / 1000)) });
    }

    const store = getReplies();
    const id = edit?.id ?? submissionId ?? randomUUID();
    const timestamp = new Date(now).toISOString();
    const proof = digest(JSON.stringify(reply));
    const receipt = editToken ? { editProof: digest(editToken), lastSubmissionId: submissionId, lastPayloadHash: proof } : {};

    if (!edit) {
      const saved = { ...reply, revision: 1, submittedAt: timestamp, ...receipt };
      const result = await store.setJSON(id, saved, { onlyIfNew: true });
      if (result.modified) return json(publicReply(id, saved), 201);
      const existing = await store.get(id, { type: 'json' });
      if (editToken && existing?.lastSubmissionId === submissionId
        && existing.lastPayloadHash === proof && sameSecret(editToken, existing.editProof)) {
        return json(publicReply(id, existing));
      }
      return error('Este envio já foi usado. Abra uma nova confirmação para enviar outra resposta.', 409);
    }

    const current = await readVersion(store, id);
    if (!current || !sameSecret(editToken, current.data.editProof)) {
      return error('Essa resposta já foi excluída ou não pode ser editada neste aparelho.', 404);
    }
    if (current.data.lastSubmissionId === submissionId && current.data.lastPayloadHash === proof) {
      return json(publicReply(id, current.data));
    }
    if (current.data.revision !== edit.revision || current.data.lastSubmissionId === submissionId) {
      return error('A resposta mudou desde que foi aberta. Confirme com a Paloma antes de fazer outro envio.', 409);
    }
    const updated = {
      ...current.data, ...reply, ...receipt, revision: edit.revision + 1, updatedAt: timestamp
    };
    if (!updated.attending && Object.hasOwn(updated, 'giftId')) updated.giftId = null;
    const result = await store.setJSON(id, updated, { onlyIfMatch: current.etag });
    if (result.modified) return json(publicReply(id, updated));
    const existing = await store.get(id, { type: 'json' });
    if (existing?.lastSubmissionId === submissionId && existing.lastPayloadHash === proof
      && sameSecret(editToken, existing.editProof)) return json(publicReply(id, existing));
    return error('A resposta acabou de mudar. Aguarde e tente novamente.', 409);
  } catch {
    return error('Não foi possível gravar sua resposta. Tente novamente.', 503);
  }
}

function sessionCookie(request, token, age) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return COOKIE_NAME + '=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + age + secure;
}

function cookieToken(request) {
  return request.headers.get('cookie')?.match(/(?:^|;\s*)rael_admin_session=([0-9a-f]{64})(?:;|$)/)?.[1];
}

async function validSession(store, key, password) {
  const session = await store.get(key, { type: 'json' });
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    await store.delete(key);
    return false;
  }
  return session.proof === sessionProof(password, key);
}

function adminReply(id, raw) {
  const guests = raw.attending && Array.isArray(raw.guests) ? raw.guests : [];
  const companions = !raw.attending ? 0 : Array.isArray(raw.guests) ? guests.length
    : (raw.companions ?? (raw.adults ?? 0) + (raw.children ?? 0));
  const children = Array.isArray(raw.guests) ? guests.filter((guest) => guest.type === 'child').length
    : Math.min(raw.children ?? 0, companions);
  const adultCompanions = Array.isArray(raw.guests) ? companions - children : Math.min(raw.adults ?? 0, companions - children);
  return {
    id, name: raw.name, attending: raw.attending, guests, companions, adultCompanions, children,
    adults: raw.attending ? adultCompanions + 1 : 0,
    unknown: companions - adultCompanions - children,
    total: raw.attending ? companions + 1 : 0,
    note: raw.note ?? '', giftId: raw.giftId ?? null,
    giftName: gifts.find((item) => item.id === raw.giftId)?.nome ?? null,
    submittedAt: raw.submittedAt, updatedAt: raw.updatedAt ?? null, ignored: raw.ignored === true
  };
}

async function listStoredReplies(store) {
  const { blobs } = await store.list();
  return (await Promise.all(blobs.map(async ({ key: id }) => {
    const data = await store.get(id, { type: 'json' });
    return data && { ...data, id };
  }))).filter(Boolean);
}

function countGifts(replies) {
  const counts = Object.fromEntries(gifts.map(({ id }) => [id, 0]));
  for (const reply of replies) {
    if (reply.attending && !reply.ignored && giftIds.has(reply.giftId)) counts[reply.giftId] += 1;
  }
  return counts;
}

export async function handleGiftCounts(request, getReplies) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  try {
    return json({ counts: countGifts(await listStoredReplies(getReplies())) });
  } catch {
    return error('Não foi possível consultar as ideias já escolhidas.', 503);
  }
}

export async function handleAdmin(request, action, { getSessions, getReplies, password }) {
  const methods = { login: 'POST', logout: 'POST', replies: 'GET', delete: 'POST', ignore: 'POST' };
  if (!Object.hasOwn(methods, action)) return error('Rota indisponível.', 404);
  const required = methods[action];
  if (request.method !== required) return methodNotAllowed(required);
  if (!sameOrigin(request)) return error('Origem não autorizada.', 403);
  if (!password) return error('O painel está indisponível. Verifique a configuração da senha.', 503);

  const token = cookieToken(request);
  const key = token && digest(token);
  try {
    if (action === 'login') {
      const { body, problem } = await readJson(request);
      if (problem) return problem;
      const validPassword = typeof body.password === 'string' && sameSecret(body.password, digest(password));
      const validUsername = typeof body.username === 'string' && body.username.trim().toLowerCase() === 'paloma';
      if (!validUsername || !validPassword) return error('Usuário ou senha incorretos.', 401);
      const sessions = getSessions();
      if (key) await sessions.delete(key);
      const newToken = randomBytes(32).toString('hex');
      const newKey = digest(newToken);
      await sessions.setJSON(newKey, { expiresAt: Date.now() + SESSION_AGE * 1000, proof: sessionProof(password, newKey) });
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, newToken, SESSION_AGE) });
    }

    if (action === 'logout') {
      if (key) await getSessions().delete(key);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
    }
    if (!key || !await validSession(getSessions(), key, password)) return error('Entre para acessar as respostas.', 401);

    const store = getReplies();
    if (action === 'delete' || action === 'ignore') {
      const { body, problem } = await readJson(request);
      if (problem) return problem;
      if (typeof body.id !== 'string' || (!isUuid(body.id) && !LEGACY_ID.test(body.id))) return error('Identificador de resposta inválido.', 400);
      if (action === 'delete') {
        await store.delete(body.id);
        return json({ ok: true });
      }
      if (typeof body.ignored !== 'boolean') return error('Escolha se a resposta deve ser ignorada.', 400);
      const current = await readVersion(store, body.id);
      if (!current) return error('Essa resposta já foi excluída.', 404);
      if (Boolean(current.data.ignored) !== body.ignored) {
        const result = await store.setJSON(body.id, { ...current.data, ignored: body.ignored }, { onlyIfMatch: current.etag });
        if (!result.modified) return error('A resposta mudou. Atualize o painel e tente novamente.', 409);
      }
      return json({ ok: true });
    }

    const records = await listStoredReplies(store);
    const replies = records.map((record) => adminReply(record.id, record))
      .sort((first, second) => (second.submittedAt ?? '').localeCompare(first.submittedAt ?? ''));
    const totals = { attending: 0, companions: 0, expected: 0, declined: 0, adults: 0, children: 0, unknown: 0 };
    for (const reply of replies) {
      if (reply.ignored) continue;
      totals.attending += Number(reply.attending);
      totals.declined += Number(!reply.attending);
      totals.companions += reply.companions;
      totals.expected += reply.total;
      totals.adults += reply.adults;
      totals.children += reply.children;
      totals.unknown += reply.unknown;
    }
    const giftTotals = countGifts(records);
    return json({ replies, totals, giftCounts: gifts.map((gift) => ({
      name: gift.nome, count: giftTotals[gift.id]
    })) });
  } catch {
    return error('O painel está temporariamente indisponível. Tente novamente.', 503);
  }
}
