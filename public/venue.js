import { EVENT_DATE, VENUE } from './config.js';

export function venueUrls(venue) {
  const exact = Number.isFinite(venue.lat) && Number.isFinite(venue.lng)
    && venue.lat !== 0 && venue.lng !== 0 && Math.abs(venue.lat) <= 90 && Math.abs(venue.lng) <= 180;
  const destination = exact ? venue.lat + ',' + venue.lng : venue.nome + ', ' + venue.endereco;
  const query = encodeURIComponent(destination);
  return {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=' + query,
    waze: 'https://waze.com/ul?' + (exact ? 'll=' : 'q=') + query + '&navigate=yes',
    embed: exact ? 'https://www.google.com/maps?q=' + destination + '&z=16&output=embed' : ''
  };
}

export function daysUntil(date, now = new Date()) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(now);
  const number = (type) => Number(parts.find((part) => part.type === type)?.value);
  const today = Date.UTC(number('year'), number('month') - 1, number('day'));
  return (Date.parse(date + 'T00:00:00Z') - today) / 86400000;
}

function showVenue() {
  for (const el of document.querySelectorAll('[data-venue-name]')) el.textContent = VENUE.nome;
  for (const el of document.querySelectorAll('[data-venue-address]')) el.textContent = VENUE.endereco;
  const reference = document.querySelector('#venue-reference');
  reference.textContent = VENUE.referencia.trim();
  reference.hidden = !reference.textContent;
  const links = venueUrls(VENUE);
  document.querySelector('#maps-link').href = links.maps;
  document.querySelector('#waze-link').href = links.waze;
  const status = document.querySelector('#address-status');
  const fallback = document.querySelector('#address-fallback');
  document.querySelector('#copy-address').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(VENUE.endereco);
      status.textContent = 'Copiado!';
      fallback.hidden = true;
    } catch {
      fallback.hidden = false;
      const field = document.querySelector('#address-text');
      field.value = VENUE.endereco;
      field.focus();
      field.select();
      status.textContent = 'Selecione e copie o endereço.';
    }
  });
  if (!links.embed) return;
  const frame = document.querySelector('#map-frame');
  const region = document.querySelector('#venue-map');
  const notice = document.querySelector('#map-notice');
  let timeout;
  function unavailable() {
    clearTimeout(timeout);
    region.hidden = true;
    notice.textContent = 'O mapa não abriu aqui. Use um dos botões para traçar a rota.';
    notice.hidden = false;
  }
  function loadMap() {
    if (!navigator.onLine) {
      unavailable();
      return;
    }
    frame.addEventListener('error', unavailable, { once: true });
    frame.addEventListener('load', () => clearTimeout(timeout), { once: true });
    document.addEventListener('securitypolicyviolation', (event) => {
      if (event.effectiveDirective === 'frame-src' && event.blockedURI.startsWith('https://www.google.com')) unavailable();
    });
    window.addEventListener('offline', unavailable, { once: true });
    region.hidden = false;
    frame.src = links.embed;
    timeout = setTimeout(unavailable, 8500);
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      loadMap();
    }, { rootMargin: '220px' });
    observer.observe(document.querySelector('#como-chegar'));
  } else loadMap();
}

function showCountdown() {
  const days = daysUntil(EVENT_DATE);
  document.querySelector('#countdown').textContent = days > 1 ? 'Faltam ' + days + ' dias pro jogo!'
    : days === 1 ? 'Falta 1 dia pro jogo!' : days === 0 ? 'É hoje! O jogo vai começar.' : 'Obrigado por jogar com a gente!';
}

if (typeof document !== 'undefined' && document.querySelector('#como-chegar')) {
  showVenue();
  showCountdown();
  window.addEventListener('pageshow', showCountdown);
}
