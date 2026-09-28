// hlabs website and help (D-055): static Astro + Starlight. Content arrives in phase 6.
// No analytics, cookies or third-party scripts.
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://hlabs.dev', // SITE_URL, to be confirmed (Q-07)
  integrations: [
    starlight({
      title: 'hlabs',
      customCss: ['./src/styles/site.css'],
      sidebar: [
        {
          label: 'Get started',
          items: [
            { label: 'Welcome', link: '/help/' },
            { label: 'Set up hlabs', link: '/help/get-started/set-up/' },
            { label: 'Log in', link: '/help/get-started/log-in/' },
            { label: 'Your Home screen', link: '/help/get-started/home/' },
            { label: 'Settings', link: '/help/get-started/settings/' },
          ],
        },
      ],
    }),
  ],
});
