// The blog index: live posts, newest first. Drafts are reachable only by their address.
export default defineEventHandler(async () => ({ posts: await livePosts() }));
