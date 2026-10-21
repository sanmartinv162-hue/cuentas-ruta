/** Esquema inicial conservado para que Dexie pueda aplicar upgrades posteriores. */
export const schemaV1 = {
  settings: '&id,createdAt,updatedAt',
  personalMovements: '&id,date,description,detectedCategory,type,paymentMethod,createdAt,updatedAt,deletedAt,[date+type],[paymentMethod+date]',
  businessMovements: '&id,journeyId,date,description,detectedCategory,type,paymentMethod,createdAt,updatedAt,deletedAt,[date+type],[journeyId+date],[paymentMethod+date]',
  journeys: '&id,startTime,endTime,status,createdAt,updatedAt,deletedAt',
  savings: '&id,type,date,description,createdAt,updatedAt,deletedAt',
  capital: '&id,updatedAt',
  dailyGoals: '&id,date,completed',
  classificationRules: '&id,keyword,category,createdAt',
  metadata: '&key',
} as const;

/** Esquema actual: índices de consulta y campos listos para sincronización. */
export const schemaV2 = {
  ...schemaV1,
  personalMovements: `${schemaV1.personalMovements},version,synced,syncVersion,deviceId`,
  businessMovements: `${schemaV1.businessMovements},version,synced,syncVersion,deviceId`,
} as const;

export const schemaV3 = {
  ...schemaV2,
  personalMovements: `${schemaV2.personalMovements},accountId,[accountId+date]`,
  businessMovements: `${schemaV2.businessMovements},accountId,[accountId+date]`,
  accounts: '&id,[module+name],module,name,createdAt,updatedAt,deletedAt',
  transfers: '&id,module,date,sourceAccountId,destinationAccountId,createdAt,updatedAt,deletedAt,[module+date],[module+sourceAccountId+date],[module+destinationAccountId+date]',
} as const;

export const schemaV4 = {
  ...schemaV3,
  accounts: '&id,&[module+normalizedName],[module+name],module,name,normalizedName,createdAt,updatedAt,deletedAt',
} as const;

export const schemaV5 = {
  ...schemaV4,
  accounts: '&id,&[module+name],&[module+normalizedName],module,name,normalizedName,createdAt,updatedAt,deletedAt',
} as const;

export const DATABASE_NAME = 'FinanceAssistantDB';
export const CURRENT_DATABASE_VERSION = 5;
