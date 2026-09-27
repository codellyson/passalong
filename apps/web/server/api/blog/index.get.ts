// The blog index: published posts, newest first. Drafts are reachable only by their address.
export default defineEventHandler(async () => ({ posts: await publishedPosts() }));
