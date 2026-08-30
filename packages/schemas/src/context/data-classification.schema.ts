import { DATA_CLASSIFICATIONS, type DataClassification } from '@aurora/contracts/context';
import { createRuntimeSchema } from './internal';

const DATA_CLASSIFICATION_SET = new Set<string>(DATA_CLASSIFICATIONS);

export const DataClassificationSchema = createRuntimeSchema<DataClassification>(
  (value: unknown) => {
    if (typeof value !== 'string' || !DATA_CLASSIFICATION_SET.has(value)) {
      throw new TypeError('DataClassification is invalid');
    }
    return value as DataClassification;
  },
);
