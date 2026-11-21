// hlabs website, help and developer docs (D-055, D-123): static Astro + Starlight. Content arrives in phase 6.
// No analytics, cookies or third-party scripts.
import starlight from '@astrojs/starlight';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://hlabs.h4loom.com', // SITE_URL (D-139)
  integrations: [
    starlight({
      title: 'hlabs',
      customCss: ['./src/styles/site.css'],
      // Two sections with a sidebar each (D-123): Help for people using hlabs, Developers for people working on it.
      plugins: [
        starlightSidebarTopics(
          [
            {
              id: 'help',
              label: 'Help',
              link: '/help/',
              icon: 'information',
              items: [
                {
                  label: 'Get started',
                  items: [
                    { label: 'Welcome', link: '/help/' },
                    { label: 'Set up hlabs', link: '/help/get-started/set-up/' },
                    { label: 'Install on a Mac', link: '/help/get-started/install-mac/' },
                    { label: 'Install on a Linux server', link: '/help/get-started/install-linux/' },
                    { label: 'Install on a Linux desktop', link: '/help/get-started/install-linux-desktop/' },
                    { label: 'Uninstall hlabs', link: '/help/get-started/uninstall/' },
                    { label: 'Log in', link: '/help/get-started/log-in/' },
                    { label: 'Your Home screen', link: '/help/get-started/home/' },
                    { label: 'Settings', link: '/help/get-started/settings/' },
                    { label: 'Engine and startup', link: '/help/get-started/engine/' },
                    { label: 'The menu-bar app', link: '/help/get-started/menu-bar/' },
                    { label: 'Live usage', link: '/help/get-started/live-usage/' },
                    { label: 'Update hlabs', link: '/help/get-started/updates/' },
                    { label: "Can't reach hlabs", link: '/help/get-started/cant-reach/' },
                    { label: 'Use hlabs as an app', link: '/help/get-started/use-as-app/' },
                    { label: 'Confirmations and notices', link: '/help/get-started/confirmations/' },
                  ],
                },
                {
                  label: 'Apps',
                  items: [
                    { label: 'The App Store', link: '/help/apps/app-store/' },
                    { label: 'Manage an app', link: '/help/apps/manage-apps/' },
                  ],
                },
                {
                  label: 'Files',
                  items: [{ label: 'Your files', link: '/help/files/files/' }],
                },
                {
                  label: 'Backups',
                  items: [{ label: 'Back up and restore', link: '/help/backups/backups/' }],
                },
                {
                  label: 'Remote access',
                  items: [
                    { label: 'How to reach hlabs', link: '/help/remote-access/addresses/' },
                    { label: 'Use your own DNS server', link: '/help/remote-access/dns-server/' },
                    { label: 'Reach hlabs from anywhere', link: '/help/remote-access/tailscale/' },
                    { label: 'Reach hlabs through a subnet router', link: '/help/remote-access/subnet-router/' },
                    { label: 'Add family to your tailnet', link: '/help/remote-access/family/' },
                  ],
                },
                {
                  label: 'People and family',
                  items: [{ label: 'People who use hlabs', link: '/help/people/people/' }],
                },
              ],
            },
            {
              id: 'developers',
              label: 'Developers',
              link: '/developers/',
              icon: 'seti:config',
              items: [
                { label: 'Overview', link: '/developers/' },
                { label: 'Getting started', link: '/developers/getting-started/' },
                { label: 'The menu-bar app', link: '/developers/menu-bar-app/' },
                { label: 'Building the app', link: '/developers/building/' },
                { label: 'Updates and signing', link: '/developers/updates-and-signing/' },
                { label: 'Releasing', link: '/developers/releasing/' },
                { label: 'Troubleshooting', link: '/developers/troubleshooting/' },
              ],
            },
            // Pages not in a sidebar (linked from others) belong to their section all the same.
          ],
          { topics: { help: ['/help/**/*'], developers: ['/developers/**/*'] } },
        ),
      ],
    }),
  ],
});
