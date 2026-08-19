// Comments — mirrors InfoActivity.kt Comment model + InfoCommentPagingSource /
// vote() / commenting() using HAcg.wpdiscuz.
import * as cheerio from 'cheerio';
import { httpPostAwait } from './http.js';
import { wpdiscuz } from './config.js';
import { absAttr, jtext } from './article.js';

const WPD_ID_RE = /wpd-comm-(\d+)_(\d+)/;

// Comment(e: Element, depth) — Article.kt constructor.
// children: `e.select(">.wpd-comment-wrap~.wpd-reply")` — sibling .wpd-reply elements
// (on this theme replies are nested comment divs carrying class "wpd-reply").
export function parseCommentElement(el, $, depth = 1) {
  const idMatch = WPD_ID_RE.exec(el.attr('id') || '');
  const id = idMatch ? parseInt(idMatch[1], 10) : 0;
  const parent = idMatch ? parseInt(idMatch[2], 10) : 0;
  const wrap = el.children('.wpd-comment-wrap').first();
  const content = jtext(wrap.find('.wpd-comment-text'));
  const user = jtext(wrap.find('.wpd-comment-author'));
  const face = absAttr(wrap.find('.avatar').attr('src'), $._options?.baseURI || '') || '';
  const moderation = parseInt(wrap.find('.wpd-vote-result').text(), 10) || 0;
  const time = jtext(wrap.find('.wpd-comment-date'));
  const children = [];
  let seenWrap = false;
  for (const child of el.children().toArray()) {
    const $c = $(child);
    if ($c.hasClass('wpd-comment-wrap')) seenWrap = true;
    else if (seenWrap && $c.hasClass('wpd-reply')) {
      children.push(parseCommentElement($c, $, depth + 1));
    }
  }
  return { id, parent, content, user, face, moderation, time, children, depth };
}

// Comment(html fragment) — comment_list body divs.
// Mirrors: Jsoup.parse(comments.data.commentList, HAcg.wpdiscuz).select("body>.wpd-comment").
export function parseCommentList(html, baseUri = null) {
  const $ = cheerio.load(html, { baseURI: baseUri });
  return $('body > .wpd-comment').map((_, c) => parseCommentElement($(c), $, 1)).get();
}

export const SORTING = {
  Vote: 'by_vote',
  Newest: 'newest',
  Oldest: 'oldest',
};

// InfoCommentPagingSource.load — wpdLoadMoreComments.
export async function loadComments(session, { postId, sorting = SORTING.Vote, offset = 0, lastParentId = 0 }) {
  const form = {
    action: 'wpdLoadMoreComments',
    sorting,
    offset: `${offset}`,
    lastParentId: `${lastParentId}`,
    isFirstLoad: offset === 0 ? '1' : '0',
    wpdType: '',
    postId: `${postId}`,
  };
  const json = await httpPostAwait(session, wpdiscuz(), form);
  if (!json) throw new Error('评论加载失败');
  const parsed = safeParse(json.html);
  if (!parsed || parsed.success !== true) throw new Error(parsed?.data?.message || '评论加载失败');
  const data = parsed.data;
  // wpdiscuz returns snake_case keys; the app maps them via @SerializedName
  const list = data.comment_list ? parseCommentList(data.comment_list, wpdiscuz()) : [];
  const next = data.is_show_load_more
    ? { lastParentId: parseInt(data.last_parent_id, 10) || 0, offset: offset + 1 }
    : null;
  return { list, next };
}

// vote() — wpdVoteOnComment.
// Returns { votes } on success, or { error } on failure.
export async function voteComment(session, { commentId, voteType, postId }) {
  const json = await httpPostAwait(
    session,
    wpdiscuz(),
    { action: 'wpdVoteOnComment', commentId: `${commentId}`, voteType: `${voteType}`, postId: `${postId}` }
  );
  if (!json) return { error: '投票失败' };
  const parsed = safeParse(json.html);
  if (parsed?.success === true && parsed?.data?.votes != null) {
    return { votes: parseInt(parsed.data.votes, 10) || 0 };
  }
  return { error: parsed?.data || json.html || '投票失败' };
}

// commenting() — wpdAddComment. Mirrors the Android dialog submit path (multipart form).
export async function postComment(session, fields) {
  const form = {
    action: 'wpdAddComment',
    submit: '发表评论',
    postId: `${fields.postId}`,
    wpdiscuz_unique_id: fields.wpdiscuzUniqueId || '0_0',
    wc_comment_depth: `${fields.depth ?? 1}`,
    ...(fields.author != null ? { wc_name: fields.author } : {}),
    ...(fields.email != null ? { wc_email: fields.email } : {}),
    wc_comment: fields.content,
  };
  const json = await httpPostAwait(session, wpdiscuz(), form);
  if (!json) return { error: '提交失败' };
  const parsed = safeParse(json.html);
  if (parsed?.success === true) {
    // parse the returned comment html (message) — first body>.wpd-comment
    const message = parsed.data?.message || '';
    const list = parseCommentList(`<body>${message}</body>`, (json.url || wpdiscuz()));
    if (list.length) return { comment: list[0] };
    return { error: parsed.data?.code || json.html };
  }
  return { error: parsed?.data?.code || parsed?.data?.message || json.html || '提交失败' };
}

function safeParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}