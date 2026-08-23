const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
});

const apiUrl =
  process.env.API_PUBLIC_URL ||
  process.env.FIREBASE_API_URL ||
  process.env.NETLIFY_API_URL ||
  "";
const out = path.join(__dirname, "..", "html-site", "js", "config.js");

const content = `// Local site talks to the same-origin API. Firebase hosted site uses apiBase.
window.APP_CONFIG = {
  apiBase: ${JSON.stringify(apiUrl)},
};

(function () {
  var host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    window.APP_CONFIG.apiBase = "";
    return;
  }

  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init ? Object.assign({}, init) : {};
    var isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
    var headers = new Headers(init.headers || {});
    if (window.APP_CONFIG && window.APP_CONFIG.apiBase) {
      headers.set("ngrok-skip-browser-warning", "true");
    }
    if (isFormData) headers.delete("Content-Type");
    return nativeFetch(input, Object.assign({}, init, { headers: headers }));
  };
})();
`;

fs.writeFileSync(out, content);
console.log(
  apiUrl
    ? `Wrote config.js with API: ${apiUrl} (localhost still uses same-origin)`
    : "Wrote config.js with empty apiBase (set API_PUBLIC_URL before deploy)"
);
