const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { createClient } = require("redis");

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

const redis = createClient({ url: REDIS_URL });

redis.on("error", (err) => {
  console.error("Redis error:", err.message);
});

const app = express();

app.use(bodyParser.json());
app.use(cors());

function commentsKey(postId) {
  return `comments:${postId}`;
}

async function getComments(postId) {
  const data = await redis.hGetAll(commentsKey(postId));

  return Object.values(data).map((value) => JSON.parse(value));
}

async function getPosts() {
  const postData = await redis.hGetAll("posts");

  const posts = await Promise.all(
    Object.values(postData).map(async (value) => {
      const post = JSON.parse(value);

      return {
        ...post,
        comments: await getComments(post.id),
      };
    })
  );

  return posts;
}

app.get("/posts", async (req, res) => {
  try {
    res.send(await getPosts());
  } catch (error) {
    console.error("GET /posts error:", error.message);
    res.status(500).send({ error: "Unable to load posts" });
  }
});

app.get("/posts/:id", async (req, res) => {
  try {
    const value = await redis.hGet("posts", req.params.id);

    if (!value) {
      return res.status(404).send({ error: "Post not found" });
    }

    const post = JSON.parse(value);

    post.comments = await getComments(post.id);

    res.send(post);
  } catch (error) {
    console.error("GET /posts/:id error:", error.message);
    res.status(500).send({ error: "Unable to load post" });
  }
});

app.post("/events", async (req, res) => {
  const { type, data } = req.body;

  try {
    if (type === "PostCreated") {
      const existing = await redis.hExists("posts", data.id);

      if (!existing) {
        await redis.hSet(
          "posts",
          data.id,
          JSON.stringify({
            id: data.id,
            title: data.title,
          })
        );
      }
    }

    if (type === "CommentCreated") {
      const key = commentsKey(data.postId);

      const existing = await redis.hExists(key, data.id);

      if (!existing) {
        await redis.hSet(
          key,
          data.id,
          JSON.stringify(data)
        );
      }
    }

    if (type === "CommentUpdated") {
      const key = commentsKey(data.postId);

      const existing = await redis.hGet(key, data.id);

      if (existing) {
        const comment = JSON.parse(existing);

        comment.status = data.status;
        comment.content = data.content ?? comment.content;

        await redis.hSet(
          key,
          data.id,
          JSON.stringify(comment)
        );
      }
    }

    res.send({});
  } catch (error) {
    console.error("Query event error:", error.message);
    res.status(500).send({ error: "Unable to process event" });
  }
});

async function start() {
  await redis.connect();

  app.listen(4002, async () => {
    console.log("Query service listening on 4002");
  });
}

start().catch((error) => {
  console.error("Query startup error:", error);
  process.exit(1);
});
