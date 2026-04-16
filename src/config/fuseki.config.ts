import { registerAs } from '@nestjs/config';
import z from 'zod';

export const FusekiConfigSchema = z.object({
  /**
   * The URL of the Fuseki SPARQL endpoint to query against.
   */
  FUSEKI_ENDPOINT: z.url(),

  /**
   * The username for Fuseki HTTP Basic Auth.
   */
  FUSEKI_USERNAME: z.string().optional(),

  /**
   * The password for Fuseki HTTP Basic Auth.
   */
  FUSEKI_PASSWORD: z.string().optional(),
});

export const FUSEKI_CONFIG_KEY = Symbol('app:config:fuseki');

export type FusekiConfig = z.infer<typeof FusekiConfigSchema>;

export default registerAs(
  FUSEKI_CONFIG_KEY,
  (): FusekiConfig =>
    FusekiConfigSchema.parse({
      FUSEKI_ENDPOINT: process.env.FUSEKI_ENDPOINT,
      FUSEKI_USERNAME: process.env.FUSEKI_USERNAME,
      FUSEKI_PASSWORD: process.env.FUSEKI_PASSWORD,
    }),
);
