import { db, type FinanceAssistantDatabase } from '../database/db';
import { personalMovementSchema } from '../models/personalMovement';
import type { PersonalMovementRecord } from '../types/database';
import { BaseRepository } from './base.repository';

export class PersonalMovementRepository extends BaseRepository<PersonalMovementRecord> {
  constructor(database: FinanceAssistantDatabase = db) {
    super(database.personalMovements, personalMovementSchema, {
      dateField: 'date',
      descriptionField: 'description',
      searchableFields: ['description', 'paymentMethod', 'detectedCategory', 'type', 'id'],
    });
  }
}

export const personalMovementRepository = new PersonalMovementRepository();
