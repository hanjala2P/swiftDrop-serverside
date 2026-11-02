const express = require('express');
const cors = require('cors');
const dns = require('dns');
require('dotenv').config(); 

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// --- DNS CONFIGURATION ---
dns.setServers(['8.8.8.8', '8.8.4.4']); 
dns.setDefaultResultOrder('ipv4first');

const app = express();
const port = process.env.PORT || 5000;

// MIDDLEWARES
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true
}));

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
    console.log("🔥 Successfully connected to MongoDB!");

    const database = client.db("SwiftDrop");
    const parcelCollection = database.collection("parcels");

    // PARCELS API ROUTES
    app.get('/parcels', async (req, res) => {
        try {
            const { email } = req.query;
            const query = {};
            if (email) {
                query.$or = [
                    { senderEmail: email },
                    { email: email }
                ];
            }
            const parcels = await parcelCollection.find(query).sort({ createdAt: -1 }).toArray();
            res.send(parcels);
        } catch (error) {
            res.status(500).send({ error: "Failed to fetch parcels" });
        }
    });

    app.get('/parcels/:id', async (req, res) => {
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const result = await parcelCollection.findOne(query);
        res.send(result);
    });
 
    app.post('/parcels', async (req, res) => {
        try {
            const parcel = req.body;
            parcel.createdAt = new Date();
            const result = await parcelCollection.insertOne(parcel);
            res.send(result);
        } catch (error) {
            res.status(500).send({ error: "Failed to insert parcel" });
        }
    });

    app.delete('/parcels/:id', async (req, res) => {
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const result = await parcelCollection.deleteOne(query);
        res.send(result);
    });

  // PAYMENT CHECKOUT SESSION API
    app.post("/create-checkout-session", async (req, res) => {
        try {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.cost) * 100;
            
            const session = await stripe.checkout.sessions.create({
             
                line_items: [
                    {
                        price_data: {
                            currency: 'bdt',
                            unit_amount: amount,
                            product_data: {
                                name: paymentInfo.parcelName || "Parcel Delivery",
                            },
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                customer_email: paymentInfo.senderEmail,
                success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
            });

            console.log(session);
            res.send({ url: session.url });
            
        } catch (error) {
            console.error("Stripe Error:", error);
            res.status(500).send({ error: error.message });
        }
    });

  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('SwiftDrop server is running smoothly!');
});

app.listen(port, () => {
    console.log(`🚀 Server is listening on port ${port}`);
});