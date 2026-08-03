export const ACTION_TEXT = {
  shortlist: 'Add to shortlist',
  shortlisted: 'Shortlisted',
  viewShortlist: 'View shortlist',
  returnToDashboard: 'Return to dashboard',
  finishProfile: 'Finish profile',
  viewCourse: 'View Course',
  share: 'Share',
  adjustPreferences: 'Adjust preferences',
  updateAcademics: 'Update academics'
} as const;

export const MATCHES_TEXT = {
  hero: {
    eyebrow: 'Your matches',
    title: 'Programs that look like you',
    description: 'Ranked by what fits — your grades, what you want to study, where you want to be, and your odds of getting in.',
    highlight: 'Personalized for you'
  },
  profileIncomplete: {
    title: 'Tell us a bit more, then we’ll match you',
    description: 'Finish your profile and we can rank programs by your grades, your budget, and what you actually want.',
    emptyMessage: 'Finish your profile to see programs that fit you.',
    highlight: 'A few details missing'
  },
  catalogUnavailable: 'We couldn’t pull the program list just now. Try again in a moment.',
  emptyState: {
    title: 'Nothing here yet',
    description: 'Try widening your budget, adding a country or two, or updating your scores — that usually unlocks a few options.'
  },
  topSnapshot: {
    eyebrow: 'Top fit snapshot',
    scoreLabel: 'Admit probability'
  },
  list: {
    headerEyebrow: 'Matches',
    noResults: 'No matches available.'
  },
  tierDescriptions: {
    Reach: 'Highly competitive programs where admission is a stretch — strong options if your application stands out.',
    Match: 'Programs where your IB score and profile align well with typical admitted students.',
    Safe: 'Programs where you comfortably exceed entry requirements — high confidence of admission.'
  }
} as const;
