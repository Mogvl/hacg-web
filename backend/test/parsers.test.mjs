// Parser unit tests against live-site fixtures (feature parity with yueeng/hacg jsoup parsers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  parseArticleList,
  parseArticleDetail,
  cleanHtml,
  transformEntryContent,
  extractMagnets,
} from '../src/article.js';
import { parseCommentList } from '../src/comment.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, 'fixtures', name), 'utf8');

test('parseArticleList: home page', () => {
  const html = fixture('list-home.html');
  const r = parseArticleList(html, 'https://www.hacg.icu/wp/');
  assert.equal(r.title, '琉璃神社 ★ HACG.me');
  assert.ok(r.articles.length >= 10, 'has articles');
  assert.equal(r.next, 'https://www.hacg.icu/wp/page/2');

  const a = r.articles.find((x) => x.id === 102867);
  assert.ok(a, 'found post-102867');
  assert.equal(a.title, '[ピンクパイナップル]デコ×デコ THE ANIMATION 第2巻「イエスマイキティ」');
  assert.equal(a.link, 'https://www.hacg.icu/wp/102867.html');
  assert.equal(a.image, 'https://1.hacg.pics/h3/26081803.jpg');
  assert.ok(a.content.includes('剧情无关'), 'excerpt extracted');
  assert.equal(a.time, '2026-08-18T18:56:19+08:00');
  assert.equal(a.author.name, '多啦H萌');
  assert.equal(a.author.url, 'https://www.hacg.icu/wp/author/acg-gy');
  assert.equal(a.category.name, '动画');
  assert.ok(a.tags.length >= 3, 'has tags');
});

test('parseArticleList: sticky avatar post gets empty image (placeholder)', () => {
  const html = fixture('list-home.html');
  const r = parseArticleList(html, 'https://www.hacg.icu/wp/');
  const sticky = r.articles.find((x) => x.id === 63117);
  assert.ok(sticky, 'found sticky post');
  assert.equal(sticky.image, '', 'avatar image → placeholder');
});

test('parseArticleDetail: content cleaning + lazy images + download links', () => {
  const html = fixture('detail-102867.html');
  const d = parseArticleDetail(html, 'https://www.hacg.icu/wp/102867.html');
  assert.ok(d.article);
  assert.equal(d.article.id, 102867);
  assert.ok(d.contentHtml.length > 0);
  assert.ok(d.contentHtml.includes('class="lazy"'), 'image becomes lazy');
  assert.ok(d.contentHtml.includes('data-original="https://1.hacg.pics/'), 'data-original set');
  assert.ok(d.contentHtml.includes("javascript:hacg.save('https://1.hacg.pics/"), 'save link added');
  assert.ok(!/width="|height="/.test(d.contentHtml), 'width/height stripped');
  assert.ok(!/<script/.test(d.contentHtml), 'no scripts');
  assert.ok(d.contentHtml.includes('https://www.hacg.icu/wp/102863.html'), 'relative link resolved');
  assert.ok(d.magnets.length >= 1, 'magnets extracted');
});

test('cleanHtml: jsoup Safelist parity', () => {
  const out = cleanHtml(
    '<div class="x"><script>bad()</script><style>a{}</style><p style="color:red"><a href="/wp/1.html" onclick="x()" target="_blank">link</a> <b>bold</b></p><iframe src="https://evil"></iframe><u>u</u></div>',
    'https://www.hacg.icu/wp/1.html'
  );
  assert.ok(!out.includes('script'), 'script dropped');
  assert.ok(!out.includes('style'), 'style dropped');
  assert.ok(!out.includes('iframe'), 'iframe unwrapped');
  assert.ok(!out.includes('onclick'), 'onclick dropped');
  assert.ok(!out.includes('target='), 'target dropped');
  assert.ok(!out.includes('color:red'), 'style attr dropped');
  assert.equal(out.match(/<a href="https:\/\/www\.hacg\.icu\/wp\/1\.html"[^>]*>/g)?.length, 1, 'href kept + resolved');
  assert.ok(out.includes('<b>bold</b>'), 'b kept');
  assert.ok(out.includes('<u>u</u>'), 'u kept');
});

test('cleanHtml: protocol filtering (javascript: dropped)', () => {
  const out = cleanHtml('<a href="javascript:alert(1)">x</a><img src="data:image/png;base64,AAAA">', 'https://a.b/');
  assert.ok(!out.includes('javascript:'), 'javascript href dropped');
  assert.ok(!out.includes('data:'), 'data src dropped');
  assert.ok(out.includes('>x</a>'), 'anchor text kept');
  assert.ok(out.includes('<img'), 'img kept without src');
});

test('transformEntryContent: strips width/height, lazy images', () => {
  const out = transformEntryContent('<p><img src="https://x/y.jpg" width="100" height="50"><span><img src="https://x/z.jpg"></span></p>', 'https://x/');
  assert.ok(!out.includes('width=') && !out.includes('height='));
  assert.ok(out.includes('data-original="https://x/y.jpg"'));
  assert.ok(out.includes('下载此图'));
});

test('extractMagnets: magnet + baidu', () => {
  const text = 'magnet/x 0123456789abcdef0123456789abcdef01234567 end and abc12345 wxyz https://pan.baidu.com/s/abc12345?x=1 提取码: wxyz';
  const out = extractMagnets(text);
  assert.equal(out[0], '0123456789abcdef0123456789abcdef01234567');
  assert.ok(out.includes('abc12345,wxyz'), 'baidu pair');
});

test('parseCommentList: nesting, votes, faces', () => {
  const json = JSON.parse(fixture('comments-63117.json'));
  const list = parseCommentList(json.data.comment_list, 'https://www.hacg.icu/wp/wp-content/plugins/wpdiscuz/');
  assert.ok(list.length >= 20, 'many top comments');
  const c0 = list.find((c) => c.id === 141902);
  assert.ok(c0, 'first comment by id');
  assert.equal(c0.parent, 0);
  assert.equal(c0.user, 'QM');
  assert.equal(c0.moderation, 224);
  assert.ok(c0.content.includes('神社'), 'content extracted');
  assert.equal(c0.time, '6 年 之前');
  assert.ok(c0.children.length >= 1, 'has replies');
  assert.equal(c0.children[0].depth, 2);
  assert.equal(c0.children[0].parent, 141902);
  assert.ok(c0.face.startsWith('https://'), 'face absolute');
});

test('parseCommentList: empty result', () => {
  const list = parseCommentList('<!-- // From wpDiscuz\'s Caches // -->', 'https://www.hacg.icu/wp/wp-content/plugins/wpdiscuz/');
  assert.equal(list.length, 0);
});