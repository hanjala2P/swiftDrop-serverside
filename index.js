const express = require('express');
const cors = require('cors');
const dns = require('dns');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

// --- DNS CONFIGURATION (DNS & SRV fix) ---
dns.setServers(['8.8.8.8', '8.8.4.4']); 
dns.setDefaultResultOrder('ipv4first');

const app = express();
const port = process.env.PORT || 5000;

// =======================
// MIDDLEWARES (Fixed CORS for Credentials)
// =======================
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true
}));

// =======================
// MONGODB CONNECTION SETUP
// =======================
const uri = process.env.DATABASE_URL;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("🔥 Successfully connected to MongoDB!");

    // Database & Collections
    const database = client.db("SwiftDrop");
    const parcelCollection = database.collection("parcels");

    // =======================
    // PARCELS API ROUTES
    // =======================

    // 1. Get All Parcels (with optional email query filter)
    app.get('/parcels', async (req, res) => {
        try {
            const { email } = req.query;
            console.log("Requested Email:", email);
            
            const query = {};
            if (email) {
                query.$or = [
                    { senderEmail: email },
                    { email: email }
                ];
            }

            const parcels = await parcelCollection.find(query).toArray();
            console.log("Found Parcels:", parcels.length);
            
            res.send(parcels);
        } catch (error) {
            console.error("Error fetching parcels:", error);
            res.status(500).send({ error: "Failed to fetch parcels" });
        }
    });
 
    // 2. Insert a New Parcel
    app.post('/parcels', async (req, res) => {
        try {
            const parcel = req.body;
            const result = await parcelCollection.insertOne(parcel);
            res.send(result);
        } catch (error) {
            console.error("Error inserting parcel:", error);
            res.status(500).send({ error: "Failed to insert parcel" });
        }
    });

  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err);
  }
}

run().catch(console.dir);

// =======================
// TEST ROUTE & SERVER LISTEN
// =======================
app.get('/', (req, res) => {
    res.send('SwiftDrop server is running smoothly!');
});

app.listen(port, () => {
    console.log(`🚀 Server is listening on port ${port}`);
});