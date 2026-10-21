import { db, type FinanceAssistantDatabase } from '../database/db';
import { dailyGoalSchema } from '../models/dailyGoal';
import type { DailyGoalRecord } from '../types/database';
import { BaseRepository } from './base.repository';

export class DailyGoalRepository extends BaseRepository<DailyGoalRecord> {
  constructor(database: FinanceAssistantDatabase = db) {
    super(database.dailyGoals, dailyGoalSchema, {
      dateField: 'date',
      searchableFields: ['date', 'id', 'completed'],
    });
  }
}

export const dailyGoalRepository = new DailyGoalRepository();
