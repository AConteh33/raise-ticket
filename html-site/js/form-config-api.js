const FormConfigAPI = {
  async get() {
    const snap = await db.collection("settings").doc("formConfig").get();
    return snap.exists ? snap.data() : null;
  },

  async save(config) {
    await db.collection("settings").doc("formConfig").set(config);
    return config;
  },
};

window.FormConfigAPI = FormConfigAPI;
