import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ExactAlarm } from '@ilac/exact-alarm';
import { DB_URL, API_KEY } from './firebase-config.js';

const NATIVE_PLUGINS = { LocalNotifications, App, ExactAlarm };

const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

const K = {
  hastalar: 'ilac_takip:hastalar',
  aktif: 'ilac_takip:aktif',
  noti: 'ilac_takip:noti',
  exactAsked: 'ilac_takip:exact-asked',
  batteryAsked: 'ilac_takip:battery-asked'
};

const SAAT_ONERILERI = ['09:00', '14:00', '20:00', '08:00', '12:00', '18:00', '21:00', '07:00'];
const AKTIF_PENCERE_DK = 120;

const byId = (id) => document.getElementById(id);

function hastaIlacKey(id) { return 'ilac_takip:ilac:' + id; }
function hastaAlindiKey(id) { return 'ilac_takip:alindi:' + id; }
function hastaAyarKey(id) { return 'ilac_takip:ayar:' + id; }
function ozetKey(id) { return 'ilac_takip:ozet:' + id; }

function yukle(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}
function kaydet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('localStorage hatası', e); }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function bugunKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function tarihDeltaKey(gun) {
  const d = new Date();
  d.setDate(d.getDate() + gun);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function saatDegerleri(saat) {
  const p = saat.split(':');
  return [Number(p[0]), Number(p[1])];
}
function buguneSaat(saat) {
  const [h, m] = saatDegerleri(saat);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}
function tariheSaat(tarihKey, saat) {
  const p = tarihKey.split('-');
  const [h, m] = saatDegerleri(saat);
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), h, m, 0, 0);
}
function alindiKey(ilacId, saat) {
  return ilacId + '|' + bugunKey() + '|' + saat;
}
function tarihliAlindiKey(ilacId, tarihKey, saat) {
  return ilacId + '|' + tarihKey + '|' + saat;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function keyHash(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function bugunTurkce() {
  const gunler = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const d = new Date();
  return gunler[d.getDay()] + ', ' + d.getDate() + ' ' + aylar[d.getMonth()] + ' ' + d.getFullYear();
}
function saatBiçim(zaman) {
  const d = new Date(zaman);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* ============ DURUM ============ */
let hastalar = yukle(K.hastalar, []);
let aktifHastaId = null;
let aktifHasta = null;
let aktifIlaclar = [];
let aktifAlindi = {};
let aktifAyarlar = { onerakDk: 15, erteleDk: 5, duzenButonlari: false };
let aktifEkran = 'ekran-hastalar';
let acikModallar = [];
let pinHasta = null;
let duzenlenenHasta = null;
let duzenlenenIlac = null;
let ilacFormSaatler = ['09:00'];
let alarmKuyrugu = [];
let ertelenenler = {};
let alarmAcikKey = null;
let onayCallback = null;
let sonTarihKey = bugunKey();

function hastaDurum(hastaId) {
  const hasta = hastalar.find((h) => h.id === hastaId);
  return {
    hasta: hasta,
    ilaclar: hasta ? yukle(hastaIlacKey(hastaId), []) : [],
    alindi: hasta ? yukle(hastaAlindiKey(hastaId), {}) : {},
    ayarlar: hasta ? Object.assign({ onerakDk: 15, erteleDk: 5, duzenButonlari: false }, yukle(hastaAyarKey(hastaId), {})) : { onerakDk: 15, erteleDk: 5, duzenButonlari: false }
  };
}

/* ============ EKRAN YÖNETİMİ ============ */
const EKRANLAR = ['ekran-hastalar', 'ekran-pin', 'ekran-hasta'];
function gosterEkran(id) {
  EKRANLAR.forEach((e) => byId(e).classList.toggle('hidden', e !== id));
  aktifEkran = id;
}
function modalAc(id) {
  byId(id).classList.remove('hidden');
  if (!acikModallar.includes(id)) acikModallar.push(id);
}
function modalKapat(id) {
  byId(id).classList.add('hidden');
  acikModallar = acikModallar.filter((m) => m !== id);
}
function tümModallariKapat() {
  acikModallar.slice().forEach((m) => modalKapat(m));
}
function modalAcikMı() {
  return acikModallar.length > 0;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-medium text-white shadow-lg';
  el.textContent = msg;
  byId('toast-kapsayici').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 2000);
  setTimeout(() => el.remove(), 2400);
}

/* ============ HASTA SEÇİM EKRANI ============ */
function hastaListesiniCiz() {
  const ul = byId('hasta-listesi');
  ul.innerHTML = '';
  byId('hasta-sayac').textContent = hastalar.length ? hastalar.length + ' hasta' : 'Henüz hasta yok';
  byId('hasta-bos').classList.toggle('hidden', hastalar.length > 0);
  hastalar.forEach((h) => {
    const ilacSayisi = yukle(hastaIlacKey(h.id), []).length;
    const li = document.createElement('li');
    li.innerHTML =
      '<div class="hasta-karti flex w-full items-center gap-3 rounded-xl bg-white p-4 text-left shadow-sm transition hover:shadow-md">' +
      '<button data-hasta-id="' + h.id + '" class="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.99] transition">' +
      '<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">' + escapeHtml((h.ad || '?').charAt(0).toUpperCase()) + '</div>' +
      '<div class="min-w-0 flex-1">' +
      '<p class="truncate font-semibold text-gray-800">' + escapeHtml(h.ad) + '</p>' +
      '<p class="text-xs text-gray-400">' + ilacSayisi + ' ilaç' + (h.pin ? ' · 🔒 PIN korumalı' : '') + '</p>' +
      '</div>' +
      '<span class="text-gray-300">›</span>' +
      '</button>' +
      '<div class="flex shrink-0 items-center gap-1 text-sm">' +
      '<button data-hasta-duzenle="' + h.id + '" type="button" class="rounded-lg px-2 py-2 transition hover:bg-brand-50" title="Düzenle">✏️</button>' +
      '<button data-hasta-sil="' + h.id + '" type="button" class="rounded-lg px-2 py-2 transition hover:bg-red-50" title="Sil">🗑️</button>' +
      '</div>' +
      '</div>';
    li.querySelector('[data-hasta-id]').addEventListener('click', () => hastaKartiTıkla(h));
    ul.appendChild(li);
  });
}

function hastaKartiTıkla(hasta) {
  if (hasta.pin) {
    pinEkraniniAc(hasta);
  } else {
    hastaPaneliAc(hasta.id);
  }
}

/* ============ PIN EKRANI ============ */
function pinEkraniniAc(hasta) {
  pinHasta = hasta;
  byId('pin-hasta-ad').textContent = hasta.ad;
  byId('pin-input').value = '';
  byId('pin-hata').classList.add('hidden');
  gosterEkran('ekran-pin');
  setTimeout(() => byId('pin-input').focus(), 50);
}
function pinDogrula() {
  const deger = byId('pin-input').value;
  if (pinHasta && deger === String(pinHasta.pin)) {
    const id = pinHasta.id;
    pinHasta = null;
    hastaPaneliAc(id);
  } else {
    byId('pin-hata').classList.remove('hidden');
    byId('pin-input').value = '';
  }
}
function pinTusBas(d) {
  const inp = byId('pin-input');
  if (d === 'sil') {
    inp.value = inp.value.slice(0, -1);
  } else if (inp.value.length < 6) {
    inp.value += d;
  }
  byId('pin-hata').classList.add('hidden');
  if (pinHasta && inp.value.length === String(pinHasta.pin).length) {
    pinDogrula();
  }
}

/* ============ HASTA PANELİ ============ */
function hastaPaneliAc(hastaId) {
  aktifHastaId = hastaId;
  kaydet(K.aktif, hastaId);
  aktifHasta = hastalar.find((h) => h.id === hastaId);
  if (!aktifHasta) { gosterEkran('ekran-hastalar'); return; }
  const durum = hastaDurum(hastaId);
  aktifIlaclar = durum.ilaclar;
  aktifAlindi = durum.alindi;
  aktifAyarlar = durum.ayarlar;
  byId('aktif-hasta-ad').textContent = aktifHasta.ad;
  byId('tarih-bilgi').textContent = bugunTurkce();
  gosterEkran('ekran-hasta');
  ilacKartlariniCiz();
  kalanIlacaKaydir();
  alarmKontrolu();
  gunSonuKontrol();
}

function kalanIlacaKaydir() {
  const kartlar = document.querySelectorAll('#ilac-kartlari [data-durum]');
  const hedef = Array.prototype.find.call(kartlar, (k) => {
    const d = k.getAttribute('data-durum');
    return d === 'bekliyor' || d === 'yakin' || d === 'gecikti';
  });
  if (hedef) {
    hedef.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function aktifVerileriTazele() {
  if (!aktifHastaId) return;
  const durum = hastaDurum(aktifHastaId);
  aktifIlaclar = durum.ilaclar;
  aktifAlindi = durum.alindi;
  aktifAyarlar = durum.ayarlar;
}

/* ============ İLAÇ KARTLARI ============ */
function ilacKartlariniCiz() {
  if (aktifEkran !== 'ekran-hasta') return;
  const bugun = bugunKey();
  let dozlar = [];
  aktifIlaclar.forEach((ilac) => {
    (ilac.times || []).forEach((saat) => {
      dozlar.push({ ilac: ilac, saat: saat, key: tarihliAlindiKey(ilac.id, bugun, saat) });
    });
  });
  dozlar.sort((a, b) => a.saat.localeCompare(b.saat));

  const kap = byId('ilac-kartlari');
  kap.innerHTML = '';
  byId('ilac-bos').classList.toggle('hidden', dozlar.length > 0);

  const now = Date.now();
  dozlar.forEach((doz) => {
    const alindiT = aktifAlindi[doz.key];
    const doseT = buguneSaat(doz.saat);
    const onerakMs = (aktifAyarlar.onerakDk || 15) * 60000;
    let durum, etiket, renk, rozet, cizgi;
    if (alindiT) {
      durum = 'alindi';
      etiket = 'Alındı';
      rozet = 'bg-green-100 text-green-700';
      renk = 'border-green-200 bg-green-50';
      cizgi = 'bg-green-500';
    } else if (now < doseT.getTime() - onerakMs) {
      durum = 'bekliyor';
      etiket = 'Bekliyor';
      rozet = 'bg-amber-100 text-amber-700';
      renk = 'border-amber-200 bg-amber-50';
      cizgi = 'bg-amber-500';
    } else if (now <= doseT.getTime() + AKTIF_PENCERE_DK * 60000) {
      durum = now < doseT.getTime() ? 'yakin' : 'gecikti';
      etiket = now < doseT.getTime() ? 'Yaklaşıyor' : 'Gecikti ⏰';
      rozet = 'bg-red-100 text-red-700';
      renk = 'border-red-200 bg-red-50';
      cizgi = 'bg-red-500';
    } else {
      durum = 'gecti';
      etiket = 'Geçti';
      rozet = 'bg-gray-200 text-gray-500';
      renk = 'border-gray-200 bg-gray-50';
      cizgi = 'bg-gray-400';
    }

    const kart = document.createElement('div');
    kart.className = 'flex items-stretch gap-3 rounded-xl border ' + renk + ' p-4 shadow-sm';
    kart.setAttribute('data-durum', durum);
    kart.innerHTML =
      '<div class="w-1.5 shrink-0 rounded-full ' + cizgi + '"></div>' +
      '<div class="min-w-0 flex-1">' +
      '<div class="flex items-start justify-between gap-2">' +
      '<div class="min-w-0">' +
      '<p class="font-semibold leading-tight text-gray-800">' + escapeHtml(doz.ilac.ad) + '</p>' +
      (doz.ilac.doz ? '<p class="text-xs text-gray-500">' + escapeHtml(doz.ilac.doz) + '</p>' : '') +
      '</div>' +
      '<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ' + rozet + '">' + etiket + '</span>' +
      '</div>' +
      '<div class="mt-2 flex items-center justify-between">' +
      '<span class="text-lg font-bold text-gray-700">' + doz.saat + '</span>' +
      (alindiT
        ? '<span class="text-xs font-medium text-green-600">✓ ' + saatBiçim(alindiT) + '</span>'
        : '<button data-alindi="' + doz.key + '" data-ilac-id="' + doz.ilac.id + '" data-saat="' + doz.saat + '" class="btn-alindi rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-95">Alındı ✓</button>') +
      '</div>' +
      (aktifAyarlar.duzenButonlari
        ? '<div class="mt-2 flex items-center justify-end gap-1 border-t border-gray-100 pt-2 text-xs">' +
        '<button data-ilac-duzenle="' + doz.ilac.id + '" type="button" class="rounded-lg px-2.5 py-1.5 font-medium text-gray-500 transition hover:bg-brand-50 hover:text-brand-700">✏️ Düzenle</button>' +
        '<button data-ilac-sil="' + doz.ilac.id + '" type="button" class="rounded-lg px-2.5 py-1.5 font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-600">🗑️ Sil</button>' +
        '</div>'
        : '') +
      '</div>';
    kap.appendChild(kart);
  });
}

/* ============ ALARM MOTORU (15 SN) ============ */
function alarmKontrolu() {
  if (byId('modal-alarm').classList.contains('hidden') === false) return;
  const now = Date.now();
  const bugun = bugunKey();
  hastalar.forEach((hasta) => {
    const durum = hastaDurum(hasta.id);
    const onerakMs = (durum.ayarlar.onerakDk || 15) * 60000;
    durum.ilaclar.forEach((ilac) => {
      (ilac.times || []).forEach((saat) => {
        const key = tarihliAlindiKey(ilac.id, bugun, saat);
        if (durum.alindi[key]) return;
        const t = buguneSaat(saat).getTime();
        if (now < t - onerakMs || now > t + AKTIF_PENCERE_DK * 60000) return;
        if (ertelenenler[key] && ertelenenler[key] > now) return;
        if (alarmKuyrugu.some((e) => e.key === key)) return;
        if (alarmAcikKey === key) return;
        alarmKuyrugu.push({ hastaId: hasta.id, ilac: ilac, saat: saat, key: key });
      });
    });
  });
  alarmSıradakiniGoster();
}

function alarmSıradakiniGoster() {
  if (byId('modal-alarm').classList.contains('hidden') === false) return;
  const giris = alarmKuyrugu.shift();
  if (!giris) return;
  const durum = hastaDurum(giris.hastaId);
  if (!durum.hasta || durum.alindi[giris.key]) {
    alarmSıradakiniGoster();
    return;
  }
  alarmAcikKey = giris.key;
  byId('alarm-hasta').textContent = durum.hasta.ad;
  byId('alarm-ilac-ad').textContent = giris.ilac.ad;
  byId('alarm-doz').textContent = giris.ilac.doz || (giris.ilac.times.length + ' doz');
  byId('alarm-saat').textContent = giris.saat;
  byId('btn-alarm-ertele').textContent = 'Ertele (' + (durum.ayarlar.erteleDk || 5) + ' dk)';
  modalAc('modal-alarm');
  bipCal();
  tarayiciBildirimGoster('İlaç zamanı: ' + giris.ilac.ad, durum.hasta.ad + ' · ' + giris.saat);
}

function alarmAlindiTıkla() {
  if (!alarmAcikKey) return;
  const key = alarmAcikKey;
  alarmAcikKey = null;
  modalKapat('modal-alarm');
  const hedef = bulKuyrukKaynagi(key);
  if (hedef) {
    ilacAlindi(hedef.hastaId, hedef.ilacId, hedef.saat, Date.now());
  }
  alarmSıradakiniGoster();
}
function alarmErteleTıkla() {
  if (!alarmAcikKey) return;
  const key = alarmAcikKey;
  alarmAcikKey = null;
  const hedef = bulKuyrukKaynagi(key);
  if (hedef) {
    const durum = hastaDurum(hedef.hastaId);
    const dk = durum.ayarlar.erteleDk || 5;
    ertelenenler[key] = Date.now() + dk * 60000;
    toast('Erteleme: ' + dk + ' dk sonra tekrar hatırlatılacak');
  }
  modalKapat('modal-alarm');
  alarmSıradakiniGoster();
}
function bulKuyrukKaynagi(key) {
  for (const h of hastalar) {
    const durum = hastaDurum(h.id);
    const bulunan = durum.ilaclar.find((ilac) => durum.alindi[key] === undefined && (ilac.times || []).some((s) => tarihliAlindiKey(ilac.id, bugunKey(), s) === key));
    if (bulunan) {
      const saat = key.split('|')[2];
      return { hastaId: h.id, ilacId: bulunan.id, saat: saat };
    }
  }
  return null;
}

function ilacAlindi(hastaId, ilacId, saat, zamani) {
  const depoKey = hastaAlindiKey(hastaId);
  const alindi = yukle(depoKey, {});
  const key = tarihliAlindiKey(ilacId, bugunKey(), saat);
  alindi[key] = zamani || Date.now();
  kaydet(depoKey, alindi);
  delete ertelenenler[key];
  alarmKuyrugu = alarmKuyrugu.filter((e) => e.key !== key);
  nativeBildirimIptal(key);
  if (aktifHastaId === hastaId) {
    aktifAlindi = alindi;
    ilacKartlariniCiz();
    gunSonuKontrol();
  }
  nativeDozBildirimleriniKur(hastaId);
  firebasePushHasta(hastaId).then((ok) => {
    if (ok) toast('Sunucuya senkronize edildi ✓');
    else toast('Çevrimdışı — değişiklik cihazda tutuluyor');
  });
}

/* ============ SES + TARAYICI BİLDİRİMİ ============ */
let audioCtx = null;
function sesKilidiniAc() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}
function bipCal() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    [880, 660].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.6, t + i * 0.3 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.3 + 0.28);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t + i * 0.3);
      osc.stop(t + i * 0.3 + 0.3);
    });
  } catch (e) {}
}
async function tarayiciBildirimGoster(title, body) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission === 'granted') {
      new Notification(title, { body: body, icon: 'icons/icon-192.png' });
    }
  } catch (e) {}
}

