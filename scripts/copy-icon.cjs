// Android projesi mevcut ise, bildirimi icin kullanilan "ic_stat_notify" ikonunu
// android/app/src/main/res/drawable/ disina kopyalar.
// Not: android/ projesi yoksa (cap add android calismadan once) sessizce atlar;
// bu sayede npx cap add android kosulmadan once calistirilabilir.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'res', 'ic_stat_notify.xml');
const marker = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const DEST = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable', 'ic_stat_notify.xml');

if (!fs.existsSync(SRC)) {
  console.log('[icon] kaynak dosya yok:', SRC);
  process.exit(0);
}
if (!fs.existsSync(marker)) {
  console.log('[icon] android projesi yok (once: npx cap add android) - atlandi.');
  process.exit(0);
}
try {
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.copyFileSync(SRC, DEST);
  console.log('[icon] ic_stat_notify.xml kopyalandi ->', DEST);
} catch (e) {
  console.warn('[icon] kopyalama hatasi:', e.message);
}
