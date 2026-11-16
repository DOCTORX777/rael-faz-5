const login = document.querySelector('#login-form');
const loginButton = login.querySelector('button');
const dashboard = document.querySelector('#dashboard');
const logout = document.querySelector('#logout');
const refresh = document.querySelector('#refresh');
const exportReplies = document.querySelector('#export-replies');
const exportPeople = document.querySelector('#export-people');
const printButton = document.querySelector('#print');
const search = document.querySelector('#search');
const filter = document.querySelector('#filter');
const statusMessage = document.querySelector('#admin-status');
const errorMessage = document.querySelector('#admin-error');
const replyList = document.querySelector('#reply-list');
const peopleSection = document.querySelector('#people-section');
const peopleBody = document.querySelector('#people-table tbody');
const empty = document.querySelector('#empty');
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
});
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
const nameKey = (name) => fold(name).replace(/[\p{P}\s]+/gu, '');
const answerLabel = (attending) => attending ? 'Vou' : 'Não vou';
const guestType = (type) => ({ adult: 'Adulto', child: 'Criança' }[type] ?? 'Sem classificação');
let replies = [];
let duplicates = new Map();
let visibleReplies = [];
let visiblePeople = [];
let busy = false;
let lastDashboard = '';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function api(action, body) {
  const options = body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  };
  const response = await fetch('/api/admin/' + action, { cache: 'no-store', ...options });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw Object.assign(new Error(data.error || 'Não foi possível concluir a operação.'), { status: response.status });
  return data;
}

function localDate(value) {
  const date = new Date(value ?? NaN);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : dateFormat.format(date);
}

function showLogin() {
  lastDashboard = '';
  replies = [];
  duplicates = new Map();
  visibleReplies = [];
  visiblePeople = [];
  replyList.replaceChildren();
  peopleBody.replaceChildren();
  dashboard.hidden = true;
  logout.hidden = true;
  login.hidden = false;
  login.reset();
}

function areSimilar(first, second) {
  if (first === second) return first.length > 0;
  if (Math.min(first.length, second.length) < 5 || Math.abs(first.length - second.length) > 1) return false;
  const [short, long] = first.length <= second.length ? [first, second] : [second, first];
  let index = 0;
  while (index < short.length && short[index] === long[index]) index += 1;
  if (short.length !== long.length) return short.slice(index) === long.slice(index + 1);
  if (short.slice(index + 1) === long.slice(index + 1)) return true;
  return short[index] === long[index + 1] && short[index + 1] === long[index]
    && short.slice(index + 2) === long.slice(index + 2);
}

function possibleDuplicates(records) {
  const names = records.filter((reply) => !reply.ignored).flatMap((reply) =>
    [reply.name, ...reply.guests.map((guest) => guest.name)].map((name) => ({ id: reply.id, name, key: nameKey(name) }))
  );
  const matches = new Map();
  for (const [index, name] of names.entries()) {
    for (let offset = 0; offset < index; offset += 1) {
      const previous = names[offset];
      if (name.id === previous.id || !areSimilar(name.key, previous.key)) continue;
      if (!matches.has(name.id)) matches.set(name.id, new Set());
      if (!matches.has(previous.id)) matches.set(previous.id, new Set());
      matches.get(name.id).add(name.name);
      matches.get(previous.id).add(previous.name);
    }
  }
  return matches;
}

function peopleOf(reply) {
  const people = [{ name: reply.name, type: 'adult', age: null, reply }];
  if (!reply.attending) return people;
  for (const guest of reply.guests) people.push({ ...guest, reply });
  if (!reply.guests.length) {
    for (const [type, count] of [['adult', reply.adultCompanions], ['child', reply.children], ['', reply.unknown]]) {
      for (let index = 0; index < count; index += 1) {
        people.push({ name: 'Acompanhante sem nome', type, age: null, reply });
      }
    }
  }
  return people;
}

