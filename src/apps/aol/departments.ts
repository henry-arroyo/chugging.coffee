/** Main Menu departments. Fictional copy; links go to the release's fictional sites or AOL areas. */
export interface Department {
  id: string;
  title: string;
  banner: string;
  /** Where the button goes instead of the department window. */
  opens?: { area: 'news' | 'chat' | 'internet' | 'mail' } | { web: string };
  blurb?: string;
  links?: { label: string; web?: string; area?: 'news' | 'chat' | 'internet' | 'mail' | 'games' }[];
}

/** Two columns, top to bottom, as on the AOL 2.5 Main Menu. */
export const DEPARTMENTS: Department[][] = [
  [
    { id: 'news', title: "Today's News", banner: 'aol.dept-news', opens: { area: 'news' } },
    { id: 'finance', title: 'Personal Finance', banner: 'aol.dept-finance', blurb: 'Quotes are delayed at least 15 minutes. Tonight the board is quiet: the markets closed for the weekend.' },
    {
      id: 'clubs',
      title: 'Clubs & Interests',
      banner: 'aol.dept-clubs',
      blurb: 'Members who share a hobby meet here.',
      links: [{ label: 'Coffee Lovers (Chugging Coffee House)', web: 'http://chugging.test/' }],
    },
    { id: 'computing', title: 'Computing', banner: 'aol.dept-computing', blurb: 'Software libraries, help desks and the latest Windows 95 tips.', links: [{ label: 'Play a game while you wait', area: 'games' }] },
    { id: 'travel', title: 'Travel', banner: 'aol.dept-travel', blurb: 'Holiday fares are posted on the first of the month. Check back soon.' },
    { id: 'marketplace', title: 'Marketplace', banner: 'aol.dept-marketplace', blurb: 'The shops are closed tonight. Nothing on this service ever costs money.' },
    { id: 'people', title: 'People Connection', banner: 'aol.dept-people', opens: { area: 'chat' } },
  ],
  [
    { id: 'newsstand', title: 'Newsstand', banner: 'aol.dept-newsstand', opens: { web: 'http://packet.test/' } },
    { id: 'entertainment', title: 'Entertainment', banner: 'aol.dept-entertainment', blurb: 'Movie listings, music news and the critics. The December issue is on its way.' },
    { id: 'education', title: 'Education', banner: 'aol.dept-education', blurb: 'Homework help, encyclopedias and the library. The city library is getting modem lines.', links: [{ label: 'Read about the library in The Packet', web: 'http://packet.test/' }] },
    { id: 'reference', title: 'Reference Desk', banner: 'aol.dept-reference', opens: { web: 'http://switchboard.test/' } },
    { id: 'internet', title: 'Internet Connection', banner: 'aol.dept-internet', opens: { area: 'internet' } },
    { id: 'sports', title: 'Sports', banner: 'aol.dept-sports', blurb: 'Scores and standings. The weekend games have not started yet.' },
    { id: 'kids', title: 'Kids Only', banner: 'aol.dept-kids', blurb: 'Games, homework help and clubs for kids.', links: [{ label: 'Play Solitaire or Minesweeper', area: 'games' }] },
  ],
];

export const ALL_DEPARTMENTS = DEPARTMENTS.flat();
