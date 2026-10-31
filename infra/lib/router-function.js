// CloudFront Function (viewer request), cloudfront-js-2.0.
// Serves the simulation at the root of the domain. The shell fallback is deliberately narrow:
// only "/" and /open/... deep links get index.html; every other path is passed through unchanged,
// so a missing asset is a 404 (the static 404 page), never a copy of the shell. The old
// /time-machine/ addresses redirect permanently to the same path at the root.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === '/time-machine' || uri.indexOf('/time-machine/') === 0) {
    var rest = uri.substring('/time-machine'.length) || '/';
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: rest } },
    };
  }
  if (uri === '/' || uri.indexOf('/open/') === 0) {
    request.uri = '/index.html';
  }
  return request;
}
