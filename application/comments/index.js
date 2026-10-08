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

function commentsKey(postId) {
  return `comments:${postId}`;
}

async function getComments(postId) {
  const data = await redis.hGetAll(commentsKey(postId));

  return Object.values(data).map((value) => JSON.parse(value));
}

app.get("/posts/:id/comments", async (req, res) => {
  try {
    res.send(await getComments(req.params.id));
  } catch (error) {
    console.error("GET comments error:", error.message);
    res.status(500).send({ error: "Unable to load comments" });
  }
});

app.post("/posts/:id/comments", async (req, res) => {
  const postId = req.params.id;
  const commentId = randomBytes(4).toString("hex");
  const { content } = req.body;

  const comment = {
    id: commentId,
    content,
    status: "pending",
    postId,
  };

  try {
    await redis.hSet(
      commentsKey(postId),
      commentId,
      JSON.stringify(comment)
    );

    try {
      await axios.post(
        `${EVENT_BUS_URL}/events`,
        {
          type: "CommentCreated",
          data: comment,
        },
        { timeout: 5000 }
      );
    } catch (eventError) {
      console.error("Event Bus error:", eventError.message);
    }

    res.status(201).send(await getComments(postId));
  } catch (error) {
    console.error("POST comment error:", error.message);
    res.status(500).send({ error: "Unable to create comment" });
  }
});

app.post("/events", async (req, res) => {
  const { type, data } = req.body;

  try {
    if (type === "CommentModerated") {
      const commentKey = commentsKey(data.postId);

      const existing = await redis.hGet(commentKey, data.id);

      if (!existing) {
        console.warn(
          `Comment ${data.id} not found for post ${data.postId}; ignoring update`
        );
        return res.send({});
      }

      const comment = JSON.parse(existing);

      comment.status = data.status;
      comment.content = data.content ?? comment.content;

      await redis.hSet(
        commentKey,
        data.id,
        JSON.stringify(comment)
      );

      console.log("Event Received: CommentModerated");
    }
  } catch (error) {
    console.error("Comment event error:", error.message);
    return res.status(500).send({ error: "Unable to process event" });
  }

  res.send({});
});

async function start() {
  await redis.connect();

  app.listen(4001, () => {
    console.log("Comments service listening on 4001");
  });
}

start().catch((error) => {
  console.error("Comments startup error:", error);
  process.exit(1);
});
