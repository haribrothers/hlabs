// Home (04-home.md). Sentence case, plain words.
export const homeCopy = {
  title: 'hlabs — Home',
  greeting: {
    morning: (name: string) => `Good morning, ${name}`,
    afternoon: (name: string) => `Good afternoon, ${name}`,
    evening: (name: string) => `Good evening, ${name}`,
  },
} as const;
