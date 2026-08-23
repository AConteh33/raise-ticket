const http = require("http");

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64"
);

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        })
      );
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function login() {
  const body = JSON.stringify({
    email: "admin@example.com",
    password: "admin123",
  });
  return request(
    {
      hostname: "127.0.0.1",
      port: 8080,
      path: "/api/auth/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  ).then((res) => {
    const cookie = (res.headers["set-cookie"] || [])
      .find((c) => c.startsWith("session_token="))
      ?.split(";")[0]
      ?.split("=")[1];
    if (!cookie) throw new Error("Login failed");
    return cookie;
  });
}

function buildMultipart(fields, files) {
  const boundary = "----UploadTestBoundary";
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
    );
  }
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`
      )
    );
    chunks.push(file.data);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, body: Buffer.concat(chunks) };
}

async function main() {
  const token = await login();
  const fields = {
    applicantName: "Upload Test",
    phoneNumber: "0712345678",
    issueType: "missing_cards",
    explanation: "upload test",
    leavingSoon: "no",
  };

  const cases = [
    { label: "jpeg files", files: [
      { name: "a.jpg", type: "image/jpeg", data: JPEG },
      { name: "b.jpg", type: "image/jpeg", data: JPEG },
    ]},
    { label: "camera-like octet-stream", files: [
      { name: "photo-1.jpg", type: "application/octet-stream", data: JPEG },
      { name: "photo-2.jpg", type: "application/octet-stream", data: JPEG },
    ]},
  ];

  for (const testCase of cases) {
    const { boundary, body } = buildMultipart(fields, testCase.files);
    const res = await request(
      {
        hostname: "127.0.0.1",
        port: 8080,
        path: "/api/tickets",
        method: "POST",
        headers: {
          Cookie: `session_token=${token}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
          Origin: "https://mother-app-9ca4d.web.app",
        },
      },
      body
    );
    const data = JSON.parse(res.body);
    const imageCount = data.ticket?.imageUrls?.length ?? 0;
    console.log(
      `${testCase.label}: ${res.status} images=${imageCount}`,
      res.status >= 400 ? data.error : "ok"
    );
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
