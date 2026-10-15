const { registerOnlinePage } = require('./feishu-online');

const START_URL = 'https://geelib.qihoo.net/geelib/knowledge/doc?spaceId=4632&docId=458853';
const REPO_URL = 'https://geelib.qihoo.net/geelib/repoOverview?repoId=saas-lobster-go-crawler/med-ai-demo';
// Only the knowledge site and the observed corporate sign-in hosts may navigate.
function isGeelibUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const ports = {
      'geelib.qihoo.net': ['', '443'],
      'login.ops.qihoo.net': ['', '443', '4436'],
      'sec.corp.qihoo.net': ['', '443'],
    };
    return !!ports[url.hostname]?.includes(url.port);
  } catch { return false; }
}
function isLibraryRoute(value) {
  try { return ['#/library/team', '#/library/repository'].includes(new URL(value).hash.split('?')[0]); }
  catch { return false; }
}
function urlsForRoute(value) {
  return { original: new URL(value).hash.split('?')[0] === '#/library/repository' ? REPO_URL : START_URL };
}
function registerGeelibOnline(options) {
  return registerOnlinePage(options, {
    channel: 'geelib-online', label: '极库云',
    urls: { original: START_URL }, getUrls: urlsForRoute, isUrl: isGeelibUrl, isRoute: isLibraryRoute,
    partition: 'persist:geelib-online',
  });
}
module.exports = { registerGeelibOnline, isGeelibUrl, isLibraryRoute, urlsForRoute, START_URL, REPO_URL };
