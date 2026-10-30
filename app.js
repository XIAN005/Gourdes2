'use strict';
/* =========================================================
   Gourdes² — application 100 % côté navigateur
   Données : localStorage. IA : API Anthropic appelée depuis
   le navigateur avec la clé de l'utilisateur.
   ========================================================= */
const DENOMS = [1000, 500, 250, 100, 50, 25, 10, 5];
const CATS = {
  expense: ['Nourriture', 'Transport', 'Logement', 'Santé', 'Éducation', 'Loisirs', 'Communication', 'Autre'],
  saving: ['Épargne', 'Sòl / Tontine', 'Cadeau reçu', 'Salaire / Revenu', 'Autre']
};
const KEY = 'mes-gourdes-v2', OLD_KEY = 'mes-gourdes-v1', AI_KEY = 'mes-gourdes-ai';
const DEFAULT_MODEL = 'gemini-2.0-flash';

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const fmt = n => Math.round(n).toLocaleString('fr-FR') + ' G';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => iso(new Date());
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 864e5);
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const monthShort = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''); };
const monthLong = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
const dim = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const sumBy = (arr, ty) => arr.filter(t => t.type === ty).reduce((a, t) => a + t.amount, 0);
const median = a => { const s = a.slice().sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function toast(m) {
  const t = $('toast'); t.textContent = m; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- Données ---------------- */
let S = { tx: [], goal: 0, cap: 0, budgets: {}, seen: {}, notif: false, deleted: {}, settingsAt: 0, bilanSeen: {} };
try {
  const r = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || 'null');
  if (r && Array.isArray(r.tx)) S = Object.assign(S, r);
} catch (e) { }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };
const save = () => { persist(); schedSync(); };

/* Réglages de synchronisation (jeton GitHub) : stockés à part, jamais exportés */
const SYNC_KEY = 'mes-gourdes-sync', GIST_DESC = 'Mes Gourdes sync', GIST_FILE = 'mes-gourdes.json';
let SY = { token: '', gist: '', last: 0 };
try { const r = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); if (r) SY = Object.assign(SY, r); } catch (e) { }
const saveSY = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(SY)); } catch (e) { } };

/* Valide une opération venant d'un fichier (import ou synchronisation) */
function cleanTx(t) {
  if (!t || (t.type !== 'expense' && t.type !== 'saving')) return null;
  const amount = Math.floor(Number(t.amount));
  if (!(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) return null;
  return { id: String(t.id || uid()).slice(0, 40), type: t.type, amount, category: String(t.category || 'Autre').slice(0, 40), note: String(t.note || '').slice(0, 80), date: t.date };
}

let AI = { key: '', model: DEFAULT_MODEL };
try { const r = JSON.parse(localStorage.getItem(AI_KEY) || 'null'); if (r) AI = Object.assign(AI, r); } catch (e) { }
const saveAI = () => { try { localStorage.setItem(AI_KEY, JSON.stringify(AI)); } catch (e) { } };

function addTx(type, amount, category, note, date) {
  S.tx.push({ id: uid(), type, amount, category, note: note || '', date });
}

/* ---------------- Navigation ---------------- */
function go(tab) {
  if (tab === 'ana') { markBilanSeen(); markBilanAnSeen(); }
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
  document.querySelectorAll('section').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => go(b.dataset.tab));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));

/* ---------------- Formulaire d'ajout ---------------- */
let type = 'expense';
function breakdown(n) {
  const out = []; let r = n;
  for (const d of DENOMS) { const c = Math.floor(r / d); if (c) { out.push(c + '×' + d); r -= c * d; } }
  return { parts: out, rest: r };
}
function setType(t) {
  type = t;
  document.querySelectorAll('#seg button').forEach(b => { b.className = b.dataset.t === t ? 'on ' + t : ''; });
  $('cat').innerHTML = CATS[t].map(c => `<option>${esc(c)}</option>`).join('');
  $('addBtn').textContent = t === 'expense' ? 'Ajouter la dépense' : "Ajouter l'économie";
  $('addBtn').className = 'btn ' + (t === 'expense' ? 'expense' : '');
}
document.querySelectorAll('#seg button').forEach(b => b.onclick = () => setType(b.dataset.t));

$('chips').innerHTML = DENOMS.slice().reverse().map(d => `<button type="button" class="chip" data-v="${d}">+${d}</button>`).join('') +
  '<button type="button" class="chip" data-v="0">✕</button>';
$('chips').onclick = e => {
  const v = e.target.dataset && e.target.dataset.v; if (v === undefined) return;
  $('amount').value = v === '0' ? '' : (Number($('amount').value || 0) + Number(v));
  showBreakdown();
};
function showBreakdown() {
  const n = Math.floor(Number($('amount').value) || 0);
  if (n <= 0) { $('breakdown').textContent = ''; return; }
  const b = breakdown(n);
  $('breakdown').textContent = '= ' + b.parts.join(' + ') + (b.rest ? ` (reste ${b.rest} G : moins que la plus petite pièce)` : '');
}
$('amount').addEventListener('input', showBreakdown);

$('addBtn').onclick = () => {
  const amount = Math.floor(Number($('amount').value));
  if (!(amount > 0)) { toast('Entrez un montant valide'); return; }
  addTx(type, amount, $('cat').value, $('note').value.trim(), $('date').value || today());
  save();
  $('amount').value = ''; $('note').value = ''; showBreakdown();
  render();
  toast(type === 'expense' ? 'Dépense ajoutée' : 'Économie ajoutée');
  checkAlerts(true);
};
$('goAiAdd').onclick = () => { go('ai'); setTimeout(() => $('aiAddText').focus(), 50); };

/* ---------------- Alertes (locales) ---------------- */
function computeAlerts() {
  const out = [];
  const m = today().slice(0, 7), dom = new Date().getDate(), days = dim(m);
  const exp = S.tx.filter(t => t.type === 'expense' && t.date.startsWith(m));
  const by = {}; exp.forEach(t => by[t.category] = (by[t.category] || 0) + t.amount);
  const total = exp.reduce((a, t) => a + t.amount, 0);

  for (const [c, lim] of Object.entries(S.budgets || {})) {
    if (!(lim > 0)) continue;
    const s = by[c] || 0, p = s / lim;
    if (p >= 1) out.push({ id: `b100-${c}-${m}`, level: 'danger', icon: '🚨', text: `Budget « ${c} » dépassé : ${fmt(s)} sur ${fmt(lim)}.` });
    else if (p >= 0.8) out.push({ id: `b80-${c}-${m}`, level: 'warn', icon: '⚠️', text: `Budget « ${c} » à ${Math.round(p * 100)} % : ${fmt(s)} sur ${fmt(lim)}.` });
  }
  if (S.cap > 0) {
    if (total >= S.cap) out.push({ id: `cap100-${m}`, level: 'danger', icon: '🚨', text: `Plafond du mois atteint : ${fmt(total)} dépensés sur ${fmt(S.cap)}.` });
    else if (total >= S.cap * 0.8) out.push({ id: `cap80-${m}`, level: 'warn', icon: '⚠️', text: `Vous avez utilisé ${Math.round(total / S.cap * 100)} % de votre plafond mensuel.` });
    else if (dom >= 5) {
      const proj = total / dom * days;
      if (proj > S.cap) out.push({ id: `proj-${m}`, level: 'warn', icon: '📈', text: `À ce rythme, vous dépenserez environ ${fmt(proj)} ce mois-ci, au-dessus de votre plafond (${fmt(S.cap)}).` });
    }
  }
  const bal = sumBy(S.tx, 'saving') - sumBy(S.tx, 'expense');
  if (bal < 0) out.push({ id: `neg-${m}`, level: 'danger', icon: '🚨', text: `Vos dépenses dépassent vos économies de ${fmt(-bal)}.` });

  // Dépenses inhabituelles (3 derniers jours) : au moins 2,5× la médiane de la catégorie
  const recent = S.tx.filter(t => t.type === 'expense' && t.date >= addDays(today(), -2));
  for (const t of recent) {
    const prev = S.tx.filter(x => x.type === 'expense' && x.category === t.category && x.id !== t.id && x.date <= t.date).map(x => x.amount);
    if (prev.length >= 4) {
      const med = median(prev);
      if (med > 0 && t.amount >= med * 2.5) out.push({ id: `odd-${t.id}`, level: 'warn', icon: '🔍', text: `Dépense inhabituelle en « ${t.category} » : ${fmt(t.amount)} (habituellement ~${fmt(med)}).` });
    }
  }
  if (S.tx.length) {
    const last = S.tx.reduce((a, t) => t.date > a ? t.date : a, '0000-00-00');
    const gap = daysBetween(last, today());
    if (gap >= 3) out.push({ id: `idle-${today()}`, level: 'info', icon: '📝', text: `Aucune opération depuis ${gap} jours. Pensez à noter vos dépenses.` });
  }
  const lq = qPrev(qOf(m));
  if (S.tx.filter(t => qMonths(lq).includes(t.date.slice(0, 7))).length >= 10 && !(S.bilanSeen || {})[lq])
    out.push({ id: `bilan-${lq}`, level: 'info', icon: '📅', text: `Votre bilan ${qLabel(lq)} est prêt : ouvrez l'onglet Analyse.` });
  if (S.goal > 0 && sumBy(S.tx, 'saving') >= S.goal) out.push({ id: `goal-${S.goal}`, level: 'ok', icon: '🎉', text: `Objectif d'économie atteint : ${fmt(S.goal)} !` });
  // Bilan annuel : disponible dès janvier suivant
  const curY = today().slice(0, 4), prevY = String(Number(curY) - 1);
  const anCount = S.tx.filter(t => t.date.startsWith(prevY)).length;
  if (anCount >= 20 && !(S.bilanSeen || {})['an-' + prevY])
    out.push({ id: `bilan-an-${prevY}`, level: 'info', icon: '📆', text: `Votre bilan annuel ${prevY} est prêt : ouvrez l'onglet Analyse.` });
  return out;
}

function renderAlerts(list) {
  $('alertsCard').hidden = !list.length;
  $('alertsList').innerHTML = list.map(a => `<div class="alert ${a.level}"><span>${a.icon}</span><span>${esc(a.text)}</span></div>`).join('');
}

function canNotify() { return 'Notification' in window && Notification.permission === 'granted' && S.notif; }
function pushNotification(a) {
  const opts = { body: a.text, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: a.id };
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(r => r.showNotification('Gourdes²', opts)).catch(() => { try { new Notification('Gourdes²', opts); } catch (e) { } });
  } else { try { new Notification('Gourdes²', opts); } catch (e) { } }
}
function checkAlerts(notify) {
  const list = computeAlerts();
  renderAlerts(list);
  if (notify && canNotify()) {
    let changed = false;
    for (const a of list) if (a.level !== 'ok' && !S.seen[a.id]) { S.seen[a.id] = 1; pushNotification(a); changed = true; }
    if (changed) save();
  }
}

/* ---------------- Rendu : accueil ---------------- */
function render() {
  const m = $('month').value;
  const inMonth = S.tx.filter(t => t.date.startsWith(m));
  const totSav = sumBy(S.tx, 'saving'), totExp = sumBy(S.tx, 'expense');
  $('sMonthSav').textContent = fmt(sumBy(inMonth, 'saving'));
  $('sMonthExp').textContent = fmt(sumBy(inMonth, 'expense'));
  $('sTotSav').textContent = fmt(totSav);
  $('sTotExp').textContent = fmt(totExp);
  const bal = totSav - totExp;
  $('sBal').textContent = fmt(bal);
  $('sBal').style.color = bal < 0 ? 'var(--red)' : 'var(--green)';

  $('goalBox').hidden = !(S.goal > 0);
  if (S.goal > 0) {
    const p = Math.min(100, totSav / S.goal * 100);
    $('goalBar').style.width = p + '%';
    $('goalTxt').textContent = `${fmt(totSav)} / ${fmt(S.goal)} (${Math.floor(p)} %)`;
  }
  const curExp = sumBy(S.tx.filter(t => t.date.startsWith(today().slice(0, 7))), 'expense');
  $('capBox').hidden = !(S.cap > 0);
  if (S.cap > 0) {
    const p = curExp / S.cap * 100;
    $('capBar').style.width = Math.min(100, p) + '%';
    $('capBar').parentElement.className = 'bar ' + (p >= 100 ? 'over' : 'warn');
    $('capTxt').textContent = `${fmt(curExp)} / ${fmt(S.cap)}`;
  }

  const exp = inMonth.filter(t => t.type === 'expense');
  const by = {}; exp.forEach(t => by[t.category] = (by[t.category] || 0) + t.amount);
  const tot = Object.values(by).reduce((a, b) => a + b, 0);
  $('cats').innerHTML = tot ? Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, v]) => {
    const lim = S.budgets[c];
    return `<div class="catrow"><div><span>${esc(c)}${lim ? ` <small>/ ${fmt(lim)}</small>` : ''}</span><b>${fmt(v)}</b></div>
      <div class="bar ${lim && v >= lim ? 'over' : ''}"><i style="width:${lim ? Math.min(100, v / lim * 100) : v / tot * 100}%"></i></div></div>`;
  }).join('') : '<div class="empty">Aucune dépense ce mois-ci</div>';

  renderHist();
  renderAna();
  renderAiState();
}
$('month').onchange = () => { render(); };

