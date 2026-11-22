import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

export const collections = {
  // `features` lists the docs/features ids a help page covers (US-SITE-07).
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({ extend: z.object({ features: z.array(z.string()).optional() }) }),
  }),
  // Starlight's words, where the help says something its own way (US-SITE-08's "No results").
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
  // Release notes, written by hand before tagging (D-146, D-147): <version>.md with sections New, Improved, Fixed
  // and Before you update. The file name is the version; the channel follows from it.
  releases: defineCollection({
    // HLABS_SITE_RELEASE_NOTES points the site's tests at their own notes.
    loader: glob({
      base: process.env.HLABS_SITE_RELEASE_NOTES ?? './src/content/releases',
      pattern: '[0-9]*.md',
      // The id is the version as written ("0.6.0"), not a slug of it.
      generateId: ({ entry }) => entry.replace(/\.md$/, ''),
    }),
    schema: z.object({
      date: z.coerce.date(),
      /** One line about the release, shown as its heading ("hlabs <version>" without one). */
      title: z.string().min(1).optional(),
    }),
  }),
};