function makeReplyCard(reply, open) {
  const card = element('details', undefined, 'reply-card');
  card.dataset.id = reply.id;
  card.open = open;
  const summary = element('summary');
  summary.append(element('strong', reply.name), element('span', answerLabel(reply.attending) + ' · ' + reply.total
    + (reply.total === 1 ? ' pessoa' : ' pessoas'), 'reply-status'));
  if (reply.ignored) summary.append(element('span', 'Ignorada', 'reply-tag'));
  const similar = duplicates.get(reply.id);
  if (similar?.size) summary.append(element('span', 'Possível duplicata', 'reply-tag duplicate'));
  if (reply.giftName) summary.append(element('span', 'Presente · ' + reply.giftName, 'reply-gift'));
  card.append(summary);
  const body = element('div', undefined, 'reply-body');
  body.append(element('p', 'Enviada em ' + localDate(reply.submittedAt)));
  if (reply.updatedAt) body.append(element('p', 'Editada em ' + localDate(reply.updatedAt)));
  if (similar?.size) body.append(element('p', 'Nome parecido em outra resposta: ' + [...similar].join(', ') + '.', 'dup-detail'));
  if (reply.ignored) body.append(element('p', 'Esta resposta está fora da lista da portaria e dos totais.'));
  if (reply.note) {
    body.append(element('h3', 'Recado'), element('p', reply.note, 'note'));
  }
  if (reply.attending) {
    body.append(element('h3', 'Convidados'));
    const list = element('ul');
    for (const [index, person] of peopleOf(reply).entries()) {
      const descriptor = index === 0 ? 'Responsável' : guestType(person.type);
      list.append(element('li', person.name + ' · ' + descriptor + (person.age != null ? ' · ' + person.age + ' anos' : '')));
    }
    body.append(list);
  }

  const actions = element('div', undefined, 'reply-actions');
  const ignoreButton = element('button', reply.ignored ? 'Voltar a contar' : 'Marcar como duplicada', 'button secondary');
  ignoreButton.type = 'button';
  ignoreButton.addEventListener('click', () => changeReply('ignore', reply, ignoreButton));
  const deleteButton = element('button', 'Excluir resposta', 'button danger');
  deleteButton.type = 'button';
  deleteButton.addEventListener('click', () => changeReply('delete', reply, deleteButton));
  actions.append(ignoreButton, deleteButton);
  body.append(actions);
  card.append(body);
  return card;
}

function updateView() {
  const term = fold(search.value.trim());
  const mode = filter.value;
  const peopleView = document.querySelector('[name="view"]:checked').value === 'people';
  visibleReplies = replies.filter((reply) => (
    (!term || [reply.name, ...reply.guests.map((guest) => guest.name)].some((name) => fold(name).includes(term)))
    && (mode === 'all' || (mode === 'children' ? reply.children > 0 : reply.attending === (mode === 'yes')))
  ));
  visiblePeople = visibleReplies.filter((reply) => !reply.ignored && (mode === 'no' || reply.attending))
    .flatMap(peopleOf)
    .filter((person) => mode !== 'children' || person.type === 'child')
    .filter((person) => !term || fold(person.name).includes(term) || fold(person.reply.name).includes(term))
    .sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'));
  const open = new Set([...replyList.querySelectorAll('details[open]')].map((card) => card.dataset.id));
  const active = document.activeElement;
  const focusedCard = active?.closest('#reply-list details')?.dataset.id;
  replyList.replaceChildren(...visibleReplies.map((reply) => makeReplyCard(reply, open.has(reply.id))));
  if (focusedCard) {
    const replacement = [...replyList.children].find((card) => card.dataset.id === focusedCard);
    const controls = replacement?.querySelectorAll('summary, button') ?? [];
    [...controls].find((control) => control.tagName === active.tagName && control.textContent === active.textContent)
      ?.focus({ preventScroll: true });
  }
  peopleBody.replaceChildren(...visiblePeople.map((person) => {
    const row = element('tr');
    for (const value of [person.name, guestType(person.type), person.age ?? '—', answerLabel(person.reply.attending)]) {
      row.append(element('td', value));
    }
    return row;
  }));
  exportReplies.disabled = visibleReplies.length === 0;
  exportPeople.disabled = visiblePeople.length === 0;
  printButton.hidden = !peopleView;
  printButton.disabled = visiblePeople.length === 0 || mode === 'no';
  peopleSection.classList.toggle('not-for-entry', mode === 'no');
  const rows = peopleView ? visiblePeople : visibleReplies;
  replyList.hidden = peopleView;
  peopleSection.hidden = !peopleView || rows.length === 0;
  empty.hidden = rows.length > 0;
  empty.textContent = replies.length ? 'Nenhum resultado para esta busca e filtro.' : 'Ainda não há respostas.';
}

function renderDashboard(data) {
  const stamp = JSON.stringify(data);
  if (stamp === lastDashboard) return;
  lastDashboard = stamp;
  replies = data.replies;
  duplicates = possibleDuplicates(replies);
  for (const [field, value] of Object.entries(data.totals)) {
    const target = document.querySelector('#total-' + field);
    if (target) target.textContent = value;
  }
  const unknown = document.querySelector('#unknown-count');
  unknown.hidden = !data.totals.unknown;
  unknown.textContent = data.totals.unknown + ' acompanhante(s) de respostas antigas sem classificação.';
  const giftTotals = document.querySelector('#gift-totals');
  const selected = (data.giftCounts ?? []).filter((gift) => gift.count > 0);
  giftTotals.hidden = selected.length === 0;
  giftTotals.querySelector('ul').replaceChildren(...selected.map((gift) => element('li', gift.name + ' — ' + gift.count)));
  updateView();
  login.hidden = true;
  dashboard.hidden = false;
  logout.hidden = false;
}

