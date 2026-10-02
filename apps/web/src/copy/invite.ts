// AcceptInvite (03-sign-in.md F-AUTH-09): the page an invite link opens.
export const inviteCopy = {
  docTitle: 'Join hlabs',
  invitedYou: (inviter: string) => `${inviter} invited you to`,
  someoneInvitedYou: "You've been invited to",
  product: 'hlabs · home cloud',
  title: 'Create your account',
  youGet: "You'll get your own Home screen and a private Files folder.",
  shared: (inviter: string, n: number) => `${inviter} has shared ${n === 1 ? '1 app' : `${n} apps`} with you.`,
  youreAdmin: "You'll be an admin and can open every app.",
  invalidTitle: "This invite doesn't work anymore",
  askFor: (inviter: string | null) => `Ask ${inviter ?? 'your admin'} for a new link.`,
  goToLogIn: 'Go to log in',
  loggedInAs: (username: string) => `You're logged in as @${username}.`,
  logOutAndContinue: 'Log out and continue',
  loadFailed: "Couldn't open this invite. Check your connection and try again.",
  tryAgain: 'Try again',
} as const;
