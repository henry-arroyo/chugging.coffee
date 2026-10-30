// CloudFront Function (viewer request), cloudfront-js-2.0.
// Serves the simulation only under /time-machine/. The shell fallback is deliberately narrow:
// the folder root and /time-machine/open/... deep links get index.html; every other path is
// passed through unchanged, so a missing asset is a 404, never a copy of the shell.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === '/time-machine') {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: '/time-machine/' } },
    };
  }
  if (uri.indexOf('/time-machine/') !== 0) {
    return { statusCode: 404, statusDescription: 'Not Found' };
  }
  if (uri === '/time-machine/' || uri.indexOf('/time-machine/open/') === 0) {
    request.uri = '/time-machine/index.html';
  }
  return request;
}
