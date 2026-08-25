"use strict";

try {
  require("./promote-beta.js");
} catch (error) {
  const message = String(error && error.message || error || "Falha desconhecida")
    .replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  console.error(error && error.stack || error);
  console.log(`::error title=Falha na validação Beta::${message}`);
  process.exitCode = 1;
}
