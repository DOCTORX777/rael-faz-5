import { RAEL_SIZES } from './config.js';

const grid = document.querySelector('#gift-grid');
const mini = document.querySelector('#mini-gifts');
const choice = document.querySelector('#gift-choice');

function buildCard(gift) {
  const card = document.createElement('article');
  card.className = 'gift-card';
  const image = document.createElement('img');
  image.width = 112;
  image.height = 112;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.alt = '';
  image.className = 'gift-art';
  image.src = '/assets/cena/' + gift.arte + '.webp';
  image.srcset = '/assets/cena/' + gift.arte + '@2x.webp 2x';
  const name = document.createElement('p');
  name.className = 'gift-name';
  name.textContent = gift.nome;
  const price = document.createElement('small');
  price.className = 'gift-price';
  price.textContent = gift.preco;
  const count = document.createElement('small');
  count.className = 'gift-count';
  count.dataset.giftId = gift.id;
  count.hidden = true;
  card.append(image, name, price, count);
  return card;
}

export async function refreshGiftCounts() {
  try {
    const response = await fetch('/api/gifts');
    if (!response.ok) return;
    const { counts } = await response.json();
    for (const node of document.querySelectorAll('.gift-count')) {
      const count = counts[node.dataset.giftId] ?? 0;
      node.hidden = count < 1;
      node.textContent = count === 1 ? '1 pessoa já escolheu' : count + ' pessoas já escolheram';
    }
  } catch {
    // Preços e ideias continuam disponíveis mesmo sem a contagem.
  }
}

export async function setupGifts() {
  try {
    const response = await fetch('/gifts.json');
    if (!response.ok) throw new Error('Catálogo indisponível');
    const gifts = await response.json();
    grid.replaceChildren(...gifts.map(buildCard));
    mini.replaceChildren(...gifts.slice(0, 6).map(buildCard));
    for (const gift of gifts) choice.add(new Option(gift.nome, gift.id));
    const sizes = [
      RAEL_SIZES.roupa.trim() && 'Roupa: ' + RAEL_SIZES.roupa.trim(),
      RAEL_SIZES.calcado.trim() && 'Calçado: ' + RAEL_SIZES.calcado.trim()
    ].filter(Boolean);
    const sizesText = document.querySelector('#rael-sizes');
    sizesText.textContent = sizes.join(' · ');
    sizesText.hidden = sizes.length === 0;
    refreshGiftCounts();
    return true;
  } catch {
    document.querySelector('#gifts-status').textContent = 'As ideias de presente estão indisponíveis agora.';
    return false;
  }
}