function handleError(error, fallback) {
  if (error.status === 401 && !dashboard.hidden) showLogin();
  errorMessage.textContent = error.status ? error.message : fallback;
}

async function loadReplies(quiet = false) {
  if (busy) return;
  busy = true;
  refresh.disabled = true;
  if (!quiet) {
    statusMessage.textContent = 'Carregando respostas…';
    errorMessage.textContent = '';
  }
  try {
    renderDashboard(await api('replies'));
  } catch (error) {
    if (error.status === 401) showLogin();
    else {
      if (dashboard.hidden) showLogin();
      handleError(error, 'Não foi possível carregar as respostas. Tente novamente.');
    }
  } finally {
    busy = false;
    refresh.disabled = false;
    if (!quiet) statusMessage.textContent = '';
  }
}

async function changeReply(action, reply, button) {
  if (busy) return;
  if (action === 'delete' && !window.confirm('Excluir a resposta de ' + reply.name + '?')) return;
  busy = true;
  button.disabled = true;
  refresh.disabled = true;
  errorMessage.textContent = '';
  try {
    await api(action, { id: reply.id, ...(action === 'ignore' && { ignored: !reply.ignored }) });
    renderDashboard(await api('replies'));
    refresh.disabled = false;
    const card = [...replyList.children].find((item) => item.dataset.id === reply.id);
    (card?.querySelector('summary') ?? refresh).focus();
    statusMessage.textContent = action === 'delete' ? 'Resposta excluída.'
      : reply.ignored ? 'Resposta voltou a contar.' : 'Resposta ignorada nos totais.';
  } catch (error) {
    handleError(error, 'Não foi possível fazer a alteração. Tente novamente.');
  } finally {
    busy = false;
    button.disabled = false;
    refresh.disabled = false;
  }
}

login.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  loginButton.disabled = true;
  errorMessage.textContent = '';
  try {
    await api('login', Object.fromEntries(new FormData(login)));
    login.reset();
    renderDashboard(await api('replies'));
    refresh.focus();
  } catch (error) {
    handleError(error, 'Não foi possível entrar. Tente novamente.');
  } finally {
    busy = false;
    loginButton.disabled = false;
  }
});

logout.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  logout.disabled = true;
  errorMessage.textContent = '';
  try {
    await api('logout', {});
    showLogin();
    statusMessage.textContent = '';
    document.querySelector('#username').focus();
  } catch (error) {
    handleError(error, 'Não foi possível encerrar a sessão. Tente novamente.');
  } finally {
    busy = false;
    logout.disabled = false;
  }
});

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF\p{Cc}]*[=+\-@]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  const file = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = element('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

exportReplies.addEventListener('click', () => downloadCsv('rael-respostas.csv',
  ['Responsável', 'Resposta', 'Adultos', 'Crianças', 'Sem classificação', 'Total', 'Enviada em', 'Editada em', 'Recado', 'Acompanhantes', 'Ignorada', 'Presente'],
  visibleReplies.map((reply) => [
    reply.name, answerLabel(reply.attending), reply.adults, reply.children, reply.unknown,
    reply.total, localDate(reply.submittedAt), reply.updatedAt ? localDate(reply.updatedAt) : '',
    reply.note, peopleOf(reply).slice(1).map((guest) => guest.name + ' (' + guestType(guest.type)
      + (guest.age != null ? ', ' + guest.age + ' anos' : '') + ')').join(' | '),
    reply.ignored ? 'Sim' : 'Não', reply.giftName ?? ''
  ])
));
exportPeople.addEventListener('click', () => downloadCsv('rael-convidados.csv',
  ['Nome', 'Tipo', 'Idade', 'Responsável', 'Resposta'],
  visiblePeople.map((person) => [person.name, guestType(person.type), person.age, person.reply.name, answerLabel(person.reply.attending)])
));
printButton.addEventListener('click', () => window.print());
search.addEventListener('input', updateView);
filter.addEventListener('change', updateView);
document.querySelector('.view-switch').addEventListener('change', updateView);
refresh.addEventListener('click', () => loadReplies());
setInterval(() => { if (!dashboard.hidden && !document.hidden) loadReplies(true); }, 60000);
loadReplies();
