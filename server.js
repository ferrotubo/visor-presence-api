const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("Falta la variable de entorno MONGO_URI");
  process.exit(1);
}

const client = new MongoClient(MONGO_URI);

let collection;
let chatCollection;

async function connectDB() {
  await client.connect();
  const db = client.db("visor_presence");

  collection = db.collection("active_devices");
  chatCollection = db.collection("chat_messages");

  await collection.createIndex({ session_id: 1 }, { unique: true });
  await collection.createIndex({ last_seen: 1 });
  await collection.createIndex({ device_name: 1 });

  await chatCollection.createIndex({ timestamp: -1 });
  await chatCollection.createIndex({ session_id: 1 });
  await chatCollection.createIndex({ session_id: 1, timestamp: -1 });

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
    const session_id = String(req.body.session_id || "").trim();
    const device_name = String(req.body.device_name || "").trim();
    const map_name = String(req.body.map_name || "").trim();

    if (!session_id || !device_name || !map_name) {
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
    const session_id = String(req.body.session_id || "").trim();
    const device_name = String(req.body.device_name || "").trim();
    const map_name = String(req.body.map_name || "").trim();
    const trimmedMessage = String(req.body.message || "").trim();

    if (!session_id || !device_name || !map_name || !trimmedMessage) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (trimmedMessage.length > 500) {
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
    const session_id = String(req.query.session_id || "").trim();

    if (!session_id) {
      return res.status(400).json({ error: "Missing session_id" });
    }

    const messages = await chatCollection
      .find({ session_id })
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
