export interface ExactAlarmPlugin {
  canScheduleExactAlarms(): Promise<{ value: boolean }>;
  requestScheduleExactAlarm(): Promise<{ value: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
}
