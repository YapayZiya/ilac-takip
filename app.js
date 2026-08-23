/* ===========================================================
   İLAÇ TAKİP SİSTEMİ — app.js
   ----------------------------------------------------------
   Offline-First: Firebase'den veya LocalStorage'dan veri çeker
   =========================================================== */

// Firebase configuration - hardcoded
const DB_URL = "https://ilac-takip-da59e-default-rtdb.europe-west1.firebasedatabase.app";
const API_KEY = "AIzaSyCvwNDuE0QFD6K4OcUhJ-688_-MD9k0Jc8";

// Capacitor is only available in Capacitor runtime, not in PWA
let isNative = false;
try {
  // Check for Capacitor via global or window
  const capGlob = typeof window !== 'undefined' ? window.Capacitor : null;
  if (capGlob && typeof capGlob.isNativePlatform === 'function') {
    isNative = capGlob.isNativePlatform();
  }
} catch { isNative = false; }

(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const AYLAR  = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  const pad = (n) => String(n).padStart(2, '0');
  const saatDM = (dt) => `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => dateStr(new Date());
  const parseTime = (t) => { const [h, m] = t.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => (String(s) || 'ilac').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ilac';
  function bugunTarihTR(d = new Date()) { return `${GUNLER[d.getDay()]}, ${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()}`; }

  const AVATAR = ['bg-teal-600', 'bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-600', 'bg-fuchsia-600', 'bg-sky-500', 'bg-slate-600'];
  const avatarRenk = (ad) => { let s = 0; for (const c of (ad || '?')) s += c.charCodeAt(0); return AVATAR[s % AVATAR.length]; };
  const harf = (ad) => (ad || '?').trim().charAt(0).toLocaleUpperCase('tr');
  const genId = () => `med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const genHastaId = () => `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  // --------------------------------------------------
  // LocalStorage keys
  // --------------------------------------------------
  const K_LIST  = 'ilac_takip:hastalar';
  const K_AKTIF = 'ilac_takip:aktif';
  const K_DEFAULT = { onerakDk: 15, erteleDk: 5 };
  const SON_PENCERE_DK = 120;
  const ADIM_S = 15000;

  function readJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return (v === null || v === undefined) ? fallback : v; }
    catch { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { console.warn('Yazım başarısız:', e); }
  }
  const medKey  = (pid) => `ilac_takip:ilac:${pid}`;
  const doneKey = (pid) => `ilac_takip:alindi:${pid}`;
  const setKey  = (pid) => `ilac_takip:ayar:${pid}`;

  function getHastalar() { const l = readJSON(K_LIST, []); return Array.isArray(l) ? l : []; }
  function saveHastalar(l) { writeJSON(K_LIST, l); }
  function getAktifId() { try { return localStorage.getItem(K_AKTIF); } catch { return null; } }
  function setAktifId(id) { try { id ? localStorage.setItem(K_AKTIF, id) : localStorage.removeItem(K_AKTIF); } catch {} }

  function getAyar() { if (!aktifPid) return { ...K_DEFAULT }; return Object.assign({}, K_DEFAULT, readJSON(setKey(aktifPid), {})); }
  function saveAyar(pid, a) { if (!pid) return; writeJSON(setKey(pid), a); }

  function getMeds() { if (!aktifPid) return []; const m = readJSON(medKey(aktifPid), []); return Array.isArray(m) ? m : []; }
  function setMeds(a) { if (!aktifPid) return; writeJSON(medKey(aktifPid), a); }
  function getDone() { if (!aktifPid) return {}; const d = readJSON(doneKey(aktifPid), {}); return (d && typeof d === 'object') ? d : {}; }
  function setDone(d) { if (!aktifPid) return; writeJSON(doneKey(aktifPid), d); }

  let aktifPid = null;
  let aktifHasta = null;

  // --------------------------------------------------
  // Firebase sync functions
  // --------------------------------------------------
  async function fetchFromFirebase(path) {
    if (!navigator.onLine) return null;
    try {
      const url = `${DB_URL}${path}.json?auth=${API_KEY}`;
      console.log('Fetching:', url);
      const res = await fetch(url, { method: 'GET', mode: 'cors' });
      console.log('Response:', res.status, res.ok);
      if (!res.ok) {
        console.warn('Firebase response not ok:', res.status);
        return null;
      }
      const data = await res.json();
      return data;
    } catch (e) {
      console.error('Firebase fetch hatası:', e);
      return null;
    }
  }

  async function pushToFirebase(path, data) {
    if (!navigator.onLine) return false;
    try {
      const url = `${DB_URL}${path}.json?auth=${API_KEY}`;
      await fetch(url, { method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
      return true;
    } catch (e) {
      console.warn('Firebase push hatası:', e);
      return false;
    }
  }

  async function loadHastalarFromFirebase() {
    const data = await fetchFromFirebase('/patients');
    if (data) {
      const hastalar = Object.entries(data).map(([id, p]) => ({ id, ...p }));
      saveHastalar(hastalar);
      return hastalar;
    }
    return getHastalar();
  }

  async function loadMedsAndDoneFromFirebase(pid) {
    const [medsData, doneData] = await Promise.all([
      fetchFromFirebase(`/patients/${pid}/meds`),
      fetchFromFirebase(`/patients/${pid}/done`)
    ]);
    if (medsData) writeJSON(medKey(pid), medsData);
    if (doneData) writeJSON(doneKey(pid), doneData);
  }

  async function syncAllToFirebase() {
    const hastalar = getHastalar();
    for (const h of hastalar) {
      const meds = readJSON(medKey(h.id), []);
      const done = readJSON(doneKey(h.id), {});
      await Promise.all([
        pushToFirebase(`/patients/${h.id}/meds`, meds),
        pushToFirebase(`/patients/${h.id}/done`, done)
      ]);
    }
  }

  // --------------------------------------------------
  // Toasts
  // --------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg; el.classList.remove('opacity-0');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('opacity-0'), 2400);
  }

  // --------------------------------------------------
  // CRUD (aktif hasta)
  // --------------------------------------------------
  function ilacKaydet(v) { const m = getMeds(); m.push({ id: genId(), ad: v.ad, doz: v.doz, times: v.times, updatedAt: Date.now() }); setMeds(m); pushToFirebase(`/patients/${aktifPid}/meds`, getMeds()); }
  function ilacGuncelle(id, v) { const m = getMeds(); const x = m.find((o) => o.id === id); if (x) { x.ad = v.ad; x.doz = v.doz; x.times = v.times; x.updatedAt = Date.now(); } setMeds(m); pushToFirebase(`/patients/${aktifPid}/meds`, getMeds()); }
  function ilacSil(id) {
    setMeds(getMeds().filter((m) => m.id !== id));
    const d = getDone(); Object.keys(d).forEach((k) => { if (k.split('|')[0] === id) delete d[k]; }); setDone(d);
    pushToFirebase(`/patients/${aktifPid}/meds`, getMeds());
  }
  function ilacAlindi(id, time, pid) {
    const pidUse = pid || aktifPid; if (!pidUse) return;
    const d = readJSON(doneKey(pidUse), {});
    d[`${id}|${todayStr()}|${time}`] = Date.now(); pruneDone(d); writeJSON(doneKey(pidUse), d);
    pushToFirebase(`/patients/${pidUse}/done`, d);
  }
  function pruneDone(d) { const cut = Date.now() - 14 * 86400000; Object.keys(d).forEach((k) => { if (d[k] < cut) delete d[k]; }); }

  // --------------------------------------------------
  // Native notifications
  // --------------------------------------------------
  const NOTI_KEY = 'ilac_takip:noti';
  let nativeAktif = false;
  let exactAlarmToastShown = false;

  async function setupNative() {
    if (!isNative) return;
    try {
      LocalNotifications.addListener('localNotificationsActionPerformed', onNotiAction);
      let perm = await LocalNotifications.checkPermissions();
      if (!perm || perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
      nativeAktif = !!(perm && perm.display === 'granted');
      if (nativeAktif) {
        await LocalNotifications.createChannel({
          id: 'med-reminders', name: 'İlaç Hatırlatıcıları',
          description: 'İlaç zamanı geldiğinde çalacak alarm.',
          importance: 5, visibility: 'public', sound: 'default', vibration: true,
        }).catch(() => {});
        await tamBildirimIzniKontrol();
        await exactAlarmKazandir();
        await pilOptimizasyonKontrol();
        App.addListener('resume', onAppResume);
        App.addListener('backButton', onBackButton);
      }
    } catch (e) { nativeAktif = false; }
  }

  function onBackButton() {
    const ayarPanel = $('#panel-ayar');
    if (ayarPanel && !ayarPanel.classList.contains('hidden')) ayarKapa();
    else if (!$('#modal-summary').classList.contains('hidden')) { $('#modal-summary').classList.add('hidden'); $('#modal-summary').classList.remove('flex'); }
    else if (!$('#modal-alarm').classList.contains('hidden')) modalGizle();
  }

  async function pilOptimizasyonKontrol() {
    if (!isNative || !nativeAktif) return;
    try {
      const res = await ExactAlarm.requestIgnoreBatteryOptimizations();
      if (res && res.opened) toast('Pil optimizasyonunu kapatmak için ayarlardan "İzin ver" deyin.');
    } catch (e) {}
  }

  function notiIdForKey(k) {
    let h = 0;
    for (const c of k) h = (h * 31 + c.charCodeAt(0)) | 0;
    return Math.abs(h % 2000000000);
  }

  function findPidByMed(medId) {
    for (const h of getHastalar()) {
      const arr = readJSON(medKey(h.id), []);
      if (Array.isArray(arr) && arr.some((m) => m.id === medId)) return h.id;
    }
    return null;
  }

  async function onNotiAction(e) {
    const n = e && e.notification;
    if (!n || e.actionId !== 'taken') return;
    const map = readJSON(NOTI_KEY, {});
    const key = map[n.id];
    if (!key) return;
    const parts = key.split('|');
    const medId = parts[0], time = parts[2];
    const ownsActive = aktifPid && readJSON(medKey(aktifPid), []).some((m) => m.id === medId);
    const pid = ownsActive ? aktifPid : findPidByMed(medId);
    if (pid) ilacAlindi(medId, time, pid);
    try { await LocalNotifications.cancel({ notifications: [{ id: n.id }] }); } catch {}
    delete map[n.id]; writeJSON(NOTI_KEY, map);
    if (pid === aktifPid) { listeyiCiz(); notiPlanla(); }
    toast('Alındı olarak işaretlendi.');
  }

  async function tamBildirimIzniKontrol() {
    if (!isNative || !nativeAktif) return;
    let r;
    try { r = await ExactAlarm.canSchedule(); } catch { return; }
    if (r && r.needsNotifyPermission) {
      toast('⚠ Bildirim izni gerekli.');
      try { await ExactAlarm.requestNotifyPermission(); } catch (e) {}
    }
  }

  async function exactAlarmKazandir() {
    if (!isNative || !nativeAktif) return;
    let r;
    try { r = await ExactAlarm.canSchedule(); } catch (e) { return; }
    if (r && r.canSchedule) return;
    toast('⚠ Tam Zamanlı Alarm izni gerekli.');
    try { await ExactAlarm.request(); } catch (e) {}
  }

  async function onAppResume() {
    if (!isNative || !nativeAktif) return;
    let r;
    try { r = await ExactAlarm.canSchedule(); } catch { return; }
    if (r && r.canSchedule && aktifPid) await notiPlanla();
  }

  async function notiPlanla() {
    if (!(isNative && nativeAktif)) return;
    try {
      const prev = readJSON(NOTI_KEY, {});
      const prevIds = Object.keys(prev).map(Number).filter((id) => !Number.isNaN(id));
      if (prevIds.length) { try { await LocalNotifications.cancel({ notifications: prevIds.map((id) => ({ id })) }); } catch (e) {} }
      const meds = getMeds();
      const ayar = getAyar();
      const done = getDone();
      const list = [];
      const map = {};
      for (const m of meds) {
        if (!Array.isArray(m.times) || !m.times.length) continue;
        for (const time of m.times) {
          const raw = String(time).trim();
          if (!raw) continue;
          const t0 = parseTime(raw);
          const todayTaken = !!done[`${m.id}|${todayStr()}|${raw}`];
          const hedef = (todayTaken || t0.getTime() <= Date.now()) ? new Date(t0.getTime() + 86400000) : t0;
          let hedefZaman = hedef.getTime() - ayar.onerakDk * 60000;
          if (hedefZaman < Date.now()) hedefZaman = Date.now();
          const key = `${m.id}|${dateStr(hedef)}|${raw}`;
          const yeniId = Math.abs(Math.floor(hedefZaman / 1000) + (notiIdForKey(key) % 100000));
          map[yeniId] = key;
          list.push({
            id: yeniId, title: m.ad, body: `${raw} · ${m.doz || 'doz'}`,
            smallIcon: 'ic_stat_notify', color: '#0d9488', channelId: 'med-reminders',
            importance: 5, priority: 4, visibility: 'public',
            vibrationPattern: [0, 300, 200, 300, 200, 300], allowWhileIdle: true,
            schedule: { at: new Date(hedefZaman).toISOString() },
            actions: [{ id: 'taken', type: 'button', title: 'Alındı ✓' }],
          });
        }
      }
      if (!list.length) { writeJSON(NOTI_KEY, {}); return; }
      const fresh = new Set(Object.keys(map));
      Object.keys(prev).forEach((k) => { if (!fresh.has(String(k))) delete prev[k]; });
      Object.assign(prev, map);
      writeJSON(NOTI_KEY, prev);
      await LocalNotifications.schedule({ notifications: list });
    } catch (e) { console.error('Alarm planlanamadı:', e); }
  }

  // --------------------------------------------------
  // Alarm & Time control
  // --------------------------------------------------
  const alerted = new Set();
  const deferred = new Map();
  let queue = [];
  let audioCtx = null;

  const slotKey = (id, time) => `${id}|${todayStr()}|${time}`;

  function getAudioCtx() {
    if (!('AudioContext' in window)) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function bipSesi() {
    const ctx = getAudioCtx(); if (!ctx) return;
    const t0 = ctx.currentTime;
    const beep = (start, freq, dur) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
      o.start(t0 + start);
      g.gain.setValueAtTime(0.0001, t0 + start);
      g.gain.exponentialRampToValueAtTime(0.28, t0 + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      o.stop(t0 + start + dur + 0.02);
    };
    beep(0, 880, 0.18); beep(0.28, 1175, 0.24);
  }
  function bildirimGonder(med) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(med ? `İlaç Zamanı · ${med.ad}` : 'İlaç Takip', {
        body: med ? `${med.doz || 'doz'} — şimdi alınmalı` : 'Bildirimler çalışıyor.',
        icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'ilac-takip',
      });
    } catch (e) {}
  }
  async function izinIste() {
    if (isNative) {
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          const newPerm = await LocalNotifications.requestPermissions();
          toast(newPerm.display === 'granted' ? 'Bildirim izni verildi.' : 'Bildirim izni reddedildi.');
        } else { toast('Bildirim izni zaten verilmiş.'); }
      } catch (e) { toast('Bildirim izni istenemedi.'); }
      return;
    }
    if (!('Notification' in window)) { toast('Tarayıcınız bildirimi desteklemiyor.'); return; }
    let p = Notification.permission;
    if (p === 'default') { try { p = await Notification.requestPermission(); } catch { p = Notification.permission; } }
    if (p === 'granted') { toast('Bildirimler açık.'); bildirimGonder(null); }
    else if (p === 'denied') toast('Bildirimler kapalı.');
    else toast('Bildirimi açmak için onay verin.');
  }

  function modalGoster(item) {
    currentDue = item;
    $('#alarm-title').textContent = `${item.time} · ${item.med.ad}`;
    $('#alarm-body').textContent = 'Şu ilacı almanız gerekiyor:';
    $('#alarm-med').textContent = item.med.doz || 'doz belirtilmedi';
    $('#btn-alarmlater').textContent = `${getAyar().erteleDk} dk ertele`;
    const m = $('#modal-alarm'); m.classList.remove('hidden'); m.classList.add('flex');
    const card = m.querySelector('.alarm-card');
    if (card) { card.classList.remove('alarm-shake'); void card.offsetWidth; card.classList.add('alarm-shake'); }
    $('#btn-alarmtaken').onclick = () => almIsaretle(item.med, item.time);
    $('#btn-alarmlater').onclick = () => ertele(item);
  }
  function modalGizle() { currentDue = null; const m = $('#modal-alarm'); m.classList.add('hidden'); m.classList.remove('flex'); }
  function kuyruguIsle() { if (currentDue) return; if (queue.length) modalGoster(queue.shift()); else modalGizle(); }

  function almIsaretle(med, time) {
    ilacAlindi(med.id, time);
    const k = slotKey(med.id, time);
    alerted.delete(k); deferred.delete(k);
    queue = queue.filter((q) => slotKey(q.med.id, q.time) !== k);
    if (currentDue && slotKey(currentDue.med.id, currentDue.time) === k) currentDue = null;
    if (isNative && nativeAktif) {
      const map = readJSON(NOTI_KEY, {});
      const pendingIds = Object.entries(map).filter(([_, v]) => v.startsWith(`${med.id}|`)).map(([id, _]) => Number(id));
      if (pendingIds.length) LocalNotifications.cancel({ notifications: pendingIds.map((id) => ({ id })) }).catch(() => {});
    }
    listeyiCiz(); kuyruguIsle();
    const now = new Date();
    const ts = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    toast(`${med.ad} ${time} → ${ts} — Alındı ✓`);
    const meds = getMeds();
    const done = getDone();
    const ds = todayStr();
    const hasNotYetDue = meds.some((m) => m.times.some((t) => {
      if (done[`${m.id}|${ds}|${t}`]) return false;
      return parseTime(t).getTime() > now;
    }));
    if (!hasNotYetDue) setTimeout(gunSonuOzetGoster, 600);
  }
  function ertele(item) {
    const ayar = getAyar();
    const k = slotKey(item.med.id, item.time);
    deferred.set(k, Date.now() + ayar.erteleDk * 60000);
    alerted.delete(k);
    queue = queue.filter((q) => q !== item);
    if (currentDue === item) currentDue = null;
    toast(`${ayar.erteleDk} dk ertelendi.`);
    kuyruguIsle();
  }

  function kontrol() {
    if (!aktifPid) return;
    const meds = getMeds(); if (!meds.length) return;
    const done = getDone(); const ayar = getAyar(); const now = new Date();
    const yeni = [];
    for (const m of meds) {
      for (const time of m.times) {
        const k = slotKey(m.id, time);
        if (done[k]) continue;
        const defer = deferred.get(k);
        if (defer && Date.now() < defer) continue;
        const t0 = parseTime(time);
        const basla = t0.getTime() - ayar.onerakDk * 60000;
        const bit = t0.getTime() + SON_PENCERE_DK * 60000;
        if (now >= basla && now <= bit && !alerted.has(k)) { alerted.add(k); yeni.push({ med: m, time }); }
      }
    }
    if (yeni.length) {
      bipSesi();
      const g = new Set(); yeni.forEach((x) => { if (!g.has(x.med.id)) { g.add(x.med.id); bildirimGonder(x.med); } });
      queue.push(...yeni); kuyruguIsle();
    }
  }
  function zamanKontroluBaslat() {
    kontrol(); setInterval(kontrol, ADIM_S);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kontrol(); });
  }

  // --------------------------------------------------
  // Patient list
  // --------------------------------------------------
  function listeyiCiz() {
    const list = $('#med-list'), empty = $('#empty-state');
    const meds = getMeds(), done = getDone(), now = new Date(), ds = todayStr();
    const inst = [];
    for (const m of meds) {
      for (const time of m.times) {
        const isDone = !!done[`${m.id}|${ds}|${time}`];
        const overdue = !isDone && now >= parseTime(time);
        inst.push({ med: m, time, isDone, overdue });
      }
    }
    inst.sort((a, b) => a.time === b.time ? a.med.ad.localeCompare(b.med.ad, 'tr') : a.time.localeCompare(b.time));
    list.innerHTML = '';
    if (!inst.length) {
      list.classList.add('hidden'); empty.classList.remove('hidden'); empty.classList.add('flex');
      ozetiGuncelle(0, 0); return;
    }
    empty.classList.add('hidden'); empty.classList.remove('flex'); list.classList.remove('hidden');
    const gosterilen = new Set();
    for (const it of inst) {
      const first = !gosterilen.has(it.med.id);
      if (first) gosterilen.add(it.med.id);
      list.appendChild(kartOlustur(it, first, done));
    }
    ozetiGuncelle(inst.length, inst.filter((i) => i.isDone).length);
    const pending = inst.filter((i) => !i.isDone);
    if (pending.length) {
      const kart = list.querySelector(`[data-time="${pending[pending.length - 1].time}"][data-med="${pending[pending.length - 1].med.id}"]`);
      if (kart) kart.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function kartOlustur(it, firstMed, done) {
    const { med, time, isDone, overdue } = it;
    const durum = isDone ? 'done' : overdue ? 'overdue' : 'pending';
    const el = document.createElement('article');
    el.className = `med-card flex items-center gap-3 rounded-2xl border border-l-4 p-4 ` + {
      done: 'border-emerald-100 border-l-emerald-500 bg-emerald-50',
      overdue: 'border-rose-100 border-l-rose-500 bg-rose-50 is-overdue',
      pending: 'border-stone-100 border-l-amber-400 bg-white shadow-sm',
    }[durum];
    el.dataset.time = time; el.dataset.med = med.id;
    const rozetArk = isDone ? 'bg-emerald-100 text-emerald-700' : overdue ? 'bg-rose-100 text-rose-700' : 'bg-amber-50 text-amber-700';
    const rozetYazi = isDone ? 'Alındı' : overdue ? 'Geçti' : 'Bekleniyor';
    const adRengi = isDone ? 'text-stone-700' : overdue ? 'text-rose-900' : 'text-stone-800';
    const dozRengi = overdue ? 'text-rose-700/80' : 'text-stone-500';
    let gosterilenZaman = time;
    if (isDone && done) {
      const takenKey = `${med.id}|${todayStr()}|${time}`;
      const takenTs = done[takenKey];
      if (takenTs) gosterilenZaman = `${pad(new Date(takenTs).getHours())}:${pad(new Date(takenTs).getMinutes())}`;
    }
    let kontrol;
    if (isDone) {
      kontrol = `<div class="flex h-11 min-w-[52px] shrink-0 items-center justify-center rounded-xl bg-emerald-500 px-3 text-white"><svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div>`;
    } else {
      const btn = overdue ? 'bg-rose-600 text-white' : 'border-2 border-emerald-500 bg-white text-emerald-600';
      kontrol = `<button type="button" data-take title="Alındı işaretle" class="flex min-h-[44px] min-w-[64px] shrink-0 items-center justify-center rounded-xl px-4 text-sm font-bold active:scale-95 transition ${btn}">Alındı</button>`;
    }
    const eylemler = firstMed ? `<div class="flex shrink-0 gap-1">
      <button type="button" data-edit aria-label="Düzenle" title="Düzenle" class="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-600 active:scale-95 transition"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
      <button type="button" data-del aria-label="Sil" title="Sil" class="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 hover:bg-rose-100 hover:text-rose-600 active:scale-95 transition"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
    </div>` : '';
    el.innerHTML = `<div class="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl ${rozetArk}"><span class="text-lg font-bold leading-none">${gosterilenZaman}</span><span class="mt-1 text-[11px] font-semibold">${rozetYazi}</span></div>
      <div class="min-w-0 flex-1"><h3 class="truncate text-lg font-semibold ${adRengi}">${esc(med.ad)}</h3><p class="truncate text-sm ${dozRengi}">${esc(med.doz || 'doz')} · Günde ${med.times.length}</p></div>
      ${eylemler}${kontrol}`;
    el.querySelector('[data-take]')?.addEventListener('click', () => almIsaretle(med, time));
    el.querySelector('[data-edit]')?.addEventListener('click', () => panelAcDuzenle(med));
    el.querySelector('[data-del]')?.addEventListener('click', () => {
      if (window.confirm(`"${med.ad}" ilacını silmek istediğinize emin misiniz?`)) { ilacSil(med.id); listeyiCiz(); notiPlanla(); toast('İlaç silindi.'); }
    });
    return el;
  }

  function ozetiGuncelle(toplam, alinan) {
    $('#summary-total').textContent = toplam;
    $('#summary-pending').textContent = Math.max(0, toplam - alinan);
    $('#summary-done').textContent = alinan;
  }

  function gunSonuOzetGoster() {
    const meds = getMeds(), done = getDone(), ds = todayStr();
    const body = $('#summary-body'); body.innerHTML = '';
    if (!meds.length) { $('#modal-summary').classList.add('hidden'); $('#modal-summary').classList.remove('flex'); return; }
    const lines = [];
    for (const m of meds) {
      for (const time of m.times) {
        const key = `${m.id}|${ds}|${time}`;
        const takenTs = done[key];
        if (takenTs) {
          lines.push(`<div class="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2"><span class="font-semibold text-emerald-800">${esc(m.ad)} ${time}</span><span class="text-emerald-700">Alındı ${pad(new Date(takenTs).getHours())}:${pad(new Date(takenTs).getMinutes())}</span></div>`);
        } else {
          lines.push(`<div class="flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2"><span class="font-semibold text-rose-800">${esc(m.ad)} ${time}</span><span class="text-rose-700">Atlandı</span></div>`);
        }
      }
    }
    body.innerHTML = lines.join('');
    $('#modal-summary').classList.remove('hidden'); $('#modal-summary').classList.add('flex');
  }

  // --------------------------------------------------
  // Patient selection flow
  // --------------------------------------------------
  let currentDue = null;
  let yeniHastaId = null;
  let pinHedef = null;

  function hastaGir(pid, opts = {}) {
    const h = getHastalar().find((x) => x.id === pid); if (!h) return;
    if (h.pin && h.pin.length && !opts.pinAtlandi) { pinKutuAc(h); return; }
    aktifPid = pid; aktifHasta = h; setAktifId(pid);
    alerted.clear(); deferred.clear(); queue = []; currentDue = null; modalGizle();
    appGoster(); $('#h-cip-adi').textContent = h.ad; $('#h-cip-avatar').textContent = harf(h.ad);
    $('#h-cip-avatar').className = 'flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-white ' + avatarRenk(h.ad);
    loadAyarSec(); listeyiCiz();
    notiPlanla();
  }

  function hastaSil(id) {
    const h = getHastalar().find((x) => x.id === id); if (!h) return;
    if (!window.confirm(`"${h.ad}" ve tüm ilaç kayıtları silinecek. Emin misiniz?`)) return;
    saveHastalar(getHastalar().filter((x) => x.id !== id));
    try { localStorage.removeItem(medKey(id)); localStorage.removeItem(doneKey(id)); localStorage.removeItem(setKey(id)); } catch {}
    if (aktifPid === id) { aktifPid = null; aktifHasta = null; setAktifId(null); }
    listeyiCizHastalar(); toast('Hasta silindi.');
  }

  // --------------------------------------------------
  // Event handlers
  // --------------------------------------------------
  function listeyiCizHastalar() {
    const box = $('#h-liste');
    const list = getHastalar();
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<p class="rounded-2xl bg-white/15 px-4 py-6 text-center text-brand-50">Henüz hasta yok.</p>';
      return;
    }
    list.forEach((h) => {
      const el = document.createElement('div');
      el.className = 'flex items-center gap-2';
      el.innerHTML = `
        <button type="button" data-enter data-id="${h.id}" class="flex min-h-[56px] flex-1 items-center gap-3 rounded-2xl bg-white/95 p-3 text-left text-stone-800">
          <span class="flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-white ${avatarRenk(h.ad)}">${esc(harf(h.ad))}</span>
          <span class="min-w-0 flex-1"><span class="block truncate text-lg font-bold">${esc(h.ad)}</span><span class="block text-xs ${h.pin ? 'text-amber-600' : 'text-stone-400'}">${h.pin ? '🔒 PIN korumalı' : 'İlaç takip'}</span></span>
        </button>
        <button type="button" data-sil data-id="${h.id}" aria-label="Sil" class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white/90 active:scale-95 transition">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>`;
      el.querySelector('[data-enter]').addEventListener('click', () => hastaGir(h.id));
      el.querySelector('[data-sil]').addEventListener('click', () => hastaSil(h.id));
      box.appendChild(el);
    });
  }

  function pinKutuAc(h) {
    pinHedef = h; $('#pin-adi').textContent = h.ad;
    $('#pin-hata').classList.add('hidden'); $('#pin-in').value = '';
    $('#pin-kutu').classList.remove('hidden');
    setTimeout(() => $('#pin-in')?.focus(), 60);
  }

  function pinKont() {
    const v = ($('#pin-in').value || '').replace(/\D/g, '');
    if (pinHedef && v === (pinHedef.pin || '')) {
      $('#pin-kutu').classList.add('hidden');
      hastaGir(pinHedef.id);
    } else {
      $('#pin-hata').classList.remove('hidden'); $('#pin-in').value = ''; $('#pin-in').focus();
    }
  }

  function appGoster() {
    document.body.classList.remove('no-scroll');
    $('#screen-hasta').classList.add('hidden');
    $('#app').classList.remove('hidden'); $('#app').classList.add('flex');
  }

  function appGizle() {
    document.body.classList.remove('no-scroll');
    $('#screen-hasta').classList.remove('hidden');
    $('#app').classList.add('hidden');
  }

  function loadAyarSec() { const a = getAyar(); $('#set-onerak').value = String(a.onerakDk); $('#set-ertele').value = String(a.erteleDk); }
  function ayarKaydet(k, v) { const a = getAyar(); a[k] = v; saveAyar(aktifPid, a); toast('Ayarlar kaydedildi.'); }

  // --------------------------------------------------
  // DOMContentLoaded
  // --------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired');
    $('#today-date').textContent = bugunTarihTR();

    // Ensure patient screen is visible
    appGizle();
    console.log('Patient screen shown');

    // Load patients from Firebase or LocalStorage
    (async () => {
      try {
        if (navigator.onLine) {
          console.log('Loading from Firebase...');
          await loadHastalarFromFirebase();
          console.log('Load complete');
        }
        listeyiCizHastalar();
        console.log('List rendered');
      } catch (e) {
        console.error('Load error:', e);
        listeyiCizHastalar();
      }
    })();

    // Patient selection events
    console.log('Attaching events...');
    document.getElementById('h-yeni')?.addEventListener('click', () => { console.log('Yeni Hasta clicked'); yeniHastaId = null; $('#h-ad').value = ''; $('#h-pin').value = ''; $('#h-yeni-title').textContent = 'Yeni Hasta'; $('#h-kaydet').textContent = 'Kaydet ve Gir'; $('#hasta-form').reset(); $('#yeni-kutu').classList.remove('hidden'); setTimeout(() => $('#h-ad')?.focus(), 60); });
    document.getElementById('h-iptal')?.addEventListener('click', () => { $('#yeni-kutu').classList.add('hidden'); });
    document.getElementById('h-geri')?.addEventListener('click', () => { appGizle(); listeyiCizHastalar(); });
    document.getElementById('hasta-form')?.addEventListener('submit', (e) => { e.preventDefault();
      const ad = $('#h-ad').value.trim();
      let pin = $('#h-pin').value.replace(/\D/g, '').slice(0, 6);
      if (!ad) { toast('Hasta adı gerekli.'); return; }
      if (pin && (pin.length < 4 || pin.length > 6)) { toast('PIN 4-6 haneli olmalı.'); return; }
      const list = getHastalar();
      if (yeniHastaId) {
        const h = list.find((x) => x.id === yeniHastaId);
        if (h) { h.ad = ad; h.pin = pin; }
        saveHastalar(list); toast('Hasta güncellendi.');
        listeyiCizHastalar();
      } else {
        const id = genHastaId();
        list.push({ id, ad, pin }); saveHastalar(list);
        toast('Hasta oluşturuldu.');
        hastaGir(id, { pinAtlandi: true });
      }
      $('#yeni-kutu').classList.add('hidden');
    });
    document.getElementById('pin-gir')?.addEventListener('click', pinKont);
    document.getElementById('pin-in')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); pinKont(); } });
    document.getElementById('pin-geri')?.addEventListener('click', () => { $('#pin-kutu').classList.add('hidden'); });

    // App header
    document.getElementById('h-cip')?.addEventListener('click', () => { appGizle(); listeyiCizHastalar(); });
    document.getElementById('notif-btn')?.addEventListener('click', izinIste);
    document.getElementById('ayar-btn')?.addEventListener('click', () => {
      loadAyarSec();
      const p = $('#panel-ayar'); p.classList.remove('hidden'); document.body.classList.add('no-scroll');
    });

    // Settings
    document.getElementById('ayar-kapa')?.addEventListener('click', () => {
      $('#panel-ayar').classList.add('hidden'); document.body.classList.remove('no-scroll'); appGoster();
    });
    document.getElementById('btn-summary-close')?.addEventListener('click', () => {
      $('#modal-summary').classList.add('hidden'); $('#modal-summary').classList.remove('flex');
    });
    document.getElementById('set-onerak')?.addEventListener('change', (e) => { ayarKaydet('onerakDk', +e.target.value); notiPlanla(); });
    document.getElementById('set-ertele')?.addEventListener('change', (e) => ayarKaydet('erteleDk', +e.target.value));

    // Add medication
    const countDisplay = document.getElementById('count-display');
    const timeInputs = document.getElementById('time-inputs');
    function saatiOlustur(n, seed) {
      const cur = Array.from(document.querySelectorAll('.dose-time')).map((i) => i.value);
      ilacKaz = n; countDisplay.textContent = n; timeInputs.innerHTML = '';
      const VARSAYILAN = ['09:00', '14:00', '20:00', '08:00', '12:00', '18:00', '21:00', '07:00'];
      for (let i = 0; i < n; i++) {
        const row = document.createElement('label');
        row.className = 'flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4';
        const v = (seed && seed[i] != null) ? seed[i] : (i < cur.length && cur[i]) ? cur[i] : VARSAYILAN[i % VARSAYILAN.length];
        row.innerHTML = `<span class="shrink-0 font-semibold text-stone-600">${i + 1}. doz</span><input type="time" value="${v}" class="dose-time w-full bg-transparent text-right text-lg font-semibold text-stone-800 outline-none" />`;
        timeInputs.appendChild(row);
      }
    }

    document.getElementById('btn-minus')?.addEventListener('click', () => saatiOlustur(Math.max(1, ilacKaz - 1)));
    document.getElementById('btn-plus2')?.addEventListener('click', () => saatiOlustur(Math.min(8, ilacKaz + 1)));

    document.getElementById('btn-add')?.addEventListener('click', () => {
      editingId = null; document.getElementById('med-form').reset(); document.getElementById('panel-title').textContent = 'Yeni İlaç';
      document.getElementById('panel-desc').textContent = 'İlaç bilginizi girin.'; document.getElementById('save-label').textContent = 'Kaydet';
      saatiOlustur(1); $('#panel-add').classList.remove('hidden'); document.body.classList.add('no-scroll');
      setTimeout(() => $('#ilac-ad')?.focus({ preventScroll: true }), 60);
    });
    document.getElementById('btn-cancel')?.addEventListener('click', () => { $('#panel-add').classList.add('hidden'); document.body.classList.remove('no-scroll'); });
    document.getElementById('btn-save')?.addEventListener('click', (e) => { e.preventDefault();
      const ad = $('#ilac-ad').value.trim();
      const doz = $('#ilac-doz').value.trim();
      const times = Array.from(document.querySelectorAll('.dose-time')).map((i) => i.value).filter(Boolean);
      if (!ad) { $('#ilac-ad').focus(); toast('Lütfen ilaç adını girin.'); return; }
      if (times.length < ilacKaz) { toast('Tüm alınma saatlerini doldurun.'); return; }
      if (editingId) { ilacGuncelle(editingId, { ad, doz, times }); toast('İlaç güncellendi.'); }
      else { ilacKaydet({ ad, doz, times }); toast('İlaç eklendi.'); }
      $('#panel-add').classList.add('hidden'); document.body.classList.remove('no-scroll');
      listeyiCiz();
      notiPlanla();
    });
    document.getElementById('med-form')?.addEventListener('submit', (e) => { e.preventDefault(); document.getElementById('btn-save').click(); });

    window.addEventListener('pointerdown', () => getAudioCtx(), { once: true });
    window.addEventListener('keydown', () => getAudioCtx(), { once: true });

    setupNative();
    zamanKontroluBaslat();
  });

  // --------------------------------------------------
  // PWA Service Worker
  // --------------------------------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker kaydedilemedi:', err));
    });
  }

  let ilacKaz = 1;
  let editingId = null;
})();

// ==========================================================
// Helper functions (moved outside IIFE for global access)
// ==========================================================