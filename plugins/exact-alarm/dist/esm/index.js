import { registerPlugin } from '@capacitor/core';

const ExactAlarm = registerPlugin('ExactAlarm', {
  web: () => ({
    canSchedule: () => Promise.resolve({ canSchedule: true, needsPermission: false }),
    request: () => Promise.resolve(),
  }),
});

export { ExactAlarm };
export {};
