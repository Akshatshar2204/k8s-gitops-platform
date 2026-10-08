const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const EVENT_BUS_URL =
  process.env.EVENT_BUS_URL || "http://event-bus-staging:4005";

const app = express();

app.use(bodyParser.json());

app.post("/events", async (req, res) => {
  const { type, data } = req.body;

  try {
    if (type === "CommentCreated") {
      const status = data.content.includes("orange")
        ? "rejected"
        : "approved";

      try {
        await axios.post(
          `${EVENT_BUS_URL}/events`,
          {
            type: "CommentModerated",
            data: {
              id: data.id,
              postId: data.postId,
              status,
              content: data.content,
            },
          },
          { timeout: 5000 }
        );

        console.log(
          `Comment ${data.id} moderated as ${status}`
        );
      } catch (eventError) {
        console.error(
          "Failed to send CommentModerated:",
          eventError.message
        );
      }
    }

    res.send({});
  } catch (error) {
    console.error("Moderation error:", error.message);
    res.status(500).send({ error: "Unable to process event" });
  }
});

app.listen(4003, () => {
  console.log("Moderation service listening on 4003");
});
