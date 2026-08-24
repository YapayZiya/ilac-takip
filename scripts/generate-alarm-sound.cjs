const fs = require('fs');
const path = require('path');

const SR = 22050;
const DURATION = 3.2;

function sin(freq, t) {
  return Math.sin(2 * Math.PI * freq * t);
}

const samples = [];
const total = Math.floor(SR * DURATION);
for (let i = 0; i < total; i++) {
  const t = i / SR;
  const per = 1.1;
  const phase = (t % per) / per;
  const freq = 640 + (920 - 640) * (phase < 0.5 ? phase * 2 : (1 - phase) * 2);
  let v = 0.55 * sin(freq, t);
  const env = Math.min(1, t / 0.02) * Math.min(1, (DURATION - t) / 0.05);
  v *= env;
  samples.push(Math.max(-1, Math.min(1, v)));
}

const dataSize = total * 2;
const buf = Buffer.alloc(44 + dataSize);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);
for (let i = 0; i < total; i++) {
  buf.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
}

const www = path.join(__dirname, '..', 'www');
if (!fs.existsSync(www)) fs.mkdirSync(www, { recursive: true });
const out = path.join(www, 'alarm.wav');
fs.writeFileSync(out, buf);
console.log('Alarm sesi üretildi: ' + out + ' (' + buf.length + ' byte)');