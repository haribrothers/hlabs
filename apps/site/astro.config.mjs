// hlabs website, help and developer docs (D-055, D-123): static Astro + Starlight. Content arrives in phase 6.
// No analytics, cookies or third-party scripts.
import starlight from '@astrojs/starlight';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://hlabs.h4loom.com', // SITE_URL (D-139)
  // Until the home page (phase 6 step 6, part c), the site's address opens the help.
  redirects: { '/': '/help/' },
  integrations: [
    starlight({
      title: 'hlabs',
      customCss: ['./src/styles/site.css'],
      // US-SITE-07: "Last updated" from git, an edit link, and previous/next (Starlight's own).
      lastUpdated: true,
      editLink: { baseUrl: 'https://github.com/haribrothers/hlabs/edit/main/apps/site/' },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/haribrothers/hlabs' }],
      // Two sections with a sidebar each (D-123): Help for people using hlabs, Developers for people working on it.
      plugins: [
        starlightSidebarTopics(
          [
            {
              id: 'help',
              label: 'Help',
              link: '/help/',
              icon: 'information',
              // US-SITE-07: organised like the product.
              items: [
                {
                  label: 'Get started',
                  items: [
                    { label: 'Welcome', link: '/help/' },
                    { label: 'Set up hlabs', link: '/help/get-started/set-up/' },
                    { label: 'Log in', link: '/help/get-started/log-in/' },
                    { label: 'Trust this device', link: '/help/get-started/trust-device/' },
                    { label: 'Use hlabs as an app', link: '/help/get-started/use-as-app/' },
                    { label: 'Confirmations and notices', link: '/help/get-started/confirmations/' },
                  ],
                },
                {
                  label: 'Install',
                  items: [
                    { label: 'Install on a Mac', link: '/help/install/mac/' },
                    { label: 'Install on a Linux server', link: '/help/install/linux-server/' },
                    { label: 'Install on a Linux desktop', link: '/help/install/linux-desktop/' },
                    { label: 'Uninstall hlabs', link: '/help/install/uninstall/' },
                  ],
                },
                {
                  label: 'Home and the Dock',
                  items: [
                    { label: 'Your Home screen', link: '/help/get-started/home/' },
                    { label: 'Live usage', link: '/help/get-started/live-usage/' },
                  ],
                },
                {
                  label: 'Apps and the App Store',
                  items: [
                    { label: 'The App Store', link: '/help/apps/app-store/' },
                    { label: 'Manage an app', link: '/help/apps/manage-apps/' },
                  ],
                },
                { label: 'Files', items: [{ label: 'Your files', link: '/help/files/files/' }] },
                {
                  label: 'Backups and restore',
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
                {
                  label: 'Settings',
                  items: [
                    { label: 'Settings', link: '/help/get-started/settings/' },
                    { label: 'Engine and startup', link: '/help/get-started/engine/' },
                    { label: 'Update hlabs', link: '/help/get-started/updates/' },
                  ],
                },
                { label: 'Menu-bar app', items: [{ label: 'The menu-bar app', link: '/help/get-started/menu-bar/' }] },
                {
                  label: 'Troubleshooting',
                  items: [
                    { label: "Can't reach hlabs", link: '/help/get-started/cant-reach/' },
                    { label: 'The container engine stopped', link: '/help/troubleshooting/engine-stopped/' },
                    { label: 'An update rolled back', link: '/help/troubleshooting/update-rolled-back/' },
                    { label: 'Your browser warns about the connection', link: '/help/troubleshooting/certificate/' },
                    { label: "Another program is using hlabs's port", link: '/help/troubleshooting/port-in-use/' },
                    { label: 'Out of disk space', link: '/help/troubleshooting/disk-full/' },
                    { label: "A network drive can't be reached", link: '/help/troubleshooting/nas-unreachable/' },
                    { label: 'Error messages', link: '/help/errors/' },
                  ],
                },
                {
                  label: 'Reference',
                  items: [
                    { label: 'The hlabs command', link: '/help/reference/cli/' },
                    { label: 'App manifest', link: '/help/reference/app-manifest/' },
                  ],
                },
                { label: 'Questions people ask', link: '/help/faq/' },
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
