const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { randomBytes } = require("crypto");
const { createClient } = require("redis");

const EVENT_BUS_URL =
  process.env.EVENT_BUS_URL || "http://event-bus-staging:4005";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

const redis = createClient({ url: REDIS_URL });

redis.on("error", (err) => {
  console.error("Redis error:", err.message);
});

const app = express();

app.use(bodyParser.json());

async function getPosts() {
  const data = await redis.hGetAll("posts");

  return Object.values(data).map((value) => JSON.parse(value));
}

app.get("/posts", async (req, res) => {
  try {
    res.send(await getPosts());
  } catch (error) {
    console.error("GET /posts error:", error.message);
    res.status(500).send({ error: "Unable to load posts" });
  }
});

app.post("/posts/create", async (req, res) => {
  const id = randomBytes(4).toString("hex");
  const { title } = req.body;

  const post = {
    id,
    title,
  };

  try {
    await redis.hSet("posts", id, JSON.stringify(post));

    try {
      await axios.post(
        `${EVENT_BUS_URL}/events`,
        {
          type: "PostCreated",
          data: post,
        },
        { timeout: 5000 }
      );
    } catch (eventError) {
      console.error("Event Bus error:", eventError.message);
    }

    res.status(201).send(post);
  } catch (error) {
    console.error("POST /posts/create error:", error.message);
    res.status(500).send({ error: "Unable to create post" });
  }
});

app.post("/events", (req, res) => {
  console.log("Received Event:", req.body.type);
  res.send({});
});

async function start() {
  await redis.connect();

  app.listen(4000, () => {
    console.log("Posts service listening on 4000");
  });
}

start().catch((error) => {
  console.error("Posts startup error:", error);
  process.exit(1);
});
