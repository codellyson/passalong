// One /learn page, rendered. Like a blog post, a draft is served so it can be read on the real
// site before it goes out; the page marks it noindex and nothing links to it.
export default defineEventHandler(async (event) => {
  const page = await postBySlug(getRouterParam(event, "slug") || "", "learn");
  if (!page) throw createError({ statusCode: 404, statusMessage: "no such page" });
  return page;
});
