import { z } from 'zod';
import { citySchema } from './city';

export * from './common';
export * from './city';

/**
 * Every content type: the folder under src/content that holds its YAML files
 * and the schema each file must match. Adding a content type means adding a
 * schema and one entry here.
 */
export const contentTypes = {
  cities: { folder: 'cities', schema: citySchema },
} as const;

export type ContentTypeKey = keyof typeof contentTypes;

export const contentBundleSchema = z.strictObject({
  contentVersion: z.string().min(1),
  cities: z.record(z.string(), citySchema),
});

/** The compiled, validated content the app loads at runtime. */
export type ContentBundle = z.infer<typeof contentBundleSchema>;
