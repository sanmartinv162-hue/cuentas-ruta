import type { AppSettings, LedgerSpace } from '../types';

const rules: Record<LedgerSpace, [string, string[]][]> = {
  personal: [
    ['Alimentación', ['mercado', 'comida', 'restaurante', 'almuerzo', 'cena', 'supermercado']],
    ['Educación', ['universidad', 'matricula', 'colegio', 'curso', 'libro']],
    ['Compras', ['zapato', 'ropa', 'camisa', 'pantalon', 'compra']],
    ['Transporte', ['taxi', 'bus', 'transporte', 'pasaje', 'metro']],
    ['Vivienda', ['arriendo', 'alquiler', 'servicio', 'recibo']],
    ['Salud', ['medico', 'medicina', 'farmacia', 'consulta', 'odontologo']],
  ],
  deliveries: [
    ['Gasolina', ['gasolina', 'combustible', 'tanqueo', 'corriente']],
    ['Mantenimiento', ['mantenimiento', 'aceite', 'revision', 'lavada', 'tecnico']],
    ['Repuestos', ['repuesto', 'llanta', 'cadena', 'freno', 'bujia']],
    ['Otros gastos de moto', ['moto', 'parqueadero', 'peaje', 'casco']],
  ],
};

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CO');
}

export function classifyDescription(description: string, space: LedgerSpace, settings: AppSettings): string | null {
  const normalized = normalize(description);
  const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const learned = settings.learnedCategories[space];
  for (const token of tokens) {
    if (learned[token]) return learned[token];
  }
  for (const [category, keywords] of rules[space]) {
    if (keywords.some((keyword) => tokens.some((token) => token.includes(keyword) || keyword.includes(token)))) return category;
  }
  return null;
}

export function learnCategory(settings: AppSettings, space: LedgerSpace, description: string, category: string): AppSettings {
  const cleanCategory = category.trim();
  if (!cleanCategory) return settings;
  const tokens = normalize(description).split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const learned = { ...settings.learnedCategories[space] };
  for (const token of tokens) learned[token] = cleanCategory;
  return { ...settings, learnedCategories: { ...settings.learnedCategories, [space]: learned } };
}
