'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ExactAlarm = void 0;
const core_1 = require('@capacitor/core');

const ExactAlarm = (0, core_1.registerPlugin)('ExactAlarm', {
  web: () => ({
    canSchedule: () => Promise.resolve({ canSchedule: true, needsPermission: false, exactAlarmRequired: false, canNotify: true, needsNotifyPermission: false }),
    request: () => Promise.resolve(),
    requestNotifyPermission: () => Promise.resolve({ requested: false }),
    requestIgnoreBatteryOptimizations: () => Promise.resolve({ opened: false }),
  }),
});

exports.ExactAlarm = ExactAlarm;
