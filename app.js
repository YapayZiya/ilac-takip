/* ===========================================================
   İLAÇ TAKİP SİSTEMİ — app.js
   ----------------------------------------------------------
   Adım 1-2: iskelet + arayüz + PWA
   Adım 3  : LocalStorage CRUD (çoklu hasta, kişiye özel anahtar)
   Adım 4  : Saat kontrolü + Alarm / Bildirim / Ses (önce uyarı + ayarlanabilir erteleme)
   Ek      : Çoklu hasta + PIN, Veri içe/dışa aktarım (yedek)
   =========================================================== */

// Capacitor paketleri (esbuild ile www/app.bundle.js icine derlenir)
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { ExactAlarm } from '@ilac/exact-alarm';

(() => {
  'use strict';

  const isNative = Capacitor.isNativePlatform(); // native (Capacitor) ortamda true, tarayicida false

  /* ================= YARDIMCILAR ================= */
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

  /* ================= TOAST ================= */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg; el.classList.remove('opacity-0');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('opacity-0'), 2400);
  }

  /* ================= DEPOLAMA ================= */
  const K_LIST  = 'ilac_takip:hastalar';
  const K_AKTIF = 'ilac_takip:aktif';
  const K_DEFAULT = { onerakDk: 15, erteleDk: 5 };
  const SON_PENCERE_DK = 120; // saatten sonra en fazla kaç dk alarm
  const ADIM_S = 15000;

  function readJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return (v === null || v === undefined) ? fallback : v; }
    catch { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { console.warn('Yazım başarısız:', e); toast('Kaydedilemedi (depolama dolu olabilir).'); }
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

  // --- Kişiye (aktif hasta) özel veri ---
  function getMeds() { if (!aktifPid) return []; const m = readJSON(medKey(aktifPid), []); return Array.isArray(m) ? m : []; }
  function setMeds(a) { if (!aktifPid) return; writeJSON(medKey(aktifPid), a); }
  function getDone() { if (!aktifPid) return {}; const d = readJSON(doneKey(aktifPid), {}); return (d && typeof d === 'object') ? d : {}; }
  function setDone(d) { if (!aktifPid) return; writeJSON(doneKey(aktifPid), d); }

  let aktifPid = null;   // aktif hasta id'si
  let aktifHasta = null; // aktif hasta nesnesi

  /* ==========================================================
     ADIM 3 — CRUD (aktif hasta)
     ========================================================== */
  function ilacKaydet(v) { const m = getMeds(); m.push({ id: genId(), ad: v.ad, doz: v.doz, times: v.times, updatedAt: Date.now() }); setMeds(m); }
  function ilacGuncelle(id, v) { const m = getMeds(); const x = m.find((o) => o.id === id); if (x) { x.ad = v.ad; x.doz = v.doz; x.times = v.times; x.updatedAt = Date.now(); } setMeds(m); }
  function ilacSil(id) {
    setMeds(getMeds().filter((m) => m.id !== id));
    const d = getDone(); Object.keys(d).forEach((k) => { if (k.split('|')[0] === id) delete d[k]; }); setDone(d);
  }
  function ilacAlindi(id, time, pid) {
    const pidUse = pid || aktifPid; if (!pidUse) return;
    const d = readJSON(doneKey(pidUse), {});
    d[`${id}|${todayStr()}|${time}`] = Date.now(); pruneDone(d); writeJSON(doneKey(pidUse), d);
  }
  function pruneDone(d) { const cut = Date.now() - 14 * 86400000; Object.keys(d).forEach((k) => { if (d[k] < cut) delete d[k]; }); }

  /* ==========================================================
     NATIVE (CAPACITOR) — Local Notifications
     Sadece native (Capacitor) ortamda etkilidir. Tarayicida
     isNativePlatform() false oldugu icin bu kismi atlar ve
     web tarafi alarmi (modal + ses + Notification) kullanimda
     kalmaya devam eder. Android'de ise ilaci saatinde (hatta
     uygulama arka plandayken) native bildirimle hatirlatir.
     ========================================================== */
  const NOTI_KEY = 'ilac_takip:noti'; // bildirimi id -> "medId|gg|saat" haritasi
  let nativeAktif = false;            // LocalNotifications icin izin alindi mi

  async function setupNative() {
    console.log('🔔 setupNative() BASLADI');
    if (!isNative) return;
    try {
      LocalNotifications.addListener('localNotificationsActionPerformed', onNotiAction);
      let perm = await LocalNotifications.checkPermissions();
      if (!perm || perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
      nativeAktif = !!(perm && perm.display === 'granted');
      toast(nativeAktif ? 'Arka plan bildirimleri hazır.' : 'Arka plan bildirim izni kapalı.');
      if (nativeAktif) {
        await tamBildirimIzniKontrol();
        await exactAlarmKazandir();
        await pilOptimizasyonKontrol();
        if (aktifPid) {
          console.log('🔔 setupNative sonrasi notiPlanla() cagriliyor...');
          await notiPlanla();
        }
        App.addListener('resume', onAppResume);
      }
    } catch (e) {
      console.warn('LocalNotifications hazırlanamadı:', e);
      nativeAktif = false;
    }
  }

  async function pilOptimizasyonKontrol() {
    if (!isNative || !nativeAktif) return;
    try {
      const res = await ExactAlarm.requestIgnoreBatteryOptimizations();
      if (res && res.opened) {
        console.log('Pil optimizasyonu ayarlari acildi, kullaniciyi bilgilendir.');
        toast('Pil optimizasyonunu kapatmak için ayarlardan "İzin ver" deyin.');
      }
    } catch (e) {
      console.warn('Pil optimizasyonu istenemedi:', e);
    }
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

  // Bildirimdeki "Alindi" aksiyonu: dozu alindi olarak isar, bildirimi kapatir.
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

  // Android 13+ (API 33) POST_NOTIFICATIONS izni kontrol et.
  async function tamBildirimIzniKontrol() {
    if (!isNative || !nativeAktif) return;
    let r;
    try { r = await ExactAlarm.canSchedule(); } catch { return; }
    if (r && r.needsNotifyPermission) {
      console.warn('🚫 POST_NOTIFICATIONS izni eksik — Android 13+ cihazlarda bildirimler CALISMAZ.');
      toast('⚠ Bildirim izni gerekli. Lütfen onaylayın.');
      try { await ExactAlarm.requestNotifyPermission(); } catch (e) { console.warn('POST_NOTIFICATIONS istenemedi:', e); }
    } else if (r && r.canNotify) {
      console.log('✅ POST_NOTIFICATIONS izni OK.');
    }
  }

  // KOKEN COZUM — Android 12+ (API 31) Exact Alarm izni.
  // Capacitor, canScheduleExactAlasks()==false ise alarmi NON-EXACT
  // (setAndAllowWhileIdle) kurar; bu, Doze/pil-tasarrufunda ERTELENIR ve
  // saat gelince CALMAZ. Buradan CustomPlugin ile:
  //   1) Gercek AlarmManager.canScheduleExactAlams() degerini al
  //   2) Izin yoksa kullaniciyi DOGRU ayar sayfasina gonder (ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
  //   3) Android 13+ POST_NOTIFICATIONS iznini kontrol et + iste
  // Kullanici "Izinle" deyip geri donunce onAppResume() alarmlari EXACT
  // olarak yeniden planlar.
  async function exactAlarmKazandir() {
    if (!isNative || !nativeAktif) return;
    let r;
    try {
      r = await ExactAlarm.canSchedule();
    } catch (e) {
      console.warn('ExactAlarm plugin cagrilirken hata (plugin yok mu?):', e);
      return;
    }
    if (r && r.canSchedule) {
      console.log('✅ Exact Alarm izni OK (canScheduleExactAlams=true) → alarmlar EXACT kurulacak.');
      return;
    }
    console.warn('🚫 Exact Alarm izni EKSİK — DOGRU ayar sayfasini aciyorum. Izinsiz alarmlar NON-EXACT kalir (Doze\'da ertelenebilir).');
    toast('⚠ Arka plandaki alarm icin "Tam Zamanli Alarm" izni gerekli. Önünüze gelen ekranda "İzinle" deyin.');
    try {
      const res = await ExactAlarm.request();
      console.log('Exact alarm ayarlar sayfası açıldı:', res);
    } catch (e) {
      console.error('Exact alarm ayarlar sayfası açılamadı → manuel yol: Ayarlar → Uygulamalar → İlaç Takip → "Tam zamanlı alarm". Hata:', e);
    }
  }

  // Kullanici izin sayfasindan geri donunce: izni tekrar kontrol et,
  // alindiysa alarmlari EXACT olarak yeniden kurgula.
  async function onAppResume() {
    if (!isNative || !nativeAktif) return;
    let r;
    try { r = await ExactAlarm.canSchedule(); } catch { return; }
    if (r && r.canSchedule) {
      if (aktifPid) {
        console.log('✅ Exact Alarm izni ALINDI → alarmlar EXACT olarak yeniden planlaniyor.');
        await notiPlanla();
        toast('Tam zamanlı alarm etkin — arka planda bile çalacak.');
      }
    } else if (r && r.exactAlarmRequired) {
      console.warn('⚠ Exact Alarm izni hâlâ eksik. Ayarlar → Uygulamalar → İlaç Takip → "Tam zamanlı alarm".');
    }
    if (r && r.needsNotifyPermission) {
      console.warn('⚠ POST_NOTIFICATIONS izni hâlâ eksik. Ayarlar → Uygulamalar → İlaç Takip → izni açın.');
    }
  }

  // Aktif hastanin dozlarini sonraki olusumuna (bugun degilse yarin) planlar.
  // Her degisiklikte once tumu iptal, sonra aktif hasta icin yeniden planlar.
  // KOSEN KURALLAR: ISO-8601 string at, allowWhileIdle:true, benzersiz int id,
  // agresif debug log + exact-alarm hatasi tespiti.
  async function notiPlanla() {
    console.log('🔔 notiPlanla() BASLADI - isNative:', isNative, 'nativeAktif:', nativeAktif, 'aktifPid:', aktifPid);
    if (!(isNative && nativeAktif)) {
      console.log('notiPlanla atlandi: native=', isNative, 'nativeAktif=', nativeAktif);
      return;
    }
    try {
      const prev = readJSON(NOTI_KEY, {});
      const prevIds = Object.keys(prev).map(Number).filter((id) => !Number.isNaN(id));
      if (prevIds.length) {
        console.log('notiPlanla: onceki bildirimler iptal ediliyor, adet=', prevIds.length);
        try { await LocalNotifications.cancel({ notifications: prevIds.map((id) => ({ id })) }); } catch (e) { console.warn('onceki iptal hatasi:', e); }
      }
      const meds = getMeds();
      console.log('notiPlanla: ilac sayisi=', meds.length, meds.map(x => ({ id: x.id, ad: x.ad, times: x.times })));
      const ayar = getAyar();
      console.log('notiPlanla: ayar=', ayar);
      const done = getDone();
      const list = [];
      const map = {};
      for (const m of meds) {
        if (!Array.isArray(m.times) || !m.times.length) {
          console.warn('notiPlanla: zaman bulunamadi ->', m.ad, m.times);
          continue;
        }
        for (const time of m.times) {
          const raw = String(time).trim();
          if (!raw) {
            console.warn('notiPlanla: bos zaman atlandi ->', m.ad);
            continue;
          }
          const t0 = parseTime(raw);
          const todayTaken = !!done[`${m.id}|${todayStr()}|${raw}`];
          const hedef = (todayTaken || t0.getTime() <= Date.now())
            ? new Date(t0.getTime() + 86400000)
            : t0;
          let hedefZaman = hedef.getTime() - ayar.onerakDk * 60000;
          if (hedefZaman < Date.now()) hedefZaman = Date.now();
          const key = `${m.id}|${dateStr(hedef)}|${raw}`;
          const yeniId = Math.abs(Math.floor(hedefZaman / 1000) + (notiIdForKey(key) % 100000));
          map[yeniId] = key;
          console.log('🔔 ALARM PLANLANDI:', {
            id: yeniId,
            ilac: m.ad,
            saat: raw,
            hedefZaman: new Date(hedefZaman).toLocaleString('tr-TR'),
            isoString: new Date(hedefZaman).toISOString(),
            allowWhileIdle: true,
          });
          list.push({
            id: yeniId,
            title: m.ad,
            body: `${raw} · ${m.doz || 'doz'}`,
            smallIcon: 'ic_stat_notify',
            color: '#0d9488',
            category: 'reminder',
            importance: 4,
            priority: 4,
            allowWhileIdle: true,
            visibility: 'public',
            vibrationPattern: [0, 300, 200, 300, 200, 300],
            schedule: { at: new Date(hedefZaman).toISOString() },
            actions: [{ id: 'taken', type: 'button', title: 'Alındı ✓' }],
          });
        }
      }
      console.log('notiPlanla: toplam planlanacak bildirim=', list.length);
      if (!list.length) {
        toast('Planlanacak alarm yok. İlaç saatlerini kontrol edin.');
        writeJSON(NOTI_KEY, {});
        return;
      }
      const fresh = new Set(Object.keys(map));
      Object.keys(prev).forEach((k) => { if (!fresh.has(String(k))) delete prev[k]; });
      Object.assign(prev, map);
      writeJSON(NOTI_KEY, prev);
      await LocalNotifications.schedule({ notifications: list });
      console.log('✅ ALARM PLANLAMA TAMAM — schedule() basarili, toplam', list.length, 'bildirim.');
      toast('Alarmlar planlandı.');
    } catch (e) {
      const msg = String((e && e.message) || e || '');
      console.error('❌ ALARM PLANLANAMADI —', e);
      if (/EXACT_ALARM|startAlarm|SecurityException|permission/i.test(msg)) {
        console.error('🚫 Neden: Tam Zamanlı Alarm (SCHEDULE_EXACT_ALARM) izni eksik. Android Ayarlar → Uygulamalar → İlaç Takip → izni açın.');
        toast('⚠ Tam Zamanlı Alarm izni eksik. Android Ayarlar\'dan verin.');
      } else {
        toast('Bildirimler planlanamadı: ' + msg);
      }
    }
  }

  async function testNotiGonder() {
    if (!(isNative && nativeAktif)) { toast('Native bildirim açık değil. Önce zil ikona dokunup izin verin.'); return; }
    try {
      const at = new Date(Date.now() + 5000);
      console.log('TEST BİLDİRİMİ planlandı, at (ISO):', at.toISOString());
      await LocalNotifications.schedule({
        notifications: [{
          id: 999999,
          title: 'Test Bildirimi',
          body: 'Bildirim sistemi çalışıyor! Bu bir test.',
          smallIcon: 'ic_stat_notify',
          color: '#0d9488',
          importance: 4,
          priority: 4,
          visibility: 'public',
          vibrationPattern: [0, 300, 200, 300, 200, 300],
          allowWhileIdle: true,
          schedule: { at: at.toISOString() },
        }]
      });
      toast('5 sn içinde test bildirimi gelecek.');
    } catch (e) {
      console.warn('Test bildirimi gönderilemedi:', e);
      toast('Test bildirimi gönderilemedi: ' + (e.message || e));
    }
  }

  async function debugNotiGoster() {
    if (!(isNative && nativeAktif)) { toast('Native bildirim açık değil.'); return; }
    try {
      const { notifications } = await LocalNotifications.getPending();
      console.log('Bekleyen Bildirimler (getPending):', JSON.stringify(notifications, null, 2));
      if (!notifications.length) { toast('Android tarafında bekleyen bildirim yok.'); return; }
      const lines = notifications.map((n, i) =>
        `${i + 1}. id=${n.id}  "${n.title}"  ${n.body || ''}  priority=${n.priority}  visibility=${n.visibility}  vibration=${JSON.stringify(n.vibrationPattern)}`
      );
      alert(`Android'de bekleyen bildirimler (${notifications.length}):\n\n${lines.join('\n\n')}`);
    } catch (e) {
      console.warn('Bekleyen bildirimler alınamadı:', e);
      toast('Bekleyen bildirimler alınamadı: ' + e.message);
    }
  }

  async function debugNotiDurum() {
    const satir = [];
    satir.push(`isNative: ${isNative}`);
    satir.push(`nativeAktif: ${nativeAktif}`);
    const meds = getMeds();
    satir.push(`İlaç sayisi: ${meds.length}`);
    if (meds.length) {
      satir.push(`İlaçlar: ${JSON.stringify(meds.map(x => ({ id: x.id, ad: x.ad, times: x.times })))}`);
    }
    const done = getDone();
    satir.push(`Alinan kayit: ${Object.keys(done).length}`);
    if (isNative) {
      try {
        const perm = await LocalNotifications.checkPermissions();
        satir.push(`LocalNotifications.display: ${perm?.display}`);
        const r = await ExactAlarm.canSchedule();
        satir.push(`ExactAlarm.canSchedule: ${r?.canSchedule}`);
        satir.push(`ExactAlarm.needsPermission: ${r?.needsPermission}`);
        satir.push(`ExactAlarm.exactAlarmRequired: ${r?.exactAlarmRequired}`);
        satir.push(`ExactAlarm.canNotify: ${r?.canNotify}`);
        satir.push(`ExactAlarm.needsNotifyPermission: ${r?.needsNotifyPermission}`);
      } catch (e) {
        satir.push(`Plugin hatasi: ${e.message || e}`);
      }
    }
    const { notifications } = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
    satir.push(`Bekleyen bildirim: ${notifications.length}`);
    satir.push(`Aktif hasta: ${aktifPid || 'yok'}`);
    satir.push(`Aktif hasta ad: ${aktifHasta?.ad || 'yok'}`);
    console.log('🔍 BILDIRIM TANILAMA:\n' + satir.join('\n'));
    alert('Tanılama:\n\n' + satir.join('\n'));
  }

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
      list.appendChild(kartOlustur(it, first));
    }
    ozetiGuncelle(inst.length, inst.filter((i) => i.isDone).length);
  }

  function kartOlustur(it, firstMed) {
    const { med, time, isDone, overdue } = it;
    const durum = isDone ? 'done' : overdue ? 'overdue' : 'pending';
    const el = document.createElement('article');
    el.className = `med-card flex items-center gap-3 rounded-2xl border border-l-4 p-4 ` + {
      done: 'border-emerald-100 border-l-emerald-500 bg-emerald-50',
      overdue: 'border-rose-100 border-l-rose-500 bg-rose-50 is-overdue',
      pending: 'border-stone-100 border-l-amber-400 bg-white shadow-sm',
    }[durum];

    const rozetArk = isDone ? 'bg-emerald-100 text-emerald-700' : overdue ? 'bg-rose-100 text-rose-700' : 'bg-amber-50 text-amber-700';
    const rozetYazi = isDone ? 'Alındı' : overdue ? 'Geçti' : 'Bekleniyor';
    const adRengi = isDone ? 'text-stone-700' : overdue ? 'text-rose-900' : 'text-stone-800';
    const dozRengi = overdue ? 'text-rose-700/80' : 'text-stone-500';

    let kontrol;
    if (isDone) {
      kontrol = `<div class="flex h-11 min-w-[52px] shrink-0 items-center justify-center rounded-xl bg-emerald-500 px-3 text-white shadow" title="Alındı">
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
      </div>`;
    } else {
      const btn = overdue ? 'bg-rose-600 text-white' : 'border-2 border-emerald-500 bg-white text-emerald-600';
      kontrol = `<button type="button" data-take title="Alındı işaretle"
        class="flex min-h-[44px] min-w-[64px] shrink-0 items-center justify-center rounded-xl px-4 text-sm font-bold active:scale-95 transition ${btn}">Alındı</button>`;
    }

    const eylemler = firstMed ? `
      <div class="flex shrink-0 gap-1">
        <button type="button" data-edit aria-label="Düzenle" title="Düzenle"
          class="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-600 active:scale-95 transition">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button type="button" data-del aria-label="Sil" title="Sil"
          class="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 hover:bg-rose-100 hover:text-rose-600 active:scale-95 transition">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>` : '';

    el.innerHTML = `
      <div class="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl ${rozetArk}">
        <span class="text-lg font-bold leading-none">${time}</span>
        <span class="mt-1 text-[11px] font-semibold">${rozetYazi}</span>
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-lg font-semibold ${adRengi}">${esc(med.ad)}</h3>
        <p class="truncate text-sm ${dozRengi}">${esc(med.doz || 'doz')} · Günde ${med.times.length}</p>
      </div>
      ${eylemler}
      ${kontrol}
    `;

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

  /* ==========================================================
     ADIM 4 — ZAMAN KONTROLÜ + ALARM / BİLDİRİM / SES
     =========================================================
       - Her ADIM_S (15 sn) kontrol.
       - Bir doz, "(saat - onerakDk)" ile "(saat + SON_PENCERE_DK)"
         arasında ve alınmadıysa alarm verir (onerakDk = hastanın ayarı).
       - "ertele" -> hastanın ayarladığı erteleDk kadar erteler, sonra yeniden.
       - Sayfa açıkken çalışır.
     ========================================================== */
  const alerted = new Set();
  const deferred = new Map();
  let queue = [];
  let currentDue = null;
  let audioCtx = null;

  const slotKey = (id, time) => `${id}|${todayStr()}|${time}`;

  function getAudioCtx() {
    if (!('AudioContext' in window) && !('webkitAudioContext' in window)) return null;
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
      const n = new Notification(med ? `İlaç Zamanı · ${med.ad}` : 'İlaç Takip', {
        body: med ? `${med.doz || 'doz'} — şimdi alınmalı` : 'Bildirimler çalışıyor.',
        icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'ilac-takip',
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) { console.warn('Bildirim gönderilemedi:', e); }
  }
  async function izinIste() {
    if (isNative) {
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          const newPerm = await LocalNotifications.requestPermissions();
          toast(newPerm.display === 'granted' ? 'Bildirim izni verildi.' : 'Bildirim izni reddedildi.');
        } else {
          toast('Bildirim izni zaten verilmiş.');
        }
      } catch (e) {
        toast('Bildirim izni istenemedi.');
      }
      return;
    }
    if (!('Notification' in window)) { toast('Tarayıcınız masaüstü bildirimi desteklemiyor.'); return; }
    let p = Notification.permission;
    if (p === 'default') { try { p = await Notification.requestPermission(); } catch { p = Notification.permission; } }
    if (p === 'granted') { toast('Bildirimler açık. Saat gelince uyaracağız.'); bildirimGonder(null); }
    else if (p === 'denied') { toast('Bildirimler kapalı. Tarayıcı ayarlarından açabilirsiniz.'); }
    else { toast('Bildirimi açmak için onay verin.'); }
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
    listeyiCiz(); kuyruguIsle();
    const now = new Date();
    const ts = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    toast(`${med.ad} ${time} → ${ts} — Alındı ✓`);
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
        const basla = t0 - ayar.onerakDk * 60000;
        const bit = t0 + SON_PENCERE_DK * 60000;
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

  /* ==========================================================
     ADIM 2 — İLAÇ PANELİ (alttan kayan)
     ========================================================== */
  const saatKutu = $('#time-inputs');
  const VARSAYILAN_SAT = ['09:00', '14:00', '20:00', '08:00', '12:00', '18:00', '21:00', '07:00'];
  let ilacKaz = 1;
  let editingId = null;
  let pinHedef = null;
  let yeniHastaId = null;

  const mevcutSaatler = () => $$('.dose-time', saatKutu).map((i) => i.value);
  function saatSatiri(no, deger) {
    const row = document.createElement('label');
    row.className = 'flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4';
    row.innerHTML =
      `<span class="shrink-0 font-semibold text-stone-600">${no}. doz</span>` +
      `<input type="time" value="${deger || ''}" class="dose-time w-full bg-transparent text-right text-lg font-semibold text-stone-800 outline-none" />`;
    return row;
  }
  function saatlariOlustur(n, seed) {
    const cur = mevcutSaatler();
    ilacKaz = n; $('#count-display').textContent = n; saatKutu.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const v = (seed && seed[i] != null) ? seed[i] : (i < cur.length && cur[i]) ? cur[i] : VARSAYILAN_SAT[i % VARSAYILAN_SAT.length];
      saatKutu.appendChild(saatSatiri(i + 1, v));
    }
  }
  const sayiDegistir = (d) => saatlariOlustur(Math.min(8, Math.max(1, ilacKaz + d)));

  function paneliAcar() {
    const p = $('#panel-add'); p.classList.remove('hidden'); p.classList.add('flex');
    document.body.classList.add('no-scroll');
    setTimeout(() => $('#ilac-ad')?.focus({ preventScroll: true }), 60);
  }
  function paneliKapa() {
    const p = $('#panel-add'); p.classList.add('hidden'); p.classList.remove('flex');
    document.body.classList.remove('no-scroll');
  }
  const baslaLabel = () => { $('#panel-title').textContent = 'Yeni İlaç'; $('#panel-desc').textContent = 'İlaç bilginizi girin.'; $('#save-label').textContent = 'Kaydet'; };
  function panelAcarYeni() { editingId = null; $('#med-form').reset(); baslaLabel(); saatlariOlustur(1); paneliAcar(); }
  function panelAcDuzenle(med) {
    editingId = med.id; $('#ilac-ad').value = med.ad; $('#ilac-doz').value = med.doz || '';
    $('#panel-title').textContent = 'İlacı Düzenle'; $('#panel-desc').textContent = 'Bilgileri güncelleyin.'; $('#save-label').textContent = 'Güncelle';
    saatlariOlustur(med.times.length, med.times); paneliAcar();
  }
  function paneliTemizleKapat() { paneliKapa(); editingId = null; $('#med-form').reset(); baslaLabel(); saatlariOlustur(1); }

  function ilacKaydetForm() {
    const ad = $('#ilac-ad').value.trim();
    const doz = $('#ilac-doz').value.trim();
    const times = mevcutSaatler().filter(Boolean);
    if (!ad) { $('#ilac-ad').focus(); toast('Lütfen ilaç adını girin.'); return; }
    if (times.length < ilacKaz) { toast('Lütfen tüm alınma saatlerini doldurun.'); return; }
    if (editingId) { ilacGuncelle(editingId, { ad, doz, times }); toast('İlaç güncellendi.'); }
    else { ilacKaydet({ ad, doz, times }); toast('İlaç eklendi.'); }
    paneliTemizleKapat(); listeyiCiz();
    notiPlanla();
  }

  /* ==========================================================
     ÇOKLU HASTA + PIN
     ========================================================== */
  function appGoster() {
    document.body.classList.remove('no-scroll');
    $('#screen-hasta').classList.add('hidden');
    $('#app').classList.remove('hidden'); $('#app').classList.add('flex');
  }
  function appGizle() {
    document.body.classList.remove('no-scroll');
    $('#app').classList.add('hidden'); $('#app').classList.remove('flex');
    $('#screen-hasta').classList.remove('hidden');
  }
  function setHastaAlan(mod) {
    $('#h-liste').classList.toggle('hidden', mod !== 'liste');
    $('#yeni-kutu').classList.toggle('hidden', mod !== 'form');
    $('#pin-kutu').classList.toggle('hidden', mod !== 'pin');
    $('#h-yeni').classList.toggle('hidden', mod !== 'liste');
    $('#h-geri').classList.toggle('hidden', !(aktifPid && mod === 'liste'));
  }
  function listeyiCizHastalar() {
    const box = $('#h-liste'); const list = getHastalar();
    box.innerHTML = '';
    setHastaAlan('liste');
    if (!list.length) {
      box.innerHTML = '<p class="rounded-2xl bg-white/15 px-4 py-6 text-center text-brand-50 ring-1 ring-white/20">Henüz hasta yok. Altta "Yeni Hasta" ile ekleyin.</p>';
      return;
    }
    list.forEach((h) => {
      const el = document.createElement('div');
      el.className = 'flex items-center gap-2';
      el.innerHTML = `
        <button type="button" data-enter data-id="${h.id}"
          class="flex min-h-[56px] flex-1 items-center gap-3 rounded-2xl bg-white/95 p-3 text-left text-stone-800 shadow-lg active:scale-[.99] transition">
          <span class="flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-white ${avatarRenk(h.ad)}">${esc(harf(h.ad))}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-lg font-bold">${esc(h.ad)}</span>
            <span class="block text-xs ${h.pin ? 'text-amber-600' : 'text-stone-400'}">${h.pin ? '🔒 PIN korumalı' : 'İlaç takip'}</span>
          </span>
          <svg class="h-5 w-5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <button type="button" data-sil data-id="${h.id}" aria-label="Sil" title="Sil"
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white/90 ring-1 ring-white/25 active:scale-95 transition">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>`;
      el.querySelector('[data-enter]').addEventListener('click', () => hastaGir(h.id));
      el.querySelector('[data-sil]').addEventListener('click', () => hastaSil(h.id));
      box.appendChild(el);
    });
  }
  function yeniKutuAc(hasta = null) {
    yeniHastaId = hasta?.id || null;
    $('#yeni-title').textContent = hasta ? 'Hastayı Düzenle' : 'Yeni Hasta';
    $('#h-kaydet').textContent = hasta ? 'Kaydet' : 'Kaydet ve Gir';
    $('#h-ad').value = hasta?.ad || '';
    $('#h-pin').value = hasta?.pin || '';
    setHastaAlan('form');
    setTimeout(() => $('#h-ad')?.focus(), 60);
  }
  function hastaFormKaydet() {
    const ad = $('#h-ad').value.trim();
    let pin = $('#h-pin').value.replace(/\D/g, '').slice(0, 6);
    if (!ad) { toast('Hasta adı gerekli.'); return; }
    if (pin && (pin.length < 4 || pin.length > 6)) { toast('PIN 4–6 haneli olmalı.'); return; }
    const list = getHastalar();
    if (yeniHastaId) {
      const h = list.find((x) => x.id === yeniHastaId);
      if (h) { h.ad = ad; h.pin = pin; }
      saveHastalar(list); toast('Hasta güncellendi.');
      setHastaAlan('liste'); listeyiCizHastalar();
      if (aktifPid === yeniHastaId) { aktifHasta = h; $('#h-cip-adi').textContent = ad; $('#h-cip-avatar').textContent = harf(ad); }
    } else {
      const id = genHastaId();
      list.push({ id, ad, pin }); saveHastalar(list);
      toast('Hasta oluşturuldu.');
      hastaGir(id, { pinAtlandi: true });
    }
  }
  function hastaSil(id) {
    const h = getHastalar().find((x) => x.id === id); if (!h) return;
    if (!window.confirm(`"${h.ad}" ve tüm ilaç kayıtları kalıcı olarak silinecek. Emin misiniz?`)) return;
    saveHastalar(getHastalar().filter((x) => x.id !== id));
    try { localStorage.removeItem(medKey(id)); localStorage.removeItem(doneKey(id)); localStorage.removeItem(setKey(id)); } catch {}
    if (aktifPid === id) { aktifPid = null; aktifHasta = null; setAktifId(null); }
    listeyiCizHastalar(); toast('Hasta silindi.');
  }
  function pinKutuAc(h) {
    pinHedef = h; $('#pin-adi').textContent = h.ad;
    $('#pin-hata').classList.add('hidden'); $('#pin-in').value = '';
    setHastaAlan('pin'); setTimeout(() => $('#pin-in')?.focus(), 60);
  }
  function pinKont() {
    const v = ($('#pin-in').value || '').replace(/\D/g, '');
    if (pinHedef && v === (pinHedef.pin || '')) { setHastaAlan('liste'); hastaGir(pinHedef.id, { pinAtlandi: true }); }
    else { $('#pin-hata').classList.remove('hidden'); $('#pin-in').value = ''; $('#pin-in').focus(); }
  }
  function hastaGir(pid, opts = {}) {
    console.log('🔔 hastaGir() BASLADI - pid:', pid, 'aktifPid_once:', aktifPid);
    const h = getHastalar().find((x) => x.id === pid); if (!h) return;
    if (h.pin && h.pin.length && !opts.pinAtlandi) { pinKutuAc(h); return; }
    aktifPid = pid; aktifHasta = h; setAktifId(pid);
    alerted.clear(); deferred.clear(); queue = []; currentDue = null; modalGizle();
    appGoster();
    $('#h-cip-adi').textContent = h.ad;
    $('#h-cip-avatar').textContent = harf(h.ad);
    $('#h-cip-avatar').className = 'flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-white ' + avatarRenk(h.ad);
    loadAyarSec(); listeyiCiz();
    console.log('🔔 hastaGir() sonrasi notiPlanla() cagriliyor...');
    notiPlanla();
  }

  /* ==========================================================
     AYARLAR (önce uyarı / erteleme) + VERİ YEDEK
     ========================================================== */
  function ayarAc() { if (!aktifPid) return; loadAyarSec(); const p = $('#panel-ayar'); p.classList.remove('hidden'); document.body.classList.add('no-scroll'); }
  function ayarKapa() { $('#panel-ayar').classList.add('hidden'); document.body.classList.remove('no-scroll'); }
  function loadAyarSec() { const a = getAyar(); $('#set-onerak').value = String(a.onerakDk); $('#set-ertele').value = String(a.erteleDk); }
  function ayarKaydet(k, v) { const a = getAyar(); a[k] = v; saveAyar(aktifPid, a); toast('Ayarlar kaydedildi.'); }

  async function veriDisa() {
    if (!aktifHasta) return;
    const veri = {
      _format: 'ilac-takip-yedek', versiyon: 1,
      hasta: { id: aktifHasta.id, ad: aktifHasta.ad, pin: aktifHasta.pin },
      ayar: getAyar(), ilaclar: getMeds(), alindi: getDone(),
      disariTarih: new Date().toISOString(),
    };
    const jsonString = JSON.stringify(veri, null, 2);
    const dosyaAdi = `ilac-takip-${slug(aktifHasta.ad)}-${todayStr()}.json`;
    if (isNative) {
      try {
        await Filesystem.writeFile({ path: dosyaAdi, data: jsonString, directory: Directory.Documents, encoding: Encoding.UTF8 });
        const { uri } = await Filesystem.getUri({ path: dosyaAdi, directory: Directory.Documents });
        console.log('Yedek dosyası yazıldı, share URI:', uri);
        await Share.share({ files: [uri], title: 'İlaç Takip Yedeği' });
        toast('Yedek paylaşıldı. Documents klasöründe de kayıtlı.');
      } catch (e) {
        console.warn('Dosya paylaşımı başarısız:', e);
        toast('Paylaşım başarısız: ' + (e.message || e));
      }
    } else {
      const file = new File([jsonString], dosyaAdi, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'İlaç Takip Yedeği' }); toast('Yedek paylaşıldı.'); }
        catch (e) { if (e.name !== 'AbortError') toast('Paylaşım başarısız.'); }
      } else { alert('Paylaşım menüsü desteklenmiyor.'); }
    }
  }
  function veriIcce(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const v = JSON.parse(fr.result);
        if (!v || typeof v !== 'object') throw new Error('Boş dosya.');
        if (!Array.isArray(v.ilaclar)) throw new Error('Geçersiz yedek (ilaç listesi yok).');
        const ad = (v.hasta && v.hasta.ad ? String(v.hasta.ad) : 'İçe Aktarılan').trim() || 'İçe Aktarılan';
        const pin = v.hasta && v.hasta.pin ? String(v.hasta.pin) : '';
        if (!window.confirm(`"${ad}" yedeği geri yüklenecek (${v.ilaclar.length} ilaç).\nDevam etmek istiyor musunuz?`)) return;
        const list = getHastalar();
        let h = list.find((x) => v.hasta && x.id === v.hasta.id) || list.find((x) => x.ad === ad);
        if (!h) { h = { id: genHastaId(), ad, pin }; list.push(h); saveHastalar(list); }
        saveAyar(h.id, Object.assign({}, K_DEFAULT, v.ayar || {}));
        writeJSON(medKey(h.id), v.ilaclar);
        writeJSON(doneKey(h.id), (v.alindi && typeof v.alindi === 'object') ? v.alindi : {});
        hastaGir(h.id, { pinAtlandi: true });
        toast('Yedek geri yüklendi.');
      } catch (e) { toast('Dosya okunamadı: ' + e.message); }
    };
    fr.readAsText(file);
  }

  /* ==========================================================
     BAŞLANGIÇ
     ========================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    $('#today-date').textContent = bugunTarihTR();
    listeyiCizHastalar();

    // Hasta seçimi
    $('#h-yeni').addEventListener('click', () => yeniKutuAc(null));
    $('#h-iptal').addEventListener('click', () => { listeyiCizHastalar(); });
    $('#h-geri').addEventListener('click', () => appGoster());
    $('#hasta-form').addEventListener('submit', (e) => { e.preventDefault(); hastaFormKaydet(); });
    $('#pin-gir').addEventListener('click', pinKont);
    $('#pin-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); pinKont(); } });
    $('#pin-geri').addEventListener('click', () => listeyiCizHastalar());

    // App header
    $('#h-cip').addEventListener('click', () => { appGizle(); listeyiCizHastalar(); });
    $('#notif-btn').addEventListener('click', izinIste);
    $('#ayar-btn').addEventListener('click', ayarAc);

    // Ayarlar
    $('#ayar-kapa').addEventListener('click', ayarKapa);
    $('#set-onerak').addEventListener('change', (e) => { ayarKaydet('onerakDk', +e.target.value); notiPlanla(); });
    $('#set-ertele').addEventListener('change', (e) => ayarKaydet('erteleDk', +e.target.value));
    $('#btn-export').addEventListener('click', veriDisa);
    $('#btn-import').addEventListener('click', () => { const f = $('#import-file'); f.value = ''; f.click(); });
    $('#import-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) veriIcce(f); });
    $('#btn-test-noti').addEventListener('click', testNotiGonder);
    $('#btn-debug-noti').addEventListener('click', debugNotiGoster);
    $('#btn-debug-durum').addEventListener('click', debugNotiDurum);

    // İlaç paneli
    $('#btn-add').addEventListener('click', panelAcarYeni);
    $('#btn-cancel').addEventListener('click', paneliTemizleKapat);
    $('#panel-overlay').addEventListener('click', paneliTemizleKapat);
    $('#btn-minus').addEventListener('click', () => sayiDegistir(-1));
    $('#btn-plus2').addEventListener('click', () => sayiDegistir(1));
    $('#med-form').addEventListener('submit', (e) => { e.preventDefault(); ilacKaydetForm(); });
    $('#btn-save').addEventListener('click', (e) => { e.preventDefault(); ilacKaydetForm(); });

    // Sesi ilk etkileşimde hazırla
    window.addEventListener('pointerdown', () => getAudioCtx(), { once: true });
    window.addEventListener('keydown', () => getAudioCtx(), { once: true });

    // Native (Capacitor) Local Notifications hazirla (izin + aksiyon dinleyici)
    setupNative();

    // Zaman motoru
    zamanKontroluBaslat();
  });

  /* ==========================================================
     PWA — Service Worker
     ========================================================== */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker kaydedilemedi:', err));
    });
  }
})();
