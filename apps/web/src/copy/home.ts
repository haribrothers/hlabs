// Home (04-home.md). Sentence case, plain words.
export const homeCopy = {
  title: 'hlabs — Home',
  widgets: 'Widgets',
  storage: 'Storage',
  leftOf: (total: string) => `left of ${total}`,
  apps: 'Apps',
  system: 'System',
  couldntLoad: "Couldn't load",
  retry: 'Try again',
  greeting: {
    morning: (name: string) => `Good morning, ${name}`,
    afternoon: (name: string) => `Good afternoon, ${name}`,
    evening: (name: string) => `Good evening, ${name}`,
  },
} as const;
