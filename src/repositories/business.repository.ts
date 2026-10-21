import { db, type FinanceAssistantDatabase } from '../database/db';
import { businessMovementSchema } from '../models/businessMovement';
import type { BusinessMovementRecord } from '../types/database';
import { BaseRepository } from './base.repository';

export class BusinessMovementRepository extends BaseRepository<BusinessMovementRecord> {
  constructor(database: FinanceAssistantDatabase = db) {
    super(database.businessMovements, businessMovementSchema, {
      dateField: 'date',
      descriptionField: 'description',
      searchableFields: ['description', 'paymentMethod', 'detectedCategory', 'type', 'journeyId', 'id'],
    });
  }
}

export const businessMovementRepository = new BusinessMovementRepository();
