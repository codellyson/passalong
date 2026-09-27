// One post, rendered. A draft is served, so it can be read on the real site before it goes out; the
// page marks it noindex and nothing links to it.
export default defineEventHandler(async (event) => {
  const post = await postBySlug(getRouterParam(event, "slug") || "");
  if (!post) throw createError({ statusCode: 404, statusMessage: "no such post" });
  return post;
});
