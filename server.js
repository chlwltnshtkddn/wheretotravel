const { bootstrap } = require("./backend/server");

bootstrap().catch((err) => {
  console.error("[root-server] failed to start", err);
  process.exit(1);
});