/* ---------------- Historique & sélection ---------------- */
function getFiltered() {
  const p = $('fPeriod').value, q = $('fText').value.trim().toLowerCase(), ty = $('fType').value,
    c = $('fCat').value, min = Number($('fMin').value) || 0, m = $('month').value, t0 = today();
  return S.tx.filter(t => {
    if (p === 'month' && !t.date.startsWith(m)) return false;
    if (p === '30d' && t.date < addDays(t0, -29)) return false;
    if (p === '90d' && t.date < addDays(t0, -89)) return false;
    if (p === 'year' && !t.date.startsWith(t0.slice(0, 4))) return false;
    if (ty !== 'all' && t.type !== ty) return false;
    if (c !== 'all' && t.category !== c) return false;
    if (min && t.amount < min) return false;
    if (q && !((t.note || '') + ' ' + t.category).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
function fillCatFilter() {
  const cur = $('fCat').value || 'all';
  const all = [...new Set([...CATS.expense, ...CATS.saving, ...S.tx.map(t => t.category)])];
  $('fCat').innerHTML = '<option value="all">Toutes</option>' + all.map(c => `<option>${esc(c)}</option>`).join('');
  $('fCat').value = all.includes(cur) || cur === 'all' ? cur : 'all';
}
function renderHist() {
  fillCatFilter();
  const list = getFiltered();
  $('histCount').textContent = `· ${list.length} ligne${list.length > 1 ? 's' : ''}`;
  $('hSav').textContent = fmt(sumBy(list, 'saving'));
  $('hExp').textContent = fmt(sumBy(list, 'expense'));
  $('list').innerHTML = list.length ? list.map(t => {
    const d = t.date.split('-').reverse().join('/');
    return `<div class="tx"><div class="main"><b>${esc(t.category)}</b><small>${d}${t.note ? ' · ' + esc(t.note) : ''}</small></div>
      <span class="amt ${t.type}">${t.type === 'expense' ? '−' : '+'}${fmt(t.amount)}</span>
      <button data-del="${t.id}" aria-label="Supprimer">🗑️</button></div>`;
  }).join('') : '<div class="empty">Aucune ligne ne correspond</div>';
}
['fPeriod', 'fType', 'fCat', 'fMin', 'fText'].forEach(id => $(id).addEventListener('input', renderHist));
$('fReset').onclick = () => { $('fPeriod').value = 'month'; $('fType').value = 'all'; $('fCat').value = 'all'; $('fMin').value = ''; $('fText').value = ''; renderHist(); };
$('list').onclick = e => {
  const id = e.target.dataset && e.target.dataset.del; if (!id) return;
  if (confirm('Supprimer cette ligne ?')) { S.tx = S.tx.filter(t => t.id !== id); S.deleted[id] = Date.now(); save(); render(); checkAlerts(false); }
};
$('fCsv').onclick = () => {
  const list = getFiltered(); if (!list.length) { toast('Rien à exporter'); return; }
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = ['date;type;categorie;montant;note', ...list.map(t => [t.date, t.type === 'expense' ? 'depense' : 'economie', q(t.category), t.amount, q(t.note || '')].join(';'))];
  download('mes-gourdes-selection-' + today() + '.csv', '﻿' + rows.join('\n'), 'text/csv;charset=utf-8');
};
function download(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------------- Analyse ---------------- */
function monthStats(m) {
  const l = S.tx.filter(t => t.date.startsWith(m));
  return { exp: sumBy(l, 'expense'), sav: sumBy(l, 'saving'), list: l };
}
function trendSvg(data) {
  const W = 320, H = 140, bw = 13, gap = (W - 16) / data.length;
  const max = Math.max(1, ...data.flatMap(d => [d.sav, d.exp]));
  let s = `<svg viewBox="0 0 ${W} ${H + 22}" width="100%" role="img" aria-label="Économies et dépenses sur 6 mois">`;
  data.forEach((d, i) => {
    const x = 8 + i * gap + gap / 2, hs = d.sav / max * H, he = d.exp / max * H;
    s += `<rect x="${x - bw - 1}" y="${H - hs}" width="${bw}" height="${hs}" rx="3" fill="var(--green)"><title>${d.label} · économies ${fmt(d.sav)}</title></rect>`;
    s += `<rect x="${x + 1}" y="${H - he}" width="${bw}" height="${he}" rx="3" fill="var(--red)"><title>${d.label} · dépenses ${fmt(d.exp)}</title></rect>`;
    s += `<text x="${x}" y="${H + 15}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(d.label)}</text>`;
  });
  return s + `<line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="var(--line)"/></svg>`;
}
function renderAna() {
  const m = $('month').value, isCur = m === today().slice(0, 7);
  $('anaMonth').textContent = '· ' + monthLong(m);
  const data = [];
  for (let i = -5; i <= 0; i++) { const k = shiftMonth(m, i), st = monthStats(k); data.push({ label: monthShort(k), sav: st.sav, exp: st.exp }); }
  $('trend').innerHTML = S.tx.length ? trendSvg(data) : '<div class="empty">Ajoutez des opérations pour voir le graphique</div>';

  const cur = monthStats(m), prev = monthStats(shiftMonth(m, -1));
  const dom = isCur ? new Date().getDate() : dim(m);
  const avg = cur.exp / dom;
  const proj = isCur ? avg * dim(m) : null;
  const delta = prev.exp > 0 ? (cur.exp - prev.exp) / prev.exp * 100 : null;
  const by = {}; cur.list.filter(t => t.type === 'expense').forEach(t => by[t.category] = (by[t.category] || 0) + t.amount);
  const topCat = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  const net = cur.sav - cur.exp;
  $('anaStats').innerHTML = `
    <div class="stat exp"><small>Dépensé</small><b>${fmt(cur.exp)}</b>
      ${delta === null ? '<em class="muted">pas de mois précédent</em>' : `<em class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta))} % vs mois préc.</em>`}</div>
    <div class="stat sav"><small>Économisé</small><b>${fmt(cur.sav)}</b><em class="muted">Net : ${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}</em></div>
    <div class="stat"><small>Moyenne par jour</small><b>${fmt(avg)}</b></div>
    <div class="stat"><small>Prévision fin de mois</small><b>${proj === null ? '—' : fmt(proj)}</b></div>
    <div class="stat wide"><small>Catégorie la plus coûteuse</small><b>${topCat ? esc(topCat[0]) + ' · ' + fmt(topCat[1]) : '—'}</b></div>`;

  const pby = {}; prev.list.filter(t => t.type === 'expense').forEach(t => pby[t.category] = (pby[t.category] || 0) + t.amount);
  const cats = [...new Set([...Object.keys(by), ...Object.keys(pby)])].sort((a, b) => (by[b] || 0) - (by[a] || 0));
  $('anaCats').innerHTML = cats.length ? cats.map(c => {
    const v = by[c] || 0, p = pby[c] || 0, d = v - p;
    const note = p === 0 ? (v ? 'nouveau' : '') : `${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${fmt(Math.abs(d))}`;
    return `<div class="catrow"><div><span>${esc(c)}</span><span><b>${fmt(v)}</b> <small class="${d > 0 ? 'up' : 'down'}">${note}</small></span></div>
      <div class="bar"><i style="width:${cur.exp ? v / cur.exp * 100 : 0}%"></i></div></div>`;
  }).join('') : '<div class="empty">Aucune dépense ce mois-ci</div>';

  const top = cur.list.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
  $('anaTop').innerHTML = top.length ? top.map(t => `<div class="tx"><div class="main"><b>${esc(t.category)}</b><small>${t.date.split('-').reverse().join('/')}${t.note ? ' · ' + esc(t.note) : ''}</small></div><span class="amt expense">−${fmt(t.amount)}</span></div>`).join('')
    : '<div class="empty">Aucune dépense</div>';
  renderBilan();
  renderBilanAn();
}

/* ---------------- Bilan trimestriel ---------------- */
const qOf = m => { const [y, mo] = m.split('-').map(Number); return y + '-Q' + (Math.floor((mo - 1) / 3) + 1); };
const qMonths = k => { const [y, q] = k.split('-Q').map(Number); return [0, 1, 2].map(i => y + '-' + pad((q - 1) * 3 + 1 + i)); };
const qPrev = k => { let [y, q] = k.split('-Q').map(Number); q--; if (q < 1) { q = 4; y--; } return y + '-Q' + q; };
const qLabel = k => { const [y, q] = k.split('-Q'), ms = qMonths(k); return `T${q} ${y} (${monthShort(ms[0])}–${monthShort(ms[2])})`; };
const curQ = () => qOf(today().slice(0, 7));
const qCount = k => S.tx.filter(t => qMonths(k).includes(t.date.slice(0, 7))).length;

function availableQuarters() {
  const cur = curQ(), out = [cur];
  if (!S.tx.length) return out;
  const first = qOf(S.tx.reduce((a, t) => t.date < a ? t.date : a, '9999-99-99').slice(0, 7));
  for (let k = qPrev(cur); k >= first && out.length < 8; k = qPrev(k)) out.push(k);
  return out;
}
function bilanData(k) {
  const ms = qMonths(k), pms = qMonths(qPrev(k));
  const tx = S.tx.filter(t => ms.includes(t.date.slice(0, 7))), ptx = S.tx.filter(t => pms.includes(t.date.slice(0, 7)));
  const exp = tx.filter(t => t.type === 'expense'), pexp = ptx.filter(t => t.type === 'expense');
  const byCat = l => { const o = {}; l.forEach(t => o[t.category] = (o[t.category] || 0) + t.amount); return o; };
  const first = ms[0] + '-01', end = k === curQ() ? today() : addDays(ms[2] + '-' + dim(ms[2]), 0);
  const totalDays = Math.max(1, daysBetween(first, end) + 1);
  return {
    k, ms, tx, exp, partial: k === curQ(),
    totExp: sumBy(tx, 'expense'), totSav: sumBy(tx, 'saving'), prevExp: sumBy(ptx, 'expense'), prevCount: ptx.length,
    cats: byCat(exp), pcats: byCat(pexp),
    monthly: ms.map(m => ({ m, v: sumBy(tx.filter(t => t.date.startsWith(m)), 'expense') })),
    daysWith: new Set(tx.map(t => t.date)).size, totalDays
  };
}
function bilanPoints(d) {
  const bad = [], good = [];
  const cats = Object.entries(d.cats).sort((a, b) => b[1] - a[1]);
  if (d.totExp > 0 && cats.length) {
    const [c, v] = cats[0], p = v / d.totExp;
    if (p >= 0.35 && cats.length > 1) bad.push(`« ${c} » pèse ${Math.round(p * 100)} % de vos dépenses (${fmt(v)}). C'est là qu'il y a le plus à gagner : réduire de 10 % = ${fmt(v * 0.1)} économisés sur le trimestre.`);
  }
  const rises = cats.map(([c, v]) => [c, v, d.pcats[c] || 0]).filter(([c, v, p]) => p > 0 && v - p >= 500 && (v - p) / p >= 0.25).sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]));
  if (d.prevCount >= 10) rises.slice(0, 2).forEach(([c, v, p]) => bad.push(`« ${c} » a augmenté de ${Math.round((v - p) / p * 100)} % (+${fmt(v - p)}) par rapport au trimestre précédent.`));
  const m = d.monthly;
  if (!d.partial && m[0].v > 0 && m[2].v >= m[0].v * 1.2 && m[2].v - m[0].v >= 500) bad.push(`Vos dépenses montent d'un mois à l'autre : ${fmt(m[0].v)} → ${fmt(m[2].v)}. Fixez-vous un plafond mensuel.`);
  const small = d.exp.filter(t => t.amount <= 100), smallTot = small.reduce((a, t) => a + t.amount, 0);
  if (small.length >= 15 && d.totExp > 0 && smallTot / d.totExp >= 0.1) bad.push(`${small.length} petites dépenses (100 G ou moins) totalisent ${fmt(smallTot)}, soit ${Math.round(smallTot / d.totExp * 100)} % du total. Elles passent inaperçues : regroupez vos achats.`);
  const big = d.exp.slice().sort((a, b) => b.amount - a.amount)[0];
  if (big && d.totExp > 0 && d.exp.length >= 5 && big.amount / d.totExp >= 0.25) bad.push(`Une seule dépense (${big.category}, ${fmt(big.amount)}) fait ${Math.round(big.amount / d.totExp * 100)} % du total. Était-elle prévue ?`);
  for (const [c, lim] of Object.entries(S.budgets || {})) {
    const over = d.ms.filter(mm => sumBy(d.tx.filter(t => t.type === 'expense' && t.category === c && t.date.startsWith(mm)), 'expense') > lim).length;
    if (over >= 2) bad.push(`Le budget « ${c} » (${fmt(lim)}) est dépassé ${over} mois sur 3 : réduisez la dépense ou relevez le budget à un niveau réaliste.`);
  }
  if (d.totExp > 0 && d.totSav < d.totExp * 0.1) bad.push(`Vous avez économisé ${fmt(d.totSav)} pour ${fmt(d.totExp)} dépensés (moins de 10 %). Essayez un montant fixe mis de côté chaque semaine, dès que vous recevez de l'argent.`);

  if (d.totExp > 0 && d.totSav >= d.totExp * 0.25) good.push(`Bon rythme d'épargne : ${fmt(d.totSav)} économisés pour ${fmt(d.totExp)} dépensés.`);
  if (d.prevCount >= 10 && d.prevExp > 0 && d.totExp < d.prevExp * 0.95 && !d.partial) good.push(`Vos dépenses baissent de ${Math.round((d.prevExp - d.totExp) / d.prevExp * 100)} % par rapport au trimestre précédent.`);
  if (d.prevCount >= 10) cats.map(([c, v]) => [c, v, d.pcats[c] || 0]).filter(([c, v, p]) => p >= 500 && v <= p * 0.85).slice(0, 2).forEach(([c, v, p]) => good.push(`« ${c} » baisse de ${Math.round((p - v) / p * 100)} % (−${fmt(p - v)}). Bien joué.`));
  return { bad, good };
}
let bilanCache = null;
function renderBilan() {
  const qs = availableQuarters(), sel = $('bilanQ');
  let k = sel.value && qs.includes(sel.value) ? sel.value : (qs.find(q => q !== curQ() && qCount(q) >= 10) || curQ());
  sel.innerHTML = qs.map(q => `<option value="${q}">${esc(qLabel(q))}${q === curQ() ? ' — en cours' : ''}</option>`).join('');
  sel.value = k;
  const d = bilanData(k); bilanCache = d;
  const enough = d.tx.length >= 10;
  $('bilanAi').hidden = !enough;
  if (!enough) { $('bilanBody').innerHTML = `<div class="empty">Pas assez de données pour un bilan fiable (${d.tx.length} opération${d.tx.length > 1 ? 's' : ''} sur ce trimestre, 10 minimum).</div>`; return; }
  const delta = d.prevCount >= 10 && d.prevExp > 0 ? (d.totExp - d.prevExp) / d.prevExp * 100 : null;
  const per100 = d.totExp > 0 ? Math.round(d.totSav / d.totExp * 100) : null;
  const pts = bilanPoints(d);
  const reliability = d.daysWith / d.totalDays < 0.4 ? `<div class="alert info"><span>ℹ️</span><span>Vous n'avez noté des opérations que ${d.daysWith} jour(s) sur ${d.totalDays}. Le bilan est probablement incomplet.</span></div>` : '';
  const cats = Object.entries(d.cats).sort((a, b) => b[1] - a[1]);
  $('bilanBody').innerHTML = `
    ${d.partial ? '<div class="alert info"><span>⏳</span><span>Trimestre en cours : les chiffres sont partiels.</span></div>' : ''}
    ${reliability}
    <div class="grid" style="margin-top:10px">
      <div class="stat exp"><small>Dépensé</small><b>${fmt(d.totExp)}</b>${delta === null ? '' : `<em class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta))} % vs trim. préc.</em>`}</div>
      <div class="stat sav"><small>Économisé</small><b>${fmt(d.totSav)}</b>${per100 === null ? '' : `<em class="muted">${per100} G pour 100 G dépensés</em>`}</div>
    </div>
    <div class="mrow">${d.monthly.map(x => `<span><b>${fmt(x.v)}</b>${monthShort(x.m)}</span>`).join('')}</div>
    <div class="sub">Où part l'argent</div>
    ${cats.map(([c, v]) => { const p = d.pcats[c] || 0, dd = v - p; return `<div class="catrow"><div><span>${esc(c)} <small>${Math.round(v / d.totExp * 100)} %</small></span><span><b>${fmt(v)}</b> ${d.prevCount >= 10 ? `<small class="${dd > 0 ? 'up' : 'down'}">${p === 0 ? 'nouveau' : (dd > 0 ? '▲ ' : dd < 0 ? '▼ ' : '= ') + fmt(Math.abs(dd))}</small>` : ''}</span></div><div class="bar"><i style="width:${v / d.totExp * 100}%"></i></div></div>`; }).join('')}
    <div class="sub">À changer</div>
    ${pts.bad.length ? pts.bad.map(t => `<div class="alert warn"><span>🎯</span><span>${esc(t)}</span></div>`).join('') : '<div class="alert ok"><span>👍</span><span>Rien d\'alarmant ce trimestre. Continuez ainsi.</span></div>'}
    ${pts.good.length ? '<div class="sub">Points positifs</div>' + pts.good.map(t => `<div class="alert ok"><span>✅</span><span>${esc(t)}</span></div>`).join('') : ''}`;
}
function markBilanSeen() {
  const k = $('bilanQ').value; if (!k || k === curQ()) return;
  if (!S.bilanSeen) S.bilanSeen = {};
  if (!S.bilanSeen[k]) { S.bilanSeen[k] = 1; persist(); checkAlerts(false); }
}
$('bilanQ').onchange = () => { renderBilan(); markBilanSeen(); };
$('bilanAi').onclick = () => {
  const d = bilanCache; if (!d) return;
  const lines = [`Fais le bilan global de ma consommation pour ${qLabel(d.k)}. Dis ce qui va bien, les 3 à 5 points à changer en priorité (avec des montants), et un objectif chiffré pour le trimestre suivant.`,
    `Données du trimestre : dépensé ${d.totExp} G, économisé ${d.totSav} G${d.prevCount >= 10 ? `, dépensé le trimestre précédent ${d.prevExp} G` : ''}.`,
    'Dépenses par mois : ' + d.monthly.map(x => `${x.m}=${x.v}`).join(', ') + '.',
    'Par catégorie (ce trimestre / précédent) : ' + Object.entries(d.cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c}=${v}/${d.pcats[c] || 0}`).join(', ') + '.'];
  go('ai'); ask(lines.join('\n'), 'Bilan détaillé : ' + qLabel(d.k));
};

/* ---------------- Bilan annuel ---------------- */
function availableYears() {
  const cur = today().slice(0, 4), out = [cur];
  if (!S.tx.length) return out;
  const first = S.tx.reduce((a, t) => t.date < a ? t.date : a, '9999-99-99').slice(0, 4);
  for (let y = Number(cur) - 1; y >= Number(first) && out.length < 8; y--) out.push(String(y));
  return out;
}
function anData(y) {
  const months = Array.from({ length: 12 }, (_, i) => y + '-' + pad(i + 1));
  const tx = S.tx.filter(t => t.date.startsWith(y));
  const exp = tx.filter(t => t.type === 'expense');
  const py = String(Number(y) - 1);
  const ptx = S.tx.filter(t => t.date.startsWith(py));
  const byCat = l => { const o = {}; l.forEach(t => o[t.category] = (o[t.category] || 0) + t.amount); return o; };
  const isCur = y === today().slice(0, 4);
  const end = isCur ? today() : y + '-12-31';
  const totalDays = Math.max(1, daysBetween(y + '-01-01', end) + 1);
  return {
    y, isCur, tx, exp,
    totExp: sumBy(tx, 'expense'), totSav: sumBy(tx, 'saving'),
    prevExp: sumBy(ptx, 'expense'), prevSav: sumBy(ptx, 'saving'), prevCount: ptx.length,
    cats: byCat(exp), pcats: byCat(ptx.filter(t => t.type === 'expense')),
    monthly: months.map(m => ({
      m, exp: sumBy(tx.filter(t => t.date.startsWith(m)), 'expense'),
      sav: sumBy(tx.filter(t => t.date.startsWith(m)), 'saving')
    })),
    daysWith: new Set(tx.map(t => t.date)).size, totalDays
  };
}
function anPoints(d) {
  const bad = [], good = [];
  const cats = Object.entries(d.cats).sort((a, b) => b[1] - a[1]);
  if (d.totExp > 0 && cats.length) {
    const [c, v] = cats[0], p = v / d.totExp;
    if (p >= 0.3 && cats.length > 1) bad.push(`« ${c} » représente ${Math.round(p * 100)} % de vos dépenses annuelles (${fmt(v)}). Cibler cette catégorie a le plus grand impact.`);
  }
  const rises = cats.map(([c, v]) => [c, v, d.pcats[c] || 0]).filter(([c, v, p]) => p > 0 && v - p >= 1000 && (v - p) / p >= 0.2).sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]));
  if (d.prevCount >= 20) rises.slice(0, 3).forEach(([c, v, p]) => bad.push(`« ${c} » a augmenté de ${Math.round((v - p) / p * 100)} % sur un an (+${fmt(v - p)}).`));
  const active = d.monthly.filter(x => x.exp > 0 || x.sav > 0).length;
  if (!d.isCur && active < 9) bad.push(`Vous n'avez noté des opérations que ${active} mois sur 12. Plus vous complétez, plus l'analyse est fiable.`);
  const small = d.exp.filter(t => t.amount <= 100), smallTot = small.reduce((a, t) => a + t.amount, 0);
  if (small.length >= 30 && d.totExp > 0 && smallTot / d.totExp >= 0.08) bad.push(`${small.length} petites dépenses (100 G ou moins) totalisent ${fmt(smallTot)} sur l'année. Regrouper les achats courants peut faire une réelle différence.`);
  if (d.totExp > 0 && d.totSav < d.totExp * 0.1) bad.push(`Vous avez économisé ${fmt(d.totSav)} pour ${fmt(d.totExp)} dépensés sur l'année (moins de 10 %). L'objectif recommandé est 20 % ou plus.`);
  for (const [c, lim] of Object.entries(S.budgets || {})) {
    const overMonths = d.monthly.filter(({ m }) => sumBy(d.tx.filter(t => t.type === 'expense' && t.category === c && t.date.startsWith(m)), 'expense') > lim).length;
    if (overMonths >= 4) bad.push(`Le budget « ${c} » (${fmt(lim)}/mois) est dépassé ${overMonths} mois dans l'année. Ajustez le budget ou réduisez la dépense.`);
  }
  if (d.totSav >= d.totExp * 0.25 && d.totExp > 0) good.push(`Excellent taux d'épargne : ${fmt(d.totSav)} économisés pour ${fmt(d.totExp)} dépensés (${Math.round(d.totSav / d.totExp * 100)} %).`);
  if (d.prevCount >= 20 && d.prevExp > 0 && !d.isCur && d.totExp < d.prevExp * 0.95) good.push(`Vos dépenses annuelles baissent de ${Math.round((d.prevExp - d.totExp) / d.prevExp * 100)} % par rapport à l'année précédente.`);
  if (d.prevCount >= 20) cats.map(([c, v]) => [c, v, d.pcats[c] || 0]).filter(([c, v, p]) => p >= 1000 && v <= p * 0.8).slice(0, 2).forEach(([c, v, p]) => good.push(`« ${c} » baisse de ${Math.round((p - v) / p * 100)} % sur un an (−${fmt(p - v)}). Bonne maîtrise.`));
  return { bad, good };
}
let anCache = null;
function renderBilanAn() {
  const years = availableYears(), sel = $('bilanAnY');
  let y = sel.value && years.includes(sel.value) ? sel.value : (years.find(y => y !== today().slice(0, 4)) || years[0]);
  sel.innerHTML = years.map(yr => `<option value="${yr}">${yr}${yr === today().slice(0, 4) ? ' — en cours' : ''}</option>`).join('');
  sel.value = y;
  const d = anData(y); anCache = d;
  const enough = d.tx.length >= 20;
  $('bilanAnAi').hidden = !enough;
  if (!enough) { $('bilanAnBody').innerHTML = `<div class="empty">Pas assez de données (${d.tx.length} opération${d.tx.length > 1 ? 's' : ''}, 20 minimum).</div>`; return; }
  const delta = d.prevCount >= 20 && d.prevExp > 0 ? (d.totExp - d.prevExp) / d.prevExp * 100 : null;
  const deltaSav = d.prevCount >= 20 && d.prevSav > 0 ? (d.totSav - d.prevSav) / d.prevSav * 100 : null;
  const per100 = d.totExp > 0 ? Math.round(d.totSav / d.totExp * 100) : null;
  const pts = anPoints(d);
  const reliability = d.daysWith / d.totalDays < 0.3 ? `<div class="alert info"><span>ℹ️</span><span>Opérations notées ${d.daysWith} jour(s) sur ${d.totalDays} : le bilan est probablement incomplet.</span></div>` : '';
  const cats = Object.entries(d.cats).sort((a, b) => b[1] - a[1]);
  // Graphique mensuel simplifié (barres économies/dépenses)
  const active = d.monthly.filter(x => x.exp > 0 || x.sav > 0);
  const maxV = Math.max(1, ...d.monthly.flatMap(x => [x.exp, x.sav]));
  const W = 320, H = 100, bw = 8, gap = (W - 16) / 12;
  let svgBars = `<svg viewBox="0 0 ${W} ${H + 18}" width="100%" role="img" aria-label="Dépenses et économies mensuelles ${y}">`;
  d.monthly.forEach((x, i) => {
    const cx = 8 + i * gap + gap / 2, hs = x.sav / maxV * H, he = x.exp / maxV * H;
    svgBars += `<rect x="${cx - bw - 1}" y="${H - hs}" width="${bw}" height="${hs}" rx="2" fill="var(--green)"><title>${x.m} économies ${fmt(x.sav)}</title></rect>`;
    svgBars += `<rect x="${cx + 1}" y="${H - he}" width="${bw}" height="${he}" rx="2" fill="var(--red)"><title>${x.m} dépenses ${fmt(x.exp)}</title></rect>`;
    if (i % 2 === 0 || i === 11) svgBars += `<text x="${cx}" y="${H + 13}" text-anchor="middle" font-size="9" fill="var(--muted)">${monthShort(x.m)}</text>`;
  });
  svgBars += `<line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="var(--line)"/></svg>`;
  $('bilanAnBody').innerHTML = `
    ${d.isCur ? '<div class="alert info"><span>⏳</span><span>Année en cours : les chiffres sont partiels.</span></div>' : ''}
    ${reliability}
    <div class="grid" style="margin-top:10px">
      <div class="stat exp"><small>Dépensé</small><b>${fmt(d.totExp)}</b>${delta === null ? '' : `<em class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta))} % vs an préc.</em>`}</div>
      <div class="stat sav"><small>Économisé</small><b>${fmt(d.totSav)}</b>${deltaSav === null ? '' : `<em class="${deltaSav > 0 ? 'down' : 'up'}">${deltaSav > 0 ? '▲' : '▼'} ${Math.abs(Math.round(deltaSav))} % vs an préc.</em>`}</div>
      ${per100 !== null ? `<div class="stat wide"><small>Taux d'épargne</small><b>${per100} G économisés pour 100 G dépensés</b></div>` : ''}
    </div>
    ${svgBars}
    <div class="legend"><span><i style="background:var(--green)"></i>Économies</span><span><i style="background:var(--red)"></i>Dépenses</span></div>
    <div class="sub">Où part l'argent</div>
    ${cats.map(([c, v]) => { const p = d.pcats[c] || 0, dd = v - p; return `<div class="catrow"><div><span>${esc(c)} <small>${Math.round(v / d.totExp * 100)} %</small></span><span><b>${fmt(v)}</b> ${d.prevCount >= 20 ? `<small class="${dd > 0 ? 'up' : 'down'}">${p === 0 ? 'nouveau' : (dd > 0 ? '▲ ' : dd < 0 ? '▼ ' : '= ') + fmt(Math.abs(dd))}</small>` : ''}</span></div><div class="bar"><i style="width:${v / d.totExp * 100}%"></i></div></div>`; }).join('')}
    <div class="sub">À changer</div>
    ${pts.bad.length ? pts.bad.map(t => `<div class="alert warn"><span>🎯</span><span>${esc(t)}</span></div>`).join('') : '<div class="alert ok"><span>👍</span><span>Rien d\'alarmant cette année. Continuez ainsi.</span></div>'}
    ${pts.good.length ? '<div class="sub">Points positifs</div>' + pts.good.map(t => `<div class="alert ok"><span>✅</span><span>${esc(t)}</span></div>`).join('') : ''}`;
}
$('bilanAnY').onchange = () => { renderBilanAn(); markBilanAnSeen(); };
$('bilanAnAi').onclick = () => {
  const d = anCache; if (!d) return;
  const lines = [
    `Fais le bilan annuel de ma gestion financière pour ${d.y}. Identifie les 3 à 5 priorités à améliorer (avec montants), ce qui va bien, et fixe un objectif chiffré pour ${Number(d.y) + 1}.`,
    `Total ${d.y} : dépensé ${d.totExp} G, économisé ${d.totSav} G.${d.prevCount >= 20 ? ` Année précédente : dépensé ${d.prevExp} G, économisé ${d.prevSav} G.` : ''}`,
    'Dépenses mensuelles : ' + d.monthly.map(x => `${x.m.slice(5)}=${x.exp}`).join(', ') + '.',
    'Par catégorie (cette année / précédente) : ' + Object.entries(d.cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c}=${v}/${d.pcats[c] || 0}`).join(', ') + '.'
  ];
  go('ai'); ask(lines.join('\n'), 'Bilan annuel ' + d.y);
};
function markBilanAnSeen() {
  const y = $('bilanAnY').value; if (!y || y === today().slice(0, 4)) return;
  if (!S.bilanSeen) S.bilanSeen = {};
  const k = 'an-' + y;
  if (!S.bilanSeen[k]) { S.bilanSeen[k] = 1; persist(); checkAlerts(false); }
}

