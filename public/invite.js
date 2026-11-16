import { setupGifts, refreshGiftCounts } from './gift-ui.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const share = document.querySelector('#share');
const shareStatus = document.querySelector('#share-status');
const shareLink = document.querySelector('.share-link');
const shareUrl = document.querySelector('#share-url');
share.addEventListener('click', async () => {
  const url = document.querySelector('meta[property="og:url"]')?.content || new URL('/', window.location.href).href;
  shareStatus.textContent = '';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Aniversário do Rael · 5 anos', text: 'Venha fazer parte do nosso time!', url });
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    shareStatus.textContent = 'Link do convite copiado!';
  } catch {
    shareLink.hidden = false;
    shareUrl.value = url;
    shareUrl.select();
  }
});


const endTime = document.querySelector('#end-time');
if (endTime.dataset.endTime.trim()) {
  endTime.textContent = ' · Término às ' + endTime.dataset.endTime.trim();
  endTime.hidden = false;
}
const practical = document.querySelector('#practical');
for (const item of practical.querySelectorAll('dl > div')) item.hidden = !item.querySelector('dd').textContent.trim();
practical.hidden = !practical.querySelector('dl > div:not([hidden])');

const form = document.querySelector('#rsvp-form');
const mainName = form.querySelector('#name');
const note = form.querySelector('#note');
const giftChoice = form.querySelector('#gift-choice');
const giftField = form.querySelector('#gift-field');
const confirmationGifts = document.querySelector('#confirmation-gifts');
const companions = form.querySelector('.companions');
const guests = form.querySelector('#guest-list');
const add = form.querySelector('#add-guest');
const guestTemplate = document.querySelector('#guest-template');
const submit = form.querySelector('[type="submit"]');
const replyError = document.querySelector('#rsvp-error');
const confirmation = document.querySelector('#confirmation');
const jersey = document.querySelector('#confirmation-jersey');
const historyBlock = document.querySelector('#device-history');
const historyList = document.querySelector('#history-list');
const historyError = document.querySelector('#history-error');
const storageKey = 'rael-rsvp-respostas-v2';
const guestLimit = 50;
let nextGuest = 0;
let editing = null;
let pending = null;
let busy = false;
let celebration;
let giftsAvailable = false;
const giftsReady = setupGifts().then((ready) => {
  giftsAvailable = ready;
  syncAttendance();
  if (!confirmation.hidden) confirmationGifts.hidden = !ready || jersey.hidden;
  return ready;
});
const normalizeName = (value) => value.trim().replace(/\s+/gu, ' ').normalize('NFC');
const characterCount = (value) => [...value].length;

function listItem(text) {
  const li = document.createElement('li');
  li.textContent = text;
  return li;
}

function readHistory() {
  try {
    const records = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(records) ? records.filter((record) => record && typeof record.id === 'string'
      && typeof record.name === 'string' && typeof record.editToken === 'string') : [];
  } catch {
    return null;
  }
}

let receipts = readHistory() ?? [];

function renderHistory() {
  historyBlock.hidden = receipts.length === 0;
  historyBlock.querySelector('h3').textContent = receipts.some((receipt) => receipt.attending)
    ? 'Você já confirmou' : 'Respostas deste aparelho';
  historyList.replaceChildren(...receipts.map((receipt) => {
    const li = listItem(receipt.name + (receipt.attending ? ' · Presença' : ' · Desfalque'));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-action';
    button.textContent = 'Editar';
    button.setAttribute('aria-label', 'Editar resposta de ' + receipt.name);
    button.addEventListener('click', () => openEdit(receipt, button));
    li.append(button);
    return li;
  }));
}

function remember(reply, editToken) {
  const stored = readHistory() ?? [];
  const existing = new Map([...receipts, ...stored].map((receipt) => [receipt.id, receipt]));
  existing.delete(reply.id);
  receipts = [{ id: reply.id, name: reply.name, attending: reply.attending, editToken }, ...existing.values()];
  try {
    localStorage.setItem(storageKey, JSON.stringify(receipts));
  } catch {
    // O formulário também funciona quando o armazenamento do navegador está indisponível.
  }
  renderHistory();
}

function showError(field, message) {
  const fixed = {
    name: [mainName, '#name-error'],
    attendance: [form.querySelector('[name="attendance"]'), '#attendance-error'],
    guests: [add, '#guests-error'],
    note: [note, '#note-error'],
    giftId: [giftChoice, '#gift-error']
  };
  let control;
  let target;
  if (Object.hasOwn(fixed, field)) {
    [control, target] = fixed[field];
    target = form.querySelector(target);
  } else if (/^guests\.\d+\.(name|type|age)$/.test(field ?? '')) {
    const [, index, part] = field.split('.');
    control = guests.children[Number(index)]?.querySelector('[data-field="' + part + '"]');
    target = control?.nextElementSibling;
  }
  if (control && target) {
    target.textContent = message;
    control.setAttribute('aria-invalid', 'true');
    control.focus();
  } else {
    replyError.textContent = message;
    replyError.tabIndex = -1;
    replyError.focus();
  }
}

