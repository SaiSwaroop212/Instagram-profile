const http = require("http");

const wait = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health/live") {
    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        status: "ok",
      })
    );

    return;
  }

  // GET /feed
  if (req.method === "GET" && req.url === "/feed") {
    console.log("Feed request started");

    await wait(200);

    console.log("Feed request finished");

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        items: [],
        nextCursor: null,
      })
    );

    return;
  }

  res.writeHead(404, {
    "Content-Type": "application/json",
  });

  res.end(
    JSON.stringify({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    })
  );
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});