/* ---------------- Compteur de billets ---------------- */
$('denoms').innerHTML = DENOMS.map(d => `<div class="denom"><span>${d} G</span><input type="number" inputmode="numeric" min="0" placeholder="0" data-d="${d}" aria-label="Nombre de ${d} G"><span id="sub${d}">0 G</span></div>`).join('');
function cashTotal() {
  let t = 0;
  document.querySelectorAll('#denoms input').forEach(i => {
    const n = Math.max(0, Math.floor(Number(i.value) || 0)), s = n * Number(i.dataset.d);
    t += s; $('sub' + i.dataset.d).textContent = fmt(s);
  });
  $('cashTotal').textContent = fmt(t); return t;
}
$('denoms').addEventListener('input', cashTotal);
$('cashReset').onclick = () => { document.querySelectorAll('#denoms input').forEach(i => i.value = ''); cashTotal(); };
$('cashAdd').onclick = () => {
  const t = cashTotal(); if (t <= 0) { toast('Rien à ajouter'); return; }
  addTx('saving', t, 'Épargne', 'Comptage billets/pièces', today()); save(); render(); checkAlerts(true);
  $('cashReset').onclick(); toast('Ajouté aux économies');
};

/* ---------------- Objectif & budgets ---------------- */
$('budgets').innerHTML = CATS.expense.map(c => `<div class="bud"><span>${esc(c)}</span><input type="number" inputmode="numeric" min="0" placeholder="—" data-cat="${esc(c)}" aria-label="Budget ${esc(c)}"></div>`).join('');
function loadBudgetForm() {
  $('goal').value = S.goal || ''; $('cap').value = S.cap || '';
  document.querySelectorAll('#budgets input').forEach(i => i.value = S.budgets[i.dataset.cat] || '');
}
$('budgetSave').onclick = () => {
  S.goal = Math.max(0, Math.floor(Number($('goal').value) || 0));
  S.cap = Math.max(0, Math.floor(Number($('cap').value) || 0));
  S.budgets = {};
  document.querySelectorAll('#budgets input').forEach(i => { const v = Math.floor(Number(i.value) || 0); if (v > 0) S.budgets[i.dataset.cat] = v; });
  S.settingsAt = Date.now();
  save(); render(); checkAlerts(true); toast('Enregistré');
};