/* ============ GÜN SONU ÖZETİ ============ */
function raporDepoKey(hastaId) { return 'ilac_takip:rapor:' + hastaId; }

function gunSonuRaporuKaydet(hastaId) {
  const bugun = bugunKey();
  const durum = hastaDurum(hastaId);
  const detay = [];
  durum.ilaclar.forEach((ilac) => {
    (ilac.times || []).forEach((saat) => {
      const key = tarihliAlindiKey(ilac.id, bugun, saat);
      const alindiT = durum.alindi[key];
      detay.push({
        ilac: ilac.ad,
        saat: saat,
        alindi: !!alindiT,
        alindiSaat: alindiT ? saatBiçim(alindiT) : null
      });
    });
  });
  detay.sort((a, b) => a.saat.localeCompare(b.saat));
  const planlanan = detay.length;
  const alinan = detay.filter((d) => d.alindi).length;
  const raporlar = yukle(raporDepoKey(hastaId), {});
  raporlar[bugun] = {
    planlanan: planlanan,
    alinan: alinan,
    geciken: planlanan - alinan,
    detay: detay
  };
  const kesim = tarihDeltaKey(-6);
  Object.keys(raporlar).forEach((t) => {
    if (t < kesim) delete raporlar[t];
  });
  kaydet(raporDepoKey(hastaId), raporlar);
}

