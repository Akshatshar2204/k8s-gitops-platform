const express = require("express");
const axios = require("axios");

const POSTS_URL = process.env.POSTS_URL || "http://posts-clusterip-srv:4000";
const COMMENTS_URL = process.env.COMMENTS_URL || "http://comments-srv:4001";
const QUERY_URL = process.env.QUERY_URL || "http://query-srv:4002";
const MODERATION_URL = process.env.MODERATION_URL || "http://moderation-srv:4003";

const app = express();
app.use(express.json());

const events = [];

app.post("/events", (req, res) => {
  const event = req.body;

  events.push(event);

  axios.post(`${POSTS_URL}/events`, event);
  axios.post(`${COMMENTS_URL}/events`, event);
  axios.post(`${QUERY_URL}/events`, event);
  axios.post(`${MODERATION_URL}/events`, event);

  res.send({ status: "OK" });
});

app.get("/events", (req, res) => {
  res.send(events);
});

app.listen(4005, () => {
  console.log("Changes are updated");
  console.log("Listening on 4005");
});
