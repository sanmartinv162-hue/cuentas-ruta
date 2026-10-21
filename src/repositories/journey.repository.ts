import { db, type FinanceAssistantDatabase } from '../database/db';
import { journeySchema } from '../models/journey';
import type { JourneyRecord } from '../types/database';
import { BaseRepository } from './base.repository';

export class JourneyRepository extends BaseRepository<JourneyRecord> {
  constructor(database: FinanceAssistantDatabase = db) {
    super(database.journeys, journeySchema, {
      dateField: 'startTime',
      searchableFields: ['id', 'status', 'startTime', 'endTime'],
    });
  }
}

export const journeyRepository = new JourneyRepository();
