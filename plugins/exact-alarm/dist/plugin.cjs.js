'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ExactAlarm = void 0;
const core_1 = require('@capacitor/core');

// Web (tarayici) ortamda exact-alarm kavsami degil; her zaman "olur" doner.
// Gercek kontrol Android native tarafinda yapilir.
const ExactAlarm = (0, core_1.registerPlugin)('ExactAlarm', {
  web: () => ({
    canSchedule: () => Promise.resolve({ canSchedule: true, needsPermission: false }),
    request: () => Promise.resolve(),
  }),
});

exports.ExactAlarm = ExactAlarm;