function gunSonuKontrol() {
  if (!aktifHastaId) return;
  const bugun = bugunKey();
  const durum = hastaDurum(aktifHastaId);
  if (!durum.ilaclar.length) return;
  if (yukle(ozetKey(aktifHastaId), null) === bugun) return;
  const dozlar = [];
  durum.ilaclar.forEach((ilac) => {
    (ilac.times || []).forEach((saat) => {
      dozlar.push({ ilac: ilac, saat: saat, key: tarihliAlindiKey(ilac.id, bugun, saat) });
    });
  });
  const bekleyen = dozlar.filter((d) => !durum.alindi[d.key]);
  if (bekleyen.length) return;
  kaydet(ozetKey(aktifHastaId), bugun);
  gunSonuRaporuKaydet(aktifHastaId);
  const rapor = yukle(raporDepoKey(aktifHastaId), {})[bugun] || { detay: [], planlanan: 0, alinan: 0 };
  const kap = byId('ozet-icerik');
  kap.innerHTML = '';
  rapor.detay.forEach((d) => {
    const satir = document.createElement('div');
    satir.className = 'flex items-center justify-between rounded-xl px-3 py-2 ' + (d.alindi ? 'bg-green-50' : 'bg-red-50');
    satir.innerHTML =
      '<div><p class="text-sm font-semibold text-gray-700">' + escapeHtml(d.ilac) + '</p><p class="text-xs text-gray-400">' + d.saat + '</p></div>' +
      (d.alindi
        ? '<span class="text-sm font-semibold text-green-600">✓ ' + d.alindiSaat + '</span>'
        : '<span class="text-sm font-semibold text-red-500">Geçti</span>');
    kap.appendChild(satir);
  });
  modalAc('modal-ozet');
}

function tarihKeyiTurkce(tarihKey) {
  const gunler = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const p = tarihKey.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return gunler[d.getDay()] + ', ' + d.getDate() + ' ' + aylar[d.getMonth()];
}

function raporlariGoster() {
  if (!aktifHastaId) return;
  const raporlar = yukle(raporDepoKey(aktifHastaId), {});
  const kap = byId('rapor-listesi');
  kap.innerHTML = '';
  const tarihler = Object.keys(raporlar).sort().reverse();
  if (!tarihler.length) {
    kap.innerHTML = '<p class="py-6 text-center text-sm text-gray-400">Henüz rapor yok. Tüm dozlar alındığında gün sonu raporu oluşturulur.</p>';
    modalAc('modal-raporlar');
    return;
  }
  tarihler.forEach((tarih) => {
    const r = raporlar[tarih];
    const satir = document.createElement('div');
    satir.className = 'rounded-xl border border-gray-100 bg-white p-3 shadow-sm';
    satir.innerHTML =
      '<div class="flex items-center justify-between">' +
      '<span class="text-sm font-semibold text-gray-800">' + tarihKeyiTurkce(tarih) + '</span>' +
      '<span class="text-xs font-semibold ' + (r.geciken ? 'text-amber-600' : 'text-green-600') + '">' + r.alinan + '/' + r.planlanan + ' alındı</span>' +
      '</div>' +
      '<div class="mt-2 space-y-1">' +
      r.detay.map((d) =>
        '<div class="flex items-center justify-between text-sm">' +
        '<span class="text-gray-700">' + escapeHtml(d.ilac) + ' · ' + d.saat + '</span>' +
        (d.alindi
          ? '<span class="font-medium text-green-600">✓ ' + d.alindiSaat + '</span>'
          : '<span class="font-medium text-red-500">Geçti</span>') +
        '</div>'
      ).join('') +
      '</div>';
    kap.appendChild(satir);
  });
  modalAc('modal-raporlar');
}

