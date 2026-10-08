const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { createClient } = require("redis");

const POSTS_URL =
  process.env.POSTS_URL || "http://posts-staging:4000";

const COMMENTS_URL =
  process.env.COMMENTS_URL || "http://comments-staging:4001";

const QUERY_URL =
  process.env.QUERY_URL || "http://query-staging:4002";

const MODERATION_URL =
  process.env.MODERATION_URL || "http://moderation-staging:4003";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

const redis = createClient({ url: REDIS_URL });

redis.on("error", (err) => {
  console.error("Redis error:", err.message);
});

const app = express();

app.use(bodyParser.json());

async function getEvents() {
  const values = await redis.lRange("eventbus:events", 0, -1);

  return values.map((value) => JSON.parse(value));
}

app.post("/events", async (req, res) => {
  const event = req.body;

  try {
    await redis.rPush(
      "eventbus:events",
      JSON.stringify(event)
    );

    const requests = [
      {
        name: "posts",
        url: POSTS_URL,
      },
      {
        name: "comments",
        url: COMMENTS_URL,
      },
      {
        name: "query",
        url: QUERY_URL,
      },
      {
        name: "moderation",
        url: MODERATION_URL,
      },
    ];

    const results = await Promise.allSettled(
      requests.map((target) =>
        axios.post(`${target.url}/events`, event, {
          timeout: 5000,
        })
      )
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `Failed to deliver ${event.type} to ${requests[index].name}:`,
          result.reason?.message || result.reason
        );
      }
    });

    res.send({ status: "OK" });
  } catch (error) {
    console.error("Event Bus error:", error.message);
    res.status(500).send({ error: "Unable to process event" });
  }
});

app.get("/events", async (req, res) => {
  try {
    res.send(await getEvents());
  } catch (error) {
    console.error("GET /events error:", error.message);
    res.status(500).send({ error: "Unable to load events" });
  }
});

async function start() {
  await redis.connect();

  app.listen(4005, () => {
    console.log("Event Bus listening on 4005");
  });
}

start().catch((error) => {
  console.error("Event Bus startup error:", error);
  process.exit(1);
});