function clearErrors() {
  form.querySelectorAll('.field-error, #rsvp-error').forEach((element) => { element.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((element) => element.removeAttribute('aria-invalid'));
}

function syncAttendance() {
  const attending = form.querySelector('[name="attendance"]:checked')?.value === 'yes';
  companions.hidden = !attending;
  companions.disabled = !attending;
  giftField.hidden = !attending || !giftsAvailable;
  giftChoice.disabled = giftField.hidden;
}

function updateGuestLabels() {
  Array.from(guests.children).forEach((row, index) => {
    const number = index + 1;
    row.querySelector('legend').textContent = 'Convidado ' + number;
    row.querySelector('.remove-guest').setAttribute('aria-label', 'Remover convidado ' + number);
  });
  add.disabled = guests.children.length >= guestLimit;
  form.querySelector('#guest-limit').textContent = add.disabled ? 'Limite de 50 acompanhantes atingido.' : 'Até 50 acompanhantes por envio.';
}

function addGuest(guest = {}, focus = true) {
  if (guests.children.length >= guestLimit) return;
  const row = guestTemplate.content.firstElementChild.cloneNode(true);
  const id = ++nextGuest;
  for (const control of row.querySelectorAll('[data-field]')) {
    control.id = 'guest-' + id + '-' + control.dataset.field;
    control.previousElementSibling.htmlFor = control.id;
    control.nextElementSibling.id = control.id + '-error';
    control.setAttribute('aria-describedby', control.nextElementSibling.id);
    if (guest[control.dataset.field] != null) control.value = guest[control.dataset.field];
  }
  const type = row.querySelector('[data-field="type"]');
  const age = row.querySelector('[data-field="age"]');
  const syncAge = () => {
    age.disabled = type.value !== 'child';
    age.closest('.guest-age').hidden = age.disabled;
  };
  type.addEventListener('change', syncAge);
  syncAge();
  row.querySelector('.remove-guest').addEventListener('click', () => {
    const adjacent = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    updateGuestLabels();
    (adjacent?.querySelector('input') ?? add).focus();
  });
  guests.append(row);
  updateGuestLabels();
  if (focus) row.querySelector('input').focus();
}

function resetForm() {
  editing = null;
  pending = null;
  form.reset();
  guests.replaceChildren();
  updateGuestLabels();
  syncAttendance();
  clearErrors();
  historyError.textContent = '';
  document.querySelector('#edit-mode').hidden = true;
  document.querySelector('#cancel-edit').hidden = true;
  submit.textContent = 'Enviar resposta';
  confirmation.hidden = true;
  form.hidden = false;
}

async function postReply(payload) {
  const response = await fetch('/api/rsvp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw Object.assign(new Error(result?.error || 'Não foi possível confirmar o envio. Tente novamente.'), {
      field: result?.field, status: response.ok ? undefined : response.status
    });
  }
  return result;
}

function beginEdit(saved, editToken) {
  editing = { id: saved.id, revision: saved.revision, editToken };
  document.querySelector('#edit-mode').hidden = false;
  document.querySelector('#cancel-edit').hidden = false;
}

async function openEdit(receipt, button) {
  if (busy) return;
  busy = true;
  button.disabled = true;
  historyError.textContent = '';
  try {
    const saved = await postReply({ action: 'read', id: receipt.id, editToken: receipt.editToken });
    resetForm();
    beginEdit(saved, receipt.editToken);
    mainName.value = saved.name;
    note.value = saved.note;
    form.querySelector('[name="attendance"][value="' + (saved.attending ? 'yes' : 'no') + '"]').checked = true;
    syncAttendance();
    for (const guest of saved.guests) addGuest(guest, false);
    if (await giftsReady) giftChoice.value = saved.giftId ?? '';
    submit.textContent = 'Salvar alterações';
    mainName.focus();
  } catch (error) {
    historyError.textContent = error.status ? error.message : 'Não foi possível abrir a resposta. Verifique a conexão.';
  } finally {
    busy = false;
    button.disabled = false;
  }
}

function collectReply() {
  const name = normalizeName(mainName.value);
  const attendance = form.querySelector('[name="attendance"]:checked')?.value;
  if (!name || characterCount(name) > 100) return { field: 'name', error: 'Digite seu nome com até 100 caracteres.' };
  if (!attendance) return { field: 'attendance', error: 'Escolha se você vem à festa.' };
  const attending = attendance === 'yes';
  const list = [];
  if (attending) {
    for (const [index, row] of Array.from(guests.children).entries()) {
      const guestName = normalizeName(row.querySelector('[data-field="name"]').value);
      if (!guestName || characterCount(guestName) > 100) {
        return { field: 'guests.' + index + '.name', error: 'Digite o nome com até 100 caracteres.' };
      }
      const type = row.querySelector('[data-field="type"]').value;
      const age = row.querySelector('[data-field="age"]');
      if (type === 'child' && !age.validity.valid) {
        return { field: 'guests.' + index + '.age', error: 'Informe uma idade inteira entre 0 e 17 anos ou deixe em branco.' };
      }
      list.push({ name: guestName, type, ...(type === 'child' && age.value !== '' && { age: Number(age.value) }) });
    }
  }
  if (characterCount(note.value.trim()) > 300) return { field: 'note', error: 'O recado pode ter até 300 caracteres.' };
  return { name, attending, guests: list, note: note.value.trim(), website: form.elements.website.value,
    ...((!attending || !giftChoice.disabled) && { giftId: attending ? giftChoice.value || null : null }) };
}

