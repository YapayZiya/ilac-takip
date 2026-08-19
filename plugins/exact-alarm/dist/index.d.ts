import type { Plugin } from '@capacitor/core';

export interface CanScheduleResult {
  canSchedule: boolean;
  needsPermission: boolean;
  exactAlarmRequired: boolean;
  canNotify: boolean;
  needsNotifyPermission: boolean;
}

export interface ExactAlarmPlugin {
  canSchedule(): Promise<CanScheduleResult>;
  request(): Promise<void>;
  requestNotifyPermission(): Promise<{ requested: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<{ opened: boolean }>;
}

export declare const ExactAlarm: Plugin<ExactAlarmPlugin, {}>;
