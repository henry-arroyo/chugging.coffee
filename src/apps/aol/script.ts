/**
 * The service's fictional, scripted content: seeded mail and a re-created chat room. None of these
 * people exist, nobody else reads what the guest types, and nothing leaves the browser.
 */
export interface Letter {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
}

export function seededMail(screenName: string): Letter[] {
  return [
    {
      id: 'welcome',
      from: 'AOL Staff',
      subject: 'Welcome to the service!',
      date: '11/30/95',
      body: `Dear ${screenName},\n\nWelcome aboard! Use the Keyword button to jump straight to an area: try NEWS, CHAT or COFFEE.\n\nThe Internet Connection area opens the World Wide Web. Sites end in .test on this network.\n\nSee you online!\nAOL Staff`,
    },
    {
      id: 'dot',
      from: 'DotChugs',
      subject: 'our menu is on the Web!!',
      date: '12/01/95',
      body: `Hi ${screenName}!\n\nIt's Dot from Chugging Coffee House. My nephew helped me put our whole menu on the World Wide Web. Can you believe it?\n\nGo to keyword COFFEE, or type http://chugging.test/ in Netscape.\n\nFirst refill's on me.\n-- Dot`,
    },
    {
      id: 'packet',
      from: 'PacketDesk',
      subject: 'The Packet: December edition',
      date: '12/01/95',
      body: `The Packet, your neighborhood paper, is now online at http://packet.test/\n\nThis month: the coffee house goes digital, and the library wants modem lines.\n\n(You are receiving this because you joined the Packet mailing list.)`,
    },
  ];
}

/** Text styles a member can pick, from a fixed palette (no free-form styling). */
export interface ChatStyle {
  color?: 'black' | 'navy' | 'blue' | 'red' | 'maroon' | 'green' | 'purple' | 'teal';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  font?: 'sans' | 'serif' | 'comic';
}

export interface ChatLine {
  who: string;
  text: string;
  style?: ChatStyle;
}

/** How each fictional member types. */
export const MEMBER_STYLES: Record<string, ChatStyle> = {
  OnlineHost: {},
  ModemMike: { color: 'navy', bold: true, font: 'serif' },
  JavaJen: { color: 'maroon', font: 'serif' },
  BookwormB: { color: 'green', italic: true },
  SurfDude95: { color: 'purple', bold: true, font: 'comic' },
  'Guide Pixel': { color: 'teal' },
  NetNanaRuth: { color: 'red', font: 'serif' },
};

/** Who is in the room besides the guest (a few never speak, as in any real room). */
export const LOBBY_MEMBERS = ['BookwormB', 'Guide Pixel', 'JavaJen', 'ModemMike', 'NetNanaRuth', 'PizzaPete44', 'QuietQuilter', 'SurfDude95', 'TrekFan1701', 'Zipdisk Zed'];

/** Fictional member profiles, shown on double-click. */
export const PROFILES: Record<string, string> = {
  BookwormB: 'Location: the library, mostly\nHobbies: mysteries, crosswords',
  'Guide Pixel': 'AOL Community Guide (fictional)\nHere to help in the Lobby',
  JavaJen: 'Location: downtown\nHobbies: coffee, more coffee',
  ModemMike: 'Computers: 486DX2/66, 28.8 modem\nQuote: "faster is better"',
  NetNanaRuth: 'Grandmother of six, new to computers\nHobbies: quilting, e-mail',
  SurfDude95: 'Hobbies: the Web, skateboarding\nQuote: "cowabunga"',
};

/** Lines the room's fictional members say, in a loop. */
export const LOBBY_SCRIPT: ChatLine[] = [
  { who: 'OnlineHost', text: 'Welcome to the Lobby! This room is scripted: its members are fictional.' },
  { who: 'ModemMike', text: 'finally got my 28.8 working, it SCREAMS' },
  { who: 'JavaJen', text: 'anyone tried the new coffee place downtown?' },
  { who: 'ModemMike', text: 'chugging? yeah their menu is on the web now' },
  { who: 'BookwormB', text: 'the library is getting modem lines, saw it in the Packet' },
  { who: 'JavaJen', text: 'keyword COFFEE goes right to it :)' },
  { who: 'SurfDude95', text: 'a/s/l? jk jk' },
  { who: 'BookwormB', text: 'Switchboard has a directory of all the sites btw' },
  { who: 'ModemMike', text: 'brb mom needs the phone line' },
  { who: 'JavaJen', text: 'lol classic' },
  { who: 'SurfDude95', text: 'netscape 2 beta is out, it has frames now' },
  { who: 'BookwormB', text: 'what is a frame' },
  { who: 'SurfDude95', text: 'nobody knows' },
  { who: 'OnlineHost', text: 'NetNanaRuth has entered the room.' },
  { who: 'NetNanaRuth', text: 'HELLO EVERYONE IS THIS THE LOBBY' },
  { who: 'Guide Pixel', text: 'Welcome, Ruth! Yes it is. Your caps lock is on :)' },
  { who: 'NetNanaRuth', text: 'oh dear. thank you dear' },
];
