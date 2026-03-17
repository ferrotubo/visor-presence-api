const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// CAMBIA ESTO POR TU URI DE MONGODB
const MONGO_URI = process.env.MONGO_URI;

const client = new MongoClient(MONGO_URI);

let collection;

async function connectDB() {
  await client.connect();
  const db = client.db("visor_presence");
  collection = db.collection("active_devices");
  console.log("MongoDB conectado");
}

connectDB();

app.get("/", (req, res) => {
  res.json({ status: "API running" });
});

app.post("/heartbeat", async (req, res) => {
  const { device_name, map_name, session_id } = req.body;

  const now = new Date();

  await collection.updateOne(
    { session_id },
    {
      $set: {
        device_name,
        map_name,
        last_seen: now
      }
    },
    { upsert: true }
  );

  res.json({ ok: true });
});

app.get("/active-devices", async (req, res) => {
  const cutoff = new Date(Date.now() - 60000);

  const devices = await collection
    .find({ last_seen: { $gt: cutoff } })
    .project({ _id: 0, device_name: 1, map_name: 1 })
    .toArray();

  const lines = devices.map((device, index) => {
    return `${index + 1}|${device.device_name}|${device.map_name}`;
  });

  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(lines.join("\n"));
});

app.listen(PORT, () => {
  console.log("Servidor iniciado en puerto", PORT);
});