/* ---------------- IA ---------------- */
const hasKey = () => !!(AI.key && AI.key.trim());
function renderAiState() {
  $('aiNoKey').hidden = hasKey();
  ['aiAddBtn', 'aiSend'].forEach(id => $(id).disabled = !hasKey() || aiBusy);
}
let aiBusy = false;

async function callAI(system, messages, max = 1000) {
  if (!hasKey()) throw new Error('Ajoutez votre clé API dans l\'onglet Plus.');
  const model = (AI.model || DEFAULT_MODEL).trim();
  // Convertit le format Anthropic (role/content) vers Gemini (role/parts)
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(AI.key.trim())}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: max }
      })
    });
  } catch (e) { throw new Error('Pas de connexion à l\'IA. Vérifiez votre internet.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 400) throw new Error('Requête invalide. Vérifiez votre clé API dans Plus.');
    if (r.status === 403) throw new Error('Clé API refusée. Vérifiez-la dans Plus.');
    if (r.status === 429) throw new Error('Trop de demandes ou quota dépassé. Réessayez plus tard.');
    throw new Error((j.error && j.error.message) || 'Erreur de l\'IA (' + r.status + ').');
  }
  const cands = (j.candidates || []);
  if (!cands.length) throw new Error('Réponse vide de l\'IA.');
  return (cands[0].content && cands[0].content.parts || []).map(p => p.text || '').join('\n').trim();
}

