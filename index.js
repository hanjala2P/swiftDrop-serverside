const express = require('express');
const cors = require('cors');
const dns = require('dns');
const { MongoClient, ServerApiVersion } = require('mongodb');

// --- DNS CONFIGURATION (DNS & SRV fix) ---
dns.setServers(['8.8.8.8', '8.8.4.4']); 
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

// Test Route
app.get('/', (req, res) => {
    res.send('hellow world');
});

// MongoDB Connection Setup
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
    await client.connect();
    
    
    const database = client.db("SwiftDrop");
    const parcelCollection = database.collection("parcels");

  
    app.get('/percels', async (req, res) => {
        try {
            const query = {};
            const {email}=req.query;
            if(email){
                query.senderEmail=email;
            }
            const cursor = parcelCollection.find(query);
            const parcels = await cursor.toArray();
            res.send(parcels);
        } catch (error) {
            res.status(500).send({ error: "Failed to fetch parcels" });
        }
    });
 
    app.post('/percels', async (req, res) => {
        try {
            const parcel = req.body;
            const result = await parcelCollection.insertOne(parcel);
            res.send(result);
        } catch (error) {
            res.status(500).send({ error: "Failed to insert parcel" });
        }
    });

    console.log("You successfully connected to MongoDB!");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err);
  }
}

run().catch(console.dir);


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});