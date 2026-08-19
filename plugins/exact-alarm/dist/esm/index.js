import { registerPlugin } from '@capacitor/core';

const ExactAlarm = registerPlugin('ExactAlarm', {
  web: () => ({
    canSchedule: () => Promise.resolve({ canSchedule: true, needsPermission: false, exactAlarmRequired: false, canNotify: true, needsNotifyPermission: false }),
    request: () => Promise.resolve(),
    requestNotifyPermission: () => Promise.resolve({ requested: false }),
    requestIgnoreBatteryOptimizations: () => Promise.resolve({ opened: false }),
  }),
});

export { ExactAlarm };
export {};