function showConfirmation(reply) {
  document.querySelector('#confirmation-title').textContent = reply.attending ? 'Presença confirmada!' : 'Resposta registrada!';
  document.querySelector('#confirmation-detail').textContent = reply.attending
    ? reply.total === 1 ? '1 pessoa confirmada.' : reply.total + ' pessoas confirmadas.'
    : reply.name + ' avisou que não vai poder ir.';
  const names = document.querySelector('#confirmed-names');
  names.replaceChildren(...(reply.attending ? [reply.name, ...reply.guests.map((guest) => guest.name)].map(listItem) : []));
  names.hidden = !reply.attending;
  jersey.hidden = !reply.attending;
  confirmationGifts.hidden = !reply.attending || !giftsAvailable;
  if (reply.attending) {
    const jerseyName = jersey.querySelector('#jersey-name');
    jerseyName.textContent = reply.name;
    jerseyName.classList.toggle('long-name', characterCount(reply.name) > 25);
    jersey.querySelector('#jersey-caption').textContent = 'Camisa número 5 de ' + reply.name + '.';
    const confetti = jersey.querySelector('.confetti');
    clearTimeout(celebration);
    confetti.hidden = reducedMotion.matches;
    if (!reducedMotion.matches) celebration = setTimeout(() => { confetti.hidden = true; }, 1500);
  }
  form.hidden = true;
  confirmation.hidden = false;
  confirmation.focus();
}

form.addEventListener('change', syncAttendance);
add.addEventListener('click', () => addGuest());
for (const id of ['new-reply', 'cancel-edit']) {
  document.querySelector('#' + id).addEventListener('click', () => {
    if (busy) return;
    resetForm();
    mainName.focus();
  });
}
for (const link of document.querySelectorAll('a[href="#confirmar"]')) {
  link.addEventListener('click', () => document.querySelector('#rsvp-title').focus({ preventScroll: true }));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  clearErrors();
  const reply = collectReply();
  if (reply.error) {
    showError(reply.field, reply.error);
    return;
  }
  const signature = JSON.stringify(reply);
  busy = true;
  submit.disabled = true;
  submit.textContent = 'Enviando…';
  try {
    if (!pending || (!pending.uncertain && pending.signature !== signature)) {
      pending = { signature, submissionId: crypto.randomUUID(), editToken: editing?.editToken ?? crypto.randomUUID(), uncertain: false };
    }
    const result = await postReply({
      ...reply, submissionId: pending.submissionId, editToken: pending.editToken,
      ...(editing && { edit: { id: editing.id, revision: editing.revision } })
    });
    remember(result, pending.editToken);
    pending = null;
    showConfirmation(result);
    refreshGiftCounts();
  } catch (error) {
    if (error.status === 409 && pending?.uncertain && pending.signature !== signature) {
      try {
        const saved = await postReply({
          action: 'read', id: editing?.id ?? pending.submissionId,
          editToken: pending.editToken, submissionId: pending.submissionId
        });
        if (!saved.submissionSaved) throw new Error('Outra edição foi gravada.');
        remember(saved, pending.editToken);
        beginEdit(saved, pending.editToken);
        pending = null;
        showError(null, 'A resposta anterior foi gravada. Use “Salvar alterações” para corrigi-la.');
        return;
      } catch {
        // A tentativa permanece disponível para nova verificação.
      }
    }
    if (error.status === 400 || error.status === 413) pending = null;
    if (pending && (!error.status || error.status >= 500)) pending.uncertain = true;
    showError(error.field, error.status ? error.message : 'O envio não foi confirmado. Verifique a conexão e tente novamente.');
  } finally {
    busy = false;
    submit.disabled = false;
    submit.textContent = editing ? 'Salvar alterações' : 'Enviar resposta';
  }
});

function syncHistory(replace = false) {
  const stored = readHistory();
  if (replace && stored) {
    receipts = stored;
  } else if (stored?.length) {
    receipts = [...new Map([...receipts, ...stored].map((receipt) => [receipt.id, receipt])).values()];
  }
  renderHistory();
}

window.addEventListener('storage', (event) => {
  if (event.key === storageKey || event.key === null) syncHistory(true);
});
window.addEventListener('pageshow', () => {
  setTimeout(syncAttendance, 0);
  syncHistory();
});
syncAttendance();
renderHistory();
