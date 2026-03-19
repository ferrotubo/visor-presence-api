const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

const client = new MongoClient(MONGO_URI);

let collection;
let chatCollection;

async function connectDB() {
  await client.connect();
  const db = client.db("visor_presence");

  collection = db.collection("active_devices");
  chatCollection = db.collection("chat_messages");

  console.log("MongoDB conectado");
}

connectDB().catch((err) => {
  console.error("Error conectando a MongoDB:", err);
  process.exit(1);
});

app.get("/", (req, res) => {
  res.json({ status: "API running" });
});

app.post("/heartbeat", async (req, res) => {
  try {
    const { device_name, map_name, session_id } = req.body;

    if (!device_name || !map_name || !session_id) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const now = new Date();

    await collection.updateOne(
      { session_id },
      {
        $set: {
          session_id,
          device_name,
          map_name,
          last_seen: now
        }
      },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("Error en /heartbeat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/active-devices", async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 60000);

    const devices = await collection.aggregate([
      {
        $match: {
          last_seen: { $gt: cutoff }
        }
      },
      {
        $sort: {
          last_seen: -1
        }
      },
      {
        $group: {
          _id: "$device_name",
          session_id: { $first: "$session_id" },
          device_name: { $first: "$device_name" },
          map_name: { $first: "$map_name" },
          last_seen: { $first: "$last_seen" }
        }
      },
      {
        $project: {
          _id: 0,
          session_id: 1,
          device_name: 1,
          map_name: 1
        }
      },
      {
        $sort: {
          device_name: 1
        }
      }
    ]).toArray();

    res.json({
      count: devices.length,
      devices
    });
  } catch (error) {
    console.error("Error en /active-devices:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/send-message", async (req, res) => {
  try {
    const { session_id, device_name, map_name, message } = req.body;

    if (!session_id || !device_name || !map_name || !message) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const trimmedMessage = String(message).trim();

    if (trimmedMessage.length === 0) {
      return res.status(400).json({ error: "Empty message" });
    }

    if (trimmedMessage.length > 120) {
      return res.status(400).json({ error: "Message too long" });
    }

    await chatCollection.insertOne({
      session_id,
      device_name,
      map_name,
      message: trimmedMessage,
      timestamp: new Date()
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("Error en /send-message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/messages", async (req, res) => {
  try {
    const messages = await chatCollection
      .find({})
      .sort({ timestamp: -1 })
      .limit(30)
      .project({
        _id: 0,
        session_id: 1,
        device_name: 1,
        map_name: 1,
        message: 1,
        timestamp: 1
      })
      .toArray();

    res.json({
      count: messages.length,
      messages: messages.reverse()
    });
  } catch (error) {
    console.error("Error en /messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log("Servidor iniciado en puerto", PORT);
});
