import { v4 as uuid } from 'uuid';
import { dailyGoalRepository, type DailyGoalRepository } from '../repositories/dailyGoal.repository';
import { businessMovementRepository, type BusinessMovementRepository } from '../repositories/business.repository';
import { settingsService, type SettingsService } from './settings.service';
import { executeService, ServiceError, unwrapServiceResult, type ServiceResult } from './serviceResult';
import type { DailyGoalRecord } from '../types/database';

export interface DailyGoalSnapshot extends DailyGoalRecord {
  excess: number;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export class DailyGoalService {
  constructor(
    private readonly goals: DailyGoalRepository = dailyGoalRepository,
    private readonly business: BusinessMovementRepository = businessMovementRepository,
    private readonly settings: SettingsService = settingsService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  calculate(date = this.now()): Promise<ServiceResult<DailyGoalSnapshot>> {
    return executeService('dailyGoal.calculate', async () => {
      if (Number.isNaN(date.getTime())) throw new ServiceError('VALIDATION', 'La fecha de la meta no es válida.');
      const dateKey = localDateKey(date);
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      end.setMilliseconds(end.getMilliseconds() - 1);
      const [settings, movements, existing] = await Promise.all([
        this.settings.get().then(unwrapServiceResult),
        this.business.findBetweenDates(start.toISOString(), end.toISOString()),
        this.goals.findByDate(dateKey),
      ]);
      const income = movements
        .filter((movement) => movement.type === 'income')
        .reduce((sum, movement) => sum + movement.amount, 0);
      const goal = settings.dailyGoal;
      const current = income;
      const record: DailyGoalRecord = {
        id: existing[0]?.id ?? uuid(),
        goal,
        current,
        remaining: Math.max(goal - current, 0),
        percentage: Math.min(current / goal * 100, 100),
        completed: current >= goal,
        date: dateKey,
        deletedAt: null,
      };
      const saved = existing[0]
        ? await this.goals.update(existing[0].id, record)
        : await this.goals.create(record);
      return { ...saved, excess: Math.max(current - goal, 0) };
    });
  }

  estimateRemainingDeliveries(remaining: number, averageIncomePerDelivery: number): number | null {
    if (!Number.isFinite(remaining) || !Number.isFinite(averageIncomePerDelivery) || remaining <= 0 || averageIncomePerDelivery <= 0) return null;
    return Math.ceil(remaining / averageIncomePerDelivery);
  }
}

export const dailyGoalService = new DailyGoalService();
