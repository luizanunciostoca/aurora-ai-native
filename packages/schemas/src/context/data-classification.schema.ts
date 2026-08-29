import {
  DATA_CLASSIFICATIONS,
  type DataClassification,
} from '../../../contracts/src/context/data-classification.js';
import { createRuntimeSchema } from './internal.js';

const DATA_CLASSIFICATION_SET = new Set<string>(DATA_CLASSIFICATIONS);

export const DataClassificationSchema = createRuntimeSchema<DataClassification>(
  (value: unknown) => {
    if (typeof value !== 'string' || !DATA_CLASSIFICATION_SET.has(value)) {
      throw new TypeError('DataClassification is invalid');
    }
    return value as DataClassification;
  },
);