function buildContext() {
  const m = today().slice(0, 7);
  const lines = [];
  lines.push(`Date du jour : ${today()}. Devise : gourde haïtienne (G). Pièce de 5 G et billets de 10, 25, 50, 100, 250, 500, 1000 G.`);
  const totSav = sumBy(S.tx, 'saving'), totExp = sumBy(S.tx, 'expense');
  lines.push(`Total économisé : ${totSav} G. Total dépensé : ${totExp} G. Reste : ${totSav - totExp} G.`);
  lines.push(`Objectif d'économie : ${S.goal ? S.goal + ' G' : 'aucun'}. Plafond mensuel : ${S.cap ? S.cap + ' G' : 'aucun'}.`);
  const b = Object.entries(S.budgets).map(([c, v]) => `${c}=${v}`).join(', ');
  lines.push(`Budgets par catégorie : ${b || 'aucun'}.`);
  lines.push('Résumé des 6 derniers mois (économies / dépenses) :');
  for (let i = -5; i <= 0; i++) { const k = shiftMonth(m, i), s = monthStats(k); lines.push(`- ${k} : ${s.sav} / ${s.exp}`); }
  const by = {}; S.tx.filter(t => t.type === 'expense' && t.date.startsWith(m)).forEach(t => by[t.category] = (by[t.category] || 0) + t.amount);
  lines.push('Dépenses du mois en cours par catégorie : ' + (Object.entries(by).map(([c, v]) => `${c}=${v}`).join(', ') || 'aucune') + '.');
  const last = S.tx.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80);
  lines.push('Dernières opérations (date | type | catégorie | montant | note) :');
  last.forEach(t => lines.push(`${t.date} | ${t.type === 'expense' ? 'dépense' : 'économie'} | ${t.category} | ${t.amount} | ${t.note || ''}`));
  return lines.join('\n');
}
const SYSTEM_COACH = ctx => `Tu es un conseiller financier personnel bienveillant et concret, intégré à une petite application de suivi en gourdes haïtiennes (G).
Réponds en français simple, de façon courte et structurée (listes à puces, 150 mots maximum sauf demande contraire).
Base-toi uniquement sur les données ci-dessous ; si une donnée manque, dis-le sans inventer. Donne des actions réalistes pour quelqu'un qui gère de l'argent liquide (billets de 5 à 1000 G). Ne donne pas de conseil d'investissement précis.

DONNÉES DE L'UTILISATEUR
${ctx}`;

/* mini rendu markdown (sécurisé : on échappe d'abord) */
function md(s) {
  const lines = esc(s).split('\n'); let html = '', inList = false;
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  for (const raw of lines) {
    const l = raw.trim();
    const li = l.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[2])}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (!l) continue;
    const h = l.match(/^#{1,4}\s+(.*)$/);
    html += `<p>${h ? '<b>' + inline(h[1]) + '</b>' : inline(l)}</p>`;
  }
  return html + (inList ? '</ul>' : '');
}

