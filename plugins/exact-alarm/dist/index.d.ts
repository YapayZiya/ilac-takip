import type { Plugin } from '@capacitor/core';

export interface CanScheduleResult {
  /** AlarmManager.canScheduleExactAlarms() sonucunun aynasi. */
  canSchedule: boolean;
  /** Izin istenmesi gerektigini belirtir (canSchedule === false). */
  needsPermission: boolean;
}

export interface ExactAlarmPlugin {
  /**
   * Android 12+ (API 31) uzerinde SCHEDULE_EXACT_ALARM izni kontrol eder.
   * API 30 ve altinda her zaman canSchedule=true doner (izin gerekmez).
   */
  canSchedule(): Promise<CanScheduleResult>;
  /**
   * Izin eksikse kullaniciyi DOGRUDAN "Tam zamanli alarm" ayar sayfasina gonderir
   * (Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM). Tek dokunuşla "Izinle"
   * denilebilir. API 30 ve altinda no-op.
   */
  request(): Promise<void>;
}

export declare const ExactAlarm: Plugin<ExactAlarmPlugin, {}>;
