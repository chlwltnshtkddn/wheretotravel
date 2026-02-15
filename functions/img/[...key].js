function normalizeSplat(input) {
  if (Array.isArray(input)) return input.join("/");
  return String(input || "");
}

function isSafePath(p) {
  if (!p) return false;
  if (p.includes("..")) return false;
  if (p.startsWith("/")) return false;
  return true;
}

export async function onRequestGet(context) {
  const splat = normalizeSplat(context.params.key);
  if (!isSafePath(splat)) {
    return new Response("Invalid key", { status: 400 });
  }

  const objectKey = `images/placeholders/${splat}`;
  const bucket = context.env.WHERETO_ASSETS;
  if (!bucket) {
    return new Response("R2 binding not configured", { status: 500 });
  }

  const object = await bucket.get(objectKey);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=86400");
  headers.set("content-type", headers.get("content-type") || "image/jpeg");

  return new Response(object.body, {
    status: 200,
    headers,
  });
}