/* ============ HASTA FORM (ekle/düzenle/sil) ============ */
function hastaFormunuAc(hasta) {
  duzenlenenHasta = hasta || null;
  byId('hasta-form-baslik').textContent = hasta ? 'Hastayı Düzenle' : 'Yeni Hasta';
  byId('hasta-form-ad').value = hasta ? hasta.ad : '';
  byId('hasta-form-pin').value = hasta ? (hasta.pin || '') : '';
  byId('hasta-form-pin-hata').classList.add('hidden');
  modalAc('modal-hasta-form');
  setTimeout(() => byId('hasta-form-ad').focus(), 50);
}
function hastaFormKaydet() {
  const ad = byId('hasta-form-ad').value.trim();
  const pin = byId('hasta-form-pin').value.trim();
  if (!ad) { toast('Hasta adı gerekli'); return; }
  if (pin && !/^\d{4,6}$/.test(pin)) {
    byId('hasta-form-pin-hata').classList.remove('hidden');
    return;
  }
  byId('hasta-form-pin-hata').classList.add('hidden');
  let kaydedilenId = null;
  if (duzenlenenHasta) {
    const h = hastalar.find((x) => x.id === duzenlenenHasta.id);
    if (h) { h.ad = ad; h.pin = pin || ''; }
    kaydedilenId = duzenlenenHasta.id;
  } else {
    kaydedilenId = uid();
    hastalar.push({ id: kaydedilenId, ad: ad, pin: pin || '' });
  }
  kaydet(K.hastalar, hastalar);
  modalKapat('modal-hasta-form');
  duzenlenenHasta = null;
  hastaListesiniCiz();
  firebasePushHasta(kaydedilenId);
  firebaseRegistryPush();
}
function hastaSil(hastaId) {
  const idx = hastalar.findIndex((h) => h.id === hastaId);
  if (idx === -1) return;
  const silinenMedler = yukle(hastaIlacKey(hastaId), []);
  hastalar.splice(idx, 1);
  kaydet(K.hastalar, hastalar);
  localStorage.removeItem(hastaIlacKey(hastaId));
  localStorage.removeItem(hastaAlindiKey(hastaId));
  localStorage.removeItem(hastaAyarKey(hastaId));
  localStorage.removeItem(ozetKey(hastaId));
  nativeBildirimleriIptalEt(silinenMedler.map((m) => m.id));
  if (aktifHastaId === hastaId) {
    aktifHastaId = null;
    aktifHasta = null;
    aktifIlaclar = [];
    aktifAlindi = {};
    aktifAyarlar = { onerakDk: 15, erteleDk: 5, duzenButonlari: false };
  }
  firebasePut('/patients/' + hastaId, null);
  firebaseRegistryPush();
  hastaListesiniCiz();
}

/* ============ İLAÇ FORM ============ */
function ilacFormunuAc(ilac) {
  duzenlenenIlac = ilac || null;
  byId('ilac-form-baslik').textContent = ilac ? 'İlaç Düzenle' : 'İlaç Ekle';
  byId('ilac-form-ad').value = ilac ? ilac.ad : '';
  byId('ilac-form-doz').value = ilac ? (ilac.doz || '') : '';
  ilacFormSaatler = ilac && ilac.times && ilac.times.length ? ilac.times.slice() : [SAAT_ONERILERI[0]];
  saatListesiCiz();
  modalAc('modal-ilac-form');
  setTimeout(() => byId('ilac-form-ad').focus(), 50);
}
function saatListesiCiz() {
  const kap = byId('saat-listesi');
  kap.innerHTML = '';
  ilacFormSaatler.forEach((saat, i) => {
    const satir = document.createElement('div');
    satir.className = 'saat-satiri flex items-center gap-2';
    satir.innerHTML =
      '<input type="time" value="' + saat + '" class="saat-input w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-lg outline-none transition focus:border-brand-500" />' +
      '<button type="button" class="btn-saat-sil rounded-lg bg-red-50 px-3 py-2.5 text-red-500 transition hover:bg-red-100">✕</button>';
    satir.querySelector('.saat-input').addEventListener('change', (e) => { ilacFormSaatler[i] = e.target.value; });
    satir.querySelector('.btn-saat-sil').addEventListener('click', () => { ilacFormSaatler.splice(i, 1); saatListesiCiz(); });
    kap.appendChild(satir);
  });
  byId('btn-saat-ekle').disabled = ilacFormSaatler.length >= 8;
}
function saatEkle() {
  if (ilacFormSaatler.length >= 8) return;
  const kullanilan = new Set(ilacFormSaatler);
  const oneri = SAAT_ONERILERI.find((s) => !kullanilan.has(s)) || '09:00';
  ilacFormSaatler.push(oneri);
  saatListesiCiz();
}
function ilacFormKaydet() {
  const ad = byId('ilac-form-ad').value.trim();
  const doz = byId('ilac-form-doz').value.trim();
  if (!ad) { toast('İlaç adı gerekli'); return; }
  const times = Array.from(new Set(ilacFormSaatler.filter(Boolean))).sort();
  if (!times.length) { toast('En az bir doz saati gerekli'); return; }
  const now = Date.now();
  if (duzenlenenIlac) {
    const ilac = aktifIlaclar.find((m) => m.id === duzenlenenIlac.id);
    if (ilac) {
      ilac.ad = ad;
      ilac.doz = doz;
      ilac.times = times;
      ilac.updatedAt = now;
    }
  } else {
    aktifIlaclar.push({ id: uid(), ad: ad, doz: doz, times: times, updatedAt: now });
  }
  kaydet(hastaIlacKey(aktifHastaId), aktifIlaclar);
  modalKapat('modal-ilac-form');
  duzenlenenIlac = null;
  ilacKartlariniCiz();
  nativeDozBildirimleriniKur(aktifHastaId);
  firebasePushHasta(aktifHastaId).then((ok) => {
    if (ok) toast('Değişiklikler sunucuya kaydedildi ✓');
    else toast('Çevrimdışı — değişiklik cihazda tutuluyor');
  });
}
function ilacSil(ilacId) {
  aktifIlaclar = aktifIlaclar.filter((m) => m.id !== ilacId);
  kaydet(hastaIlacKey(aktifHastaId), aktifIlaclar);
  const alindi = {};
  Object.keys(aktifAlindi).forEach((k) => { if (!k.startsWith(ilacId + '|')) alindi[k] = aktifAlindi[k]; });
  aktifAlindi = alindi;
  kaydet(hastaAlindiKey(aktifHastaId), alindi);
  alarmKuyrugu = alarmKuyrugu.filter((e) => e.ilac.id !== ilacId);
  nativeDozBildirimleriniKur(aktifHastaId);
  ilacKartlariniCiz();
  firebasePushHasta(aktifHastaId).then((ok) => {
    if (ok) toast('Değişiklikler sunucuya kaydedildi ✓');
  });
}