let chat = [];
function renderChat(loading) {
  $('chat').innerHTML = chat.map(m => m.role === 'user' ? `<div class="bub user">${esc(m.shown || m.content)}</div>` : m.err ? `<div class="bub err">${esc(m.content)}</div>` : `<div class="bub bot">${md(m.content)}</div>`).join('')
    + (loading ? '<div class="bub bot"><span class="dots"><span></span><span></span><span></span></span></div>' : '');
  const last = $('chat').lastElementChild; if (last) last.scrollIntoView({ block: 'nearest' });
}
async function ask(q, shown) {
  q = q.trim(); if (!q || aiBusy) return;
  if (!hasKey()) { toast('Ajoutez d\'abord votre clé API'); go('more'); return; }
  chat.push({ role: 'user', content: q, shown }); $('aiQ').value = '';
  aiBusy = true; renderAiState(); renderChat(true);
  try {
    const msgs = chat.filter(m => !m.err).slice(-8).map(m => ({ role: m.role, content: m.content }));
    const a = await callAI(SYSTEM_COACH(buildContext()), msgs, 900);
    chat.push({ role: 'assistant', content: a || '(réponse vide)' });
  } catch (e) { chat.push({ role: 'assistant', content: e.message, err: true }); }
  aiBusy = false; renderAiState(); renderChat(false);
}
const QUICK = [
  ['📊 Analyser mon mois', 'Analyse mon mois en cours : points forts, points faibles et 3 actions concrètes.'],
  ['🔍 Dépenses à réduire', 'Repère mes dépenses inhabituelles ou celles que je peux réduire, avec des montants.'],
  ['🎯 Atteindre mon objectif', 'Fais-moi un plan réaliste pour atteindre mon objectif d\'économie (par semaine).'],
  ['📈 Prévision', 'Fais une prévision de fin de mois (dépenses et économies) et dis-moi si je risque de dépasser.']
];
$('aiQuick').innerHTML = QUICK.map((q, i) => `<button type="button" class="chip" data-q="${i}">${q[0]}</button>`).join('');
$('aiQuick').onclick = e => { const i = e.target.dataset && e.target.dataset.q; if (i !== undefined) ask(QUICK[i][1]); };
$('aiSend').onclick = () => ask($('aiQ').value);
$('aiQ').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask($('aiQ').value); } });
$('aiClear').onclick = () => { chat = []; renderChat(false); };

/* Ajout intelligent (langage naturel) */
let pending = [];
function renderPending() {
  if (!pending.length) { $('aiAddPreview').innerHTML = ''; return; }
  $('aiAddPreview').innerHTML = `<div class="prev">${pending.map(t => `<div class="tx"><div class="main"><b>${esc(t.category)}</b><small>${t.date.split('-').reverse().join('/')}${t.note ? ' · ' + esc(t.note) : ''}</small></div><span class="amt ${t.type}">${t.type === 'expense' ? '−' : '+'}${fmt(t.amount)}</span></div>`).join('')}</div>
    <button class="btn" id="aiConfirm">Confirmer (${pending.length})</button><button class="btn ghost" id="aiCancel">Annuler</button>`;
  $('aiConfirm').onclick = () => {
    pending.forEach(t => addTx(t.type, t.amount, t.category, t.note, t.date));
    save(); toast(pending.length + ' ligne(s) ajoutée(s)'); pending = []; $('aiAddText').value = ''; renderPending(); render(); checkAlerts(true);
  };
  $('aiCancel').onclick = () => { pending = []; renderPending(); };
}
function parseTx(text) {
  const m = text.match(/\[[\s\S]*\]/) || text.match(/\{[\s\S]*\}/); if (!m) return [];
  let j; try { j = JSON.parse(m[0]); } catch (e) { return []; }
  return (Array.isArray(j) ? j : [j]).map(t => {
    const ty = t && t.type === 'saving' ? 'saving' : t && t.type === 'expense' ? 'expense' : null;
    const amount = Math.floor(Number(t && t.amount));
    if (!ty || !(amount > 0)) return null;
    const cat = CATS[ty].includes(t.category) ? t.category : 'Autre';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : today();
    return { type: ty, amount, category: cat, note: String(t.note || '').slice(0, 80), date };
  }).filter(Boolean).slice(0, 20);
}
$('aiAddBtn').onclick = async () => {
  const txt = $('aiAddText').value.trim(); if (!txt || aiBusy) return;
  aiBusy = true; renderAiState(); $('aiAddBtn').textContent = 'Analyse…'; pending = []; renderPending();
  const sys = `Tu extrais des opérations d'argent depuis une phrase en français ou créole haïtien. Date du jour : ${today()}.
Réponds UNIQUEMENT par un tableau JSON, sans texte autour, chaque élément : {"type":"expense"|"saving","amount":entier en gourdes,"category":string,"note":string courte,"date":"AAAA-MM-JJ"}.
Catégories de dépense autorisées : ${CATS.expense.join(', ')}.
Catégories d'économie autorisées : ${CATS.saving.join(', ')}.
« hier », « avant-hier », « lundi dernier »… doivent être convertis en date réelle. Si aucune opération n'est claire, réponds [].`;
  try {
    const out = await callAI(sys, [{ role: 'user', content: txt }], 600);
    pending = parseTx(out);
    if (!pending.length) toast('Je n\'ai rien compris, reformulez');
  } catch (e) { toast(e.message); }
  aiBusy = false; $('aiAddBtn').textContent = 'Analyser ma phrase'; renderAiState(); renderPending();
};

/* Réglages IA */
$('aiKey').value = AI.key || ''; $('aiModel').value = AI.model || DEFAULT_MODEL;
$('aiSave').onclick = async () => {
  AI.key = $('aiKey').value.trim(); AI.model = $('aiModel').value.trim() || DEFAULT_MODEL; saveAI(); renderAiState();
  if (!AI.key) { toast('Clé retirée'); return; }
  $('aiSave').disabled = true; $('aiSave').textContent = 'Test…';
  try { await callAI('Réponds uniquement : ok', [{ role: 'user', content: 'test' }], 10); toast('✅ IA connectée'); }
  catch (e) { toast(e.message); }
  $('aiSave').disabled = false; $('aiSave').textContent = 'Enregistrer et tester';
};
$('aiForget').onclick = () => { AI.key = ''; $('aiKey').value = ''; saveAI(); renderAiState(); toast('Clé retirée'); };

/* ---------------- Notifications ---------------- */
function renderNotif() {
  if (!('Notification' in window)) { $('notifBtn').hidden = true; $('notifState').textContent = 'Les notifications ne sont pas disponibles sur ce navigateur.'; return; }
  const p = Notification.permission;
  if (p === 'denied') { $('notifBtn').hidden = true; $('notifState').textContent = 'Notifications bloquées dans les réglages du navigateur.'; return; }
  const on = p === 'granted' && S.notif;
  $('notifBtn').hidden = false;
  $('notifBtn').textContent = on ? 'Désactiver les notifications' : 'Activer les notifications';
  $('notifState').textContent = on ? '✅ Actives : vous serez notifié des nouvelles alertes à l\'ouverture de l\'app.' : '';
}
$('notifBtn').onclick = async () => {
  if (S.notif && Notification.permission === 'granted') { S.notif = false; save(); renderNotif(); return; }
  const p = await Notification.requestPermission();
  S.notif = p === 'granted'; save(); renderNotif();
  if (S.notif) { toast('Notifications activées'); checkAlerts(true); }
};

/* ---------------- Installation (PWA) ---------------- */
let deferredPrompt = null;
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function renderInstall() {
  const done = standalone();
  $('installDone').hidden = !done;
  $('installBtn').hidden = done || !deferredPrompt;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('installHelp').textContent = done ? '' : deferredPrompt ? '' :
    ios ? 'Sur iPhone/iPad : ouvrez dans Safari, touchez Partager (carré avec flèche), puis « Sur l\'écran d\'accueil ».'
      : 'Sur Android/Chrome : menu ⋮ puis « Installer l\'application » (ou « Ajouter à l\'écran d\'accueil »).';
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; renderInstall(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; renderInstall(); toast('Application installée'); });
$('installBtn').onclick = async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; renderInstall(); };
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));

