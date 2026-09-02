const Api = {
  async apiFetch(url, opts = {}) {
    return fetch(url, { credentials: "include", ...opts });
  },
};
