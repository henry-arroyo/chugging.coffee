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

export interface ChatLine {
  who: string;
  text: string;
}

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
];
