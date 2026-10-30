import type { NavError } from '../../content/network';
import type { PageDocument } from '../../core/contracts/types';

/** Netscape's alert text for a failed load, or null when the error is shown another way. */
export function navErrorText(error: NavError): string | null {
  switch (error.kind) {
    case 'offline':
      return 'Netscape is unable to locate the server.\n\nYou are not connected. Sign on to America Online, then try again.';
    case 'unknown-host':
      return `Netscape is unable to locate the server: ${error.host}\nThe server does not have a DNS entry.\n\nCheck the server name in the Location (URL) and try again.`;
    case 'redirect-loop':
      return 'Netscape has detected a redirection loop. The document could not be loaded.';
    case 'keyword':
      return `"${error.keyword}" is an America Online keyword. Use the Keyword button in America Online to go there.`;
    case 'world':
      return `Netscape was unable to load the document.\n\n${error.message}`;
    case 'address':
      switch (error.error) {
        case 'real-internet':
          return 'This copy of Netscape can only visit the 1995 Web of the Time Machine: addresses ending in .test, such as http://switchboard.test/';
        case 'unsupported-scheme':
          return 'This protocol is not supported. Netscape here understands only http:// addresses ending in .test.';
        case 'credentials':
        case 'port':
          return 'Netscape cannot open addresses with a user name, password or port number.';
        case 'too-long':
          return 'The location is too long.';
        case 'empty':
          return null;
        default:
          return 'The location is not a valid address. Check it and try again.';
      }
    case 'not-found':
    case 'disconnected':
      return null;
  }
}

/** The server's own "Not Found" page, as a 1995 web server sent it. */
export function notFoundPage(path: string): PageDocument {
  return {
    schemaVersion: 1,
    pageId: 'error-404',
    siteId: 'error',
    path,
    title: '404 Not Found',
    layout: 'plain',
    theme: { background: '#ffffff', font: 'serif' },
    blocks: [
      { type: 'heading', level: 1, text: 'Not Found' },
      { type: 'paragraph', content: [{ type: 'text', text: `The requested URL ${path} was not found on this server.` }] },
    ],
  };
}