/* ============ AYARLAR ============ */
function ayarlarPaneliniAc() {
  byId('onerak-range').value = aktifAyarlar.onerakDk;
  byId('ertele-select').value = String(aktifAyarlar.erteleDk);
  byId('onerak-deger').textContent = aktifAyarlar.onerakDk + ' dk';
  byId('duzen-toggle').checked = !!aktifAyarlar.duzenButonlari;
  modalAc('modal-ayarlar');
}
function ayarlariKaydet() {
  aktifAyarlar.onerakDk = Number(byId('onerak-range').value);
  aktifAyarlar.erteleDk = Number(byId('ertele-select').value);
  aktifAyarlar.duzenButonlari = byId('duzen-toggle').checked;
  kaydet(hastaAyarKey(aktifHastaId), aktifAyarlar);
  byId('onerak-deger').textContent = aktifAyarlar.onerakDk + ' dk';
  modalKapat('modal-ayarlar');
  toast('Ayarlar kaydedildi');
  ilacKartlariniCiz();
}

/* ============ ONAY MODALI ============ */
function onaySor(baslik, mesaj, cb) {
  byId('onay-baslik').textContent = baslik;
  byId('onay-mesaj').textContent = mesaj;
  onayCallback = cb;
  modalAc('modal-onay');
}
function onayEvvet() {
  modalKapat('modal-onay');
  const cb = onayCallback;
  onayCallback = null;
  if (cb) cb();
}

/* ============ NATIVE BİLDİRİMLER ============ */
async function nativeBildirimIptal(key) {
  if (!isNative) return;
  try {
    const notiMap = yukle(K.noti, {});
    const ids = [];
    Object.keys(notiMap).forEach((id) => { if (notiMap[id] === key) ids.push(Number(id)); });
    if (ids.length) {
      await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id: id })) });
    }
    ids.forEach((id) => delete notiMap[id]);
    kaydet(K.noti, notiMap);
  } catch (e) { console.warn('Native bildirim iptal hatası', e); }
}
async function nativeBildirimleriIptalEt(medIds) {
  if (!isNative || !medIds.length) return;
  try {
    const notiMap = yukle(K.noti, {});
    const silinecek = [];
    Object.keys(notiMap).forEach((id) => {
      const ilacId = notiMap[id].split('|')[0];
      if (medIds.includes(ilacId)) {
        silinecek.push(Number(id));
        delete notiMap[id];
      }
    });
    if (silinecek.length) {
      await LocalNotifications.cancel({ notifications: silinecek.map((id) => ({ id: id })) });
    }
    kaydet(K.noti, notiMap);
  } catch (e) { console.warn('Native bildirim temizleme hatası', e); }
}
async function nativeDozBildirimleriniKur(hastaId) {
  if (!isNative) return;
  try {
    const perms = await LocalNotifications.checkPermissions();
    if (perms.display !== 'granted') return;
    const notiMap = yukle(K.noti, {});
    const hedefler = hastaId ? hastalar.filter((h) => h.id === hastaId) : hastalar;
    const plan = [];
    const planAnahtarlari = new Set();
    hedefler.forEach((hasta) => {
      const durum = hastaDurum(hasta.id);
      for (let gun = 0; gun < 2; gun++) {
        const tarih = tarihDeltaKey(gun);
        durum.ilaclar.forEach((ilac) => {
          (ilac.times || []).forEach((saat) => {
            const key = tarihliAlindiKey(ilac.id, tarih, saat);
            if (durum.alindi[key]) {
              nativeBildirimIptal(key);
              return;
            }
            const t = tariheSaat(tarih, saat).getTime();
            const onerakMs = (durum.ayarlar.onerakDk || 15) * 60000;
            const zaman = t - onerakMs;
            if (zaman <= Date.now()) return;
            const id = keyHash(key);
            notiMap[id] = key;
            planAnahtarlari.add(key);
            plan.push({
              id: id,
              title: 'İlaç zamanı: ' + ilac.ad,
              body: hasta.ad + ' · ' + saat + (ilac.doz ? ' · ' + ilac.doz : ''),
              schedule: { at: new Date(zaman) },
              actionTypeId: 'alindi',
              extra: { hastaId: hasta.id, ilacId: ilac.id, saat: saat, key: key }
            });
          });
        });
      }
    });
    const silinecek = [];
    Object.keys(notiMap).forEach((id) => {
      if (!planAnahtarlari.has(notiMap[id])) {
        silinecek.push(Number(id));
        delete notiMap[id];
      }
    });
    if (silinecek.length) {
      await LocalNotifications.cancel({ notifications: silinecek.map((id) => ({ id: id })) });
    }
    kaydet(K.noti, notiMap);
    if (plan.length) {
      await LocalNotifications.schedule({ notifications: plan });
    }
  } catch (e) { console.warn('Native bildirim kurma hatası', e); }
}