/* ---------------- Sauvegarde ---------------- */
$('exportBtn').onclick = () => {
  const { seen, notif, bilanSeen, ...data } = S;
  download('mes-gourdes-' + today() + '.json', JSON.stringify(data, null, 2), 'application/json');
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result); if (!d || !Array.isArray(d.tx)) throw 0;
      if (!confirm('Remplacer vos données actuelles par cette sauvegarde ?')) return;
      const cleanBud = {}; Object.entries(d.budgets || {}).forEach(([c, v]) => { if (Number(v) > 0) cleanBud[c] = Math.floor(Number(v)); });
      const tx = d.tx.map(cleanTx).filter(Boolean);
      const keep = new Set(tx.map(t => t.id)), deleted = Object.assign({}, S.deleted), now = Date.now();
      S.tx.forEach(t => { if (!keep.has(t.id)) deleted[t.id] = now; });   // les lignes retirées le sont aussi sur les autres appareils
      keep.forEach(id => delete deleted[id]);
      S = {
        tx, goal: Number(d.goal) || 0, cap: Number(d.cap) || 0, budgets: cleanBud, seen: {}, notif: S.notif,
        deleted, settingsAt: now
      };
      save(); loadBudgetForm(); render(); checkAlerts(false); toast('Sauvegarde importée');
    } catch (err) { toast('Fichier invalide'); }
  };
  r.readAsText(f); e.target.value = '';
};
$('resetAll').onclick = () => {
  if (confirm('Effacer TOUTES vos données ? Cette action est définitive.')) {
    const deleted = Object.assign({}, S.deleted), now = Date.now();
    S.tx.forEach(t => deleted[t.id] = now);
    S = { tx: [], goal: 0, cap: 0, budgets: {}, seen: {}, notif: S.notif, deleted, settingsAt: now };
    save(); loadBudgetForm(); render(); checkAlerts(false);
  }
};

/* ---------------- Synchronisation entre appareils ----------------
   Les données sont stockées dans un gist GitHub secret du compte de l'utilisateur.
   Fusion sans perte : union des opérations (par id), suppressions mémorisées,
   réglages (objectif, plafond, budgets) = version la plus récente. */
const payload = () => ({ v: 1, tx: S.tx, deleted: S.deleted, goal: S.goal, cap: S.cap, budgets: S.budgets, settingsAt: S.settingsAt || 0 });
function canon(p) {
  const sortObj = o => Object.fromEntries(Object.entries(o || {}).sort((a, b) => a[0].localeCompare(b[0])));
  return JSON.stringify({ tx: p.tx.slice().sort((a, b) => a.id.localeCompare(b.id)), deleted: sortObj(p.deleted), goal: p.goal || 0, cap: p.cap || 0, budgets: sortObj(p.budgets), settingsAt: p.settingsAt || 0 });
}
function merge(a, b) {
  b = b || {};
  const now = Date.now(), del = {};
  for (const src of [b.deleted || {}, a.deleted || {}])
    for (const [k, v] of Object.entries(src)) { const n = Number(v) || 0; if (now - n < 365 * 864e5) del[k] = Math.max(del[k] || 0, n); }
  const map = new Map();
  for (const t of [...a.tx, ...(Array.isArray(b.tx) ? b.tx : []).map(cleanTx)])
    if (t && !del[t.id] && !map.has(t.id)) map.set(t.id, t);
  const remoteNewer = (Number(b.settingsAt) || 0) > (a.settingsAt || 0);
  const bud = {}; Object.entries(remoteNewer ? (b.budgets || {}) : a.budgets).forEach(([c, v]) => { if (Number(v) > 0) bud[c] = Math.floor(Number(v)); });
  return {
    v: 1, tx: [...map.values()], deleted: del,
    goal: remoteNewer ? Math.max(0, Math.floor(Number(b.goal) || 0)) : a.goal,
    cap: remoteNewer ? Math.max(0, Math.floor(Number(b.cap) || 0)) : a.cap,
    budgets: bud, settingsAt: remoteNewer ? Number(b.settingsAt) : (a.settingsAt || 0)
  };
}

async function gh(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, {
    ...opts,
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + SY.token, ...(opts.body ? { 'content-type': 'application/json' } : {}) }
  });
  if (r.status === 401 || r.status === 403) { const e = new Error('Jeton refusé. Vérifiez qu\'il a bien le droit « gist ».'); e.auth = true; throw e; }
  if (r.status === 404) { const e = new Error('404'); e.notFound = true; throw e; }
  if (!r.ok) throw new Error('Erreur GitHub (' + r.status + ').');
  return r.json();
}
async function findGist() {
  for (let p = 1; p <= 5; p++) {
    const l = await gh('/gists?per_page=100&page=' + p);
    const g = l.find(x => x.description === GIST_DESC && x.files && x.files[GIST_FILE]);
    if (g) return g.id;
    if (l.length < 100) break;
  }
  return null;
}
async function readGist(id) {
  const g = await gh('/gists/' + id), f = g.files && g.files[GIST_FILE];
  if (!f) return null;
  const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  try { return JSON.parse(text); } catch (e) { return null; }
}

let syncing = false, syncAgain = false, lastHash = '', syncTimer = null, syncMsg = '', lastAuthError = false;
function schedSync() {
  if (!SY.token || canon(payload()) === lastHash) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), 1500);
}
async function sync() {
  if (!SY.token) return false;
  if (syncing) { syncAgain = true; return false; }
  syncing = true; lastAuthError = false; syncMsg = 'Synchronisation…'; renderSync();
  let ok = false;
  try {
    if (!SY.gist) SY.gist = (await findGist()) || '';
    let remote = null;
    if (SY.gist) { try { remote = await readGist(SY.gist); } catch (e) { if (e.notFound) SY.gist = ''; else throw e; } }
    const local = payload(), merged = merge(local, remote);
    const changedLocal = canon(merged) !== canon(local);
    if (changedLocal) {
      S.tx = merged.tx; S.deleted = merged.deleted; S.goal = merged.goal; S.cap = merged.cap; S.budgets = merged.budgets; S.settingsAt = merged.settingsAt;
      persist();
    }
    if (!remote || canon(merged) !== canon(Object.assign({ tx: [], deleted: {}, budgets: {} }, remote, { tx: (remote.tx || []).map(cleanTx).filter(Boolean) }))) {
      const body = JSON.stringify({ description: GIST_DESC, files: { [GIST_FILE]: { content: JSON.stringify(merged) } } });
      if (SY.gist) await gh('/gists/' + SY.gist, { method: 'PATCH', body });
      else { const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: JSON.stringify(merged) } } }) }); SY.gist = g.id; }
    }
    lastHash = canon(payload()); SY.last = Date.now(); saveSY(); ok = true;
    syncMsg = '✅ Synchronisé à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (changedLocal) { loadBudgetForm(); render(); checkAlerts(false); }
  } catch (e) {
    lastAuthError = !!e.auth;
    syncMsg = e instanceof TypeError ? '📴 Hors ligne : la synchronisation reprendra plus tard.' : '⚠️ ' + e.message;
  }
  syncing = false; renderSync();
  if (syncAgain) { syncAgain = false; schedSync(); }
  return ok;
}
function renderSync() {
  const on = !!SY.token;
  $('syncOffBox').hidden = on; $('syncOnBox').hidden = !on;
  $('syncState').textContent = syncMsg || (SY.last ? 'Dernière synchronisation : ' + new Date(SY.last).toLocaleString('fr-FR') : '');
  $('syncNow').disabled = syncing;
}
$('syncEnable').onclick = async () => {
  const tk = $('syncToken').value.trim(); if (!tk) { toast('Collez votre jeton GitHub'); return; }
  SY = { token: tk, gist: '', last: 0 }; lastHash = ''; saveSY();
  $('syncEnable').disabled = true; $('syncEnable').textContent = 'Connexion…';
  const ok = await sync();
  $('syncEnable').disabled = false; $('syncEnable').textContent = 'Activer la synchronisation';
  if (ok) { $('syncToken').value = ''; toast('Synchronisation activée'); }
  else if (lastAuthError) { const m = syncMsg; SY = { token: '', gist: '', last: 0 }; saveSY(); syncMsg = m; renderSync(); toast('Jeton refusé'); }
};
$('syncNow').onclick = () => sync();
$('syncDisable').onclick = () => {
  if (!confirm('Désactiver la synchronisation sur cet appareil ? Vos données restent ici et dans votre gist GitHub.')) return;
  SY = { token: '', gist: '', last: 0 }; saveSY(); lastHash = ''; syncMsg = ''; renderSync(); toast('Synchronisation désactivée');
};

/* ---------------- Démarrage ---------------- */
$('date').value = today();
$('month').value = today().slice(0, 7);
setType('expense');
loadBudgetForm();
render();
renderChat(false);
renderNotif();
renderInstall();
checkAlerts(true);
renderSync();
sync();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { $('date').value = today(); checkAlerts(true); if (Date.now() - SY.last > 30000) sync(); }
});
window.addEventListener('online', () => sync());
