function normalizeParam(value) {
  if (Array.isArray(value)) return value.join("");
  return String(value || "");
}

function isSafeCountry(value) {
  return /^[A-Za-z0-9_]+$/.test(value);
}

function isSafePlaceId(value) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function stripJpgSuffix(value) {
  if (value.toLowerCase().endsWith(".jpg")) return value.slice(0, -4);
  return value;
}

export async function onRequestGet(context) {
  const countryRaw = normalizeParam(context.params.country).trim().toUpperCase();
  const placeRaw = normalizeParam(context.params.place).trim();
  const placeId = stripJpgSuffix(placeRaw);

  if (!isSafeCountry(countryRaw) || !isSafePlaceId(placeId)) {
    return new Response("Invalid path", { status: 400 });
  }

  const objectKey = `images/placeholders/${countryRaw}/${placeId}.jpg`;
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