/* ============ NATIVE İZİNLER ============ */
async function nativeIzinleriAyarla() {
  if (!isNative) return;
  try {
    await LocalNotifications.registerActionTypes({
      types: [{ id: 'alindi', actions: [{ id: 'alindi', title: 'Alındı ✓' }] }]
    });
    const perms = await LocalNotifications.requestPermissions();
    if (perms.display !== 'granted') console.warn('Bildirim izni verilmedi');
    try {
      const sonuc = await ExactAlarm.canScheduleExactAlarms();
      if (!sonuc.value && !yukle(K.exactAsked, false)) {
        kaydet(K.exactAsked, true);
        await ExactAlarm.requestScheduleExactAlarm();
      }
    } catch (e) { console.warn('Tam zamanlı alarm izni alınamadı', e); }
    try {
      if (!yukle(K.batteryAsked, false)) {
        kaydet(K.batteryAsked, true);
        await ExactAlarm.requestIgnoreBatteryOptimizations();
      }
    } catch (e) { console.warn('Pil optimizasyonu muafiyeti istenemedi', e); }
    await nativeDozBildirimleriniKur();
  } catch (e) { console.warn('Native izinler hatası', e); }
}

/* ============ FIREBASE ============ */
async function firebaseGet(path, timeoutMs) {
  if (!navigator.onLine) return null;
  const ms = timeoutMs || 6000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(DB_URL + path + '.json?auth=' + API_KEY, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Firebase timeout/hata:', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
async function firebasePut(path, data, timeoutMs) {
  if (!navigator.onLine) return false;
  const ms = timeoutMs || 6000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(DB_URL + path + '.json?auth=' + API_KEY, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: data === null ? null : JSON.stringify(data),
      signal: controller.signal
    });
    return res.ok;
  } catch (e) {
    console.warn('Firebase yazma hatası:', e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
async function firebasePushHasta(hastaId) {
  const hasta = hastalar.find((h) => h.id === hastaId);
  if (!hasta) return false;
  const durum = hastaDurum(hastaId);
  return await firebasePut('/patients/' + hastaId, { ad: hasta.ad, pin: hasta.pin || '', meds: durum.ilaclar, done: durum.alindi });
}
function firebaseRegistryPush() {
  firebasePut('/patients/__registry__', { ids: hastalar.map((h) => h.id) });
}
function medListesiniBirlestir(local, cloud) {
  const map = new Map();
  local.forEach((m) => map.set(m.id, m));
  cloud.forEach((m) => { if (m && m.id) map.set(m.id, m); });
  return Array.from(map.values());
}
function bulguyuBirlestir(hastaId, veri) {
  if (!veri || !veri.ad) return false;
  const mevcut = hastalar.find((h) => h.id === hastaId);
  if (mevcut) {
    Object.assign(mevcut, { ad: veri.ad, pin: veri.pin || '' });
  } else {
    hastalar.push({ id: hastaId, ad: veri.ad, pin: veri.pin || '' });
  }
  if (Array.isArray(veri.meds) && veri.meds.length) {
    kaydet(hastaIlacKey(hastaId), medListesiniBirlestir(yukle(hastaIlacKey(hastaId), []), veri.meds));
  }
  if (veri.done && typeof veri.done === 'object') {
    kaydet(hastaAlindiKey(hastaId), Object.assign({}, yukle(hastaAlindiKey(hastaId), {}), veri.done));
  }
  return true;
}
async function senkronizeEt() {
  let guncellendi = false;
  const islenecek = new Set();
  let tam = null;

  const tamDeneme = await firebaseGet('/patients');
  if (tamDeneme && typeof tamDeneme === 'object' && Object.keys(tamDeneme).length) {
    tam = tamDeneme;
    Object.keys(tam).forEach((id) => {
      if (id !== '__registry__' && tam[id] && tam[id].ad) islenecek.add(id);
    });
  }

  if (!islenecek.size) {
    const registry = await firebaseGet('/patients/__registry__');
    if (registry && Array.isArray(registry.ids) && registry.ids.length) {
      registry.ids.forEach((id) => islenecek.add(id));
    }
  }

  hastalar.forEach((h) => islenecek.add(h.id));

  for (const id of islenecek) {
    let veri = tam && tam[id];
    if (!veri) veri = await firebaseGet('/patients/' + id);
    if (bulguyuBirlestir(id, veri)) guncellendi = true;
  }

  if (guncellendi) {
    kaydet(K.hastalar, hastalar);
    firebaseRegistryPush();
    hastaListesiniCiz();
    if (aktifHastaId) {
      aktifVerileriTazele();
      ilacKartlariniCiz();
    }
  }
  toast('Veriler senkronize edildi');
}

/* ============ GERİ TUŞU (NATIVE) ============ */
function nativeGeriTusunuKur() {
  if (!isNative) return;
  try {
    App.addListener('backButton', () => {
      if (modalAcikMı()) {
        tümModallariKapat();
        return;
      }
      if (aktifEkran === 'ekran-pin') {
        gosterEkran('ekran-hastalar');
        return;
      }
      if (aktifEkran === 'ekran-hasta') {
        gosterEkran('ekran-hastalar');
        return;
      }
      App.exitApp();
    });
    App.addListener('appStateChange', (durum) => {
      if (durum.isActive) {
        aktifVerileriTazele();
        ilacKartlariniCiz();
        alarmKontrolu();
        nativeDozBildirimleriniKur();
      }
    });
  } catch (e) {
    console.warn('Native geri tuşu kurulamadı', e);
  }
}

/* ============ OLAYLAR ============ */
function olaylariBagla() {
  byId('btn-hasta-ekle').addEventListener('click', () => hastaFormunuAc(null));
  byId('btn-hasta-form-kaydet').addEventListener('click', hastaFormKaydet);
  byId('btn-hasta-geri').addEventListener('click', () => gosterEkran('ekran-hastalar'));
  byId('btn-pin-geri').addEventListener('click', () => gosterEkran('ekran-hastalar'));
  byId('btn-ilac-ekle').addEventListener('click', () => ilacFormunuAc(null));
  byId('btn-ilac-form-kaydet').addEventListener('click', ilacFormKaydet);
  byId('btn-saat-ekle').addEventListener('click', saatEkle);
  byId('btn-ayarlar').addEventListener('click', ayarlarPaneliniAc);
  byId('btn-raporlar').addEventListener('click', raporlariGoster);
  byId('btn-ayar-kaydet').addEventListener('click', ayarlariKaydet);
  byId('btn-senkronize').addEventListener('click', () => { senkronizeEt().catch(() => toast('Senkronizasyon başarısız')); });
  byId('btn-alarm-alindi').addEventListener('click', alarmAlindiTıkla);
  byId('btn-alarm-ertele').addEventListener('click', alarmErteleTıkla);
  byId('btn-ozet-kapat').addEventListener('click', () => modalKapat('modal-ozet'));
  byId('btn-onay-iptal').addEventListener('click', () => { modalKapat('modal-onay'); onayCallback = null; });
  byId('btn-onay-evvet').addEventListener('click', onayEvvet);
  byId('onerak-range').addEventListener('input', () => { byId('onerak-deger').textContent = byId('onerak-range').value + ' dk'; });

  document.querySelectorAll('.modal-kapat').forEach((b) => b.addEventListener('click', () => {
    const modal = b.closest('.modal');
    if (modal) modalKapat(modal.id);
  }));

  document.querySelectorAll('.pin-tus').forEach((b) => b.addEventListener('click', () => pinTusBas(b.textContent.trim())));
  document.querySelector('.pin-tus-sil').addEventListener('click', () => pinTusBas('sil'));
  byId('pin-input').addEventListener('input', () => {
    byId('pin-hata').classList.add('hidden');
    if (pinHasta && byId('pin-input').value.length === String(pinHasta.pin).length) pinDogrula();
  });

  byId('ilac-kartlari').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-alindi');
    if (!btn) return;
    ilacAlindi(aktifHastaId, btn.dataset.ilacId, btn.dataset.saat, Date.now());
  });

  document.addEventListener('click', (e) => {
    const hastaDuzenle = e.target.closest('[data-hasta-duzenle]');
    const hastaSilBtn = e.target.closest('[data-hasta-sil]');
    const ilacDuzenle = e.target.closest('[data-ilac-duzenle]');
    const ilacSilBtn = e.target.closest('[data-ilac-sil]');
    if (hastaDuzenle) {
      const h = hastalar.find((x) => x.id === hastaDuzenle.dataset.hastaDuzenle);
      if (h) hastaFormunuAc(h);
    } else if (hastaSilBtn) {
      const h = hastalar.find((x) => x.id === hastaSilBtn.dataset.hastaSil);
      if (h) onaySor('Hastayı Sil', h.ad + ' hastası ve tüm verileri silinecek. Bu işlem geri alınamaz.', () => hastaSil(h.id));
    } else if (ilacDuzenle) {
      const ilac = aktifIlaclar.find((m) => m.id === ilacDuzenle.dataset.ilacDuzenle);
      if (ilac) ilacFormunuAc(ilac);
    } else if (ilacSilBtn) {
      const ilac = aktifIlaclar.find((m) => m.id === ilacSilBtn.dataset.ilacSil);
      if (ilac) onaySor('İlaç Sil', ilac.ad + ' ilacı silinecek.', () => ilacSil(ilac.id));
    }
  });

  document.addEventListener('pointerdown', sesKilidiniAc);
  document.addEventListener('keydown', sesKilidiniAc);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') tümModallariKapat();
  });

  if (isNative) {
    try {
      LocalNotifications.addListener('localNotificationActionPerformed', (evt) => {
        const not = evt.notification;
        if (evt.actionId === 'alindi' && not && not.extra) {
          ilacAlindi(not.extra.hastaId, not.extra.ilacId, not.extra.saat, Date.now());
        }
      });
    } catch (e) { console.warn('Bildirim aksiyon dinleyicisi kurulamadı', e); }
  }
}

/* ============ AÇILIŞ ============ */
function serviceWorkerKaydet() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker kaydedilemedi', e));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  hastaListesiniCiz();
  gosterEkran('ekran-hastalar');
  olaylariBagla();
  nativeGeriTusunuKur();
  serviceWorkerKaydet();

  if (navigator.onLine) {
    senkronizeEt().catch((e) => console.warn('Senkron başarısız, yerel veri kullanılıyor', e));
  } else {
    console.warn('Çevrimdışı mod: yerel veri kullanılıyor');
  }

  setInterval(() => {
    if (sonTarihKey !== bugunKey()) {
      sonTarihKey = bugunKey();
      aktifVerileriTazele();
      ilacKartlariniCiz();
      if (isNative) nativeDozBildirimleriniKur();
    }
    alarmKontrolu();
  }, 15000);

  if (isNative) {
    nativeIzinleriAyarla();
  } else if ('Notification' in window && Notification.permission === 'default') {
    document.addEventListener('pointerdown', function once() {
      Notification.requestPermission().catch(() => {});
      document.removeEventListener('pointerdown', once);
    });
  }
});
