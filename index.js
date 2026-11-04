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

const crypto = require('crypto');
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const serviceAccount = require("./firebase-adminsdk.json");

initializeApp({
    credential: cert(serviceAccount)
});

const auth = getAuth();


function generateTrackingId() {
    const prefix = 'PRCL';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `${prefix}-${date}-${random}`;
}

// MIDDLEWARES
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true
}));

const verifyFBToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).send({
                message: "Unauthorized access"
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = await auth.verifyIdToken(token);

        req.decodedToken = decoded;
        req.decoded_email = decoded.email;

        next();

    } catch (error) {
        console.error("Firebase Token Error:", error.message);

        return res.status(401).send({
            message: "Invalid or expired token"
        });
    }
};

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
    const userCollection = database.collection("users");
    const paymentCollection = database.collection("payments");
    const ridersCollection = database.collection("riders");


    // users api

    app.post('/users',async(req,res)=>{
        const user = req.body;
        const email = user.email;
        const role = 'user';
        user.createdAt =new Date()
       const userExist = await userCollection.findOne({email})
       if(userExist){
        return res.send({ message : 'user exist'})
       }
        const result = await userCollection.insertOne(user)
        res.send(result)
    })

    // riders PI

    app.post('/riders',async(req,res)=>{
        const rider = req.body;
        const email =rider.email;
        // const riderExist = await ridersCollection.findOne({email})
        // if(riderExist){
        //     return res.send( { message : 'rider already exist'})
        // }
        
        rider.status ='pending';
        rider.createdAt=new Date()

        const result = await ridersCollection.insertOne(rider);
        res.send(result)


    })

app.get('/riders', async (req, res) => {
        const query = {};
        if (req.query.status) {
            query.status = req.query.status;
        }
        
        const cursor = ridersCollection.find(query).sort({ _id: -1 });
        const result = await cursor.toArray();
        res.send(result);
    });
app.patch('/riders/:id', verifyFBToken, async (req, res) => {
    const status = req.body.status;
    const email = req.body.email; 

    const id = req.params.id;
    const query = { _id: new ObjectId(id) };

    const updatedDoc = {
        $set: {
            status: status
        }
    };

    
    const result = await ridersCollection.updateOne(query, updatedDoc);

    
    if (status === 'approved') {
        const userQuery = { email: email };
        const updateUser = {
            $set: {
                role: 'rider'
            }
        };
        const userResult = await userCollection.updateOne(userQuery, updateUser);
    }

    res.send(result);
});
    // ================= PARCELS API ROUTES =================
    
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
            console.error("Fetch Parcels Error:", error);
            res.status(500).send({ error: "Failed to fetch parcels" });
        }
    });

    app.get('/parcels/:id', async (req, res) => {
        try {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: "Invalid Parcel ID format" });
            }
            const query = { _id: new ObjectId(id) };
            const result = await parcelCollection.findOne(query);
            if (!result) {
                return res.status(404).send({ error: "Parcel not found" });
            }
            res.send(result);
        } catch (error) {
            console.error("Fetch Parcel by ID Error:", error);
            res.status(500).send({ error: "Failed to fetch parcel" });
        }
    });
 
    app.post('/parcels', async (req, res) => {
        try {
            const parcel = req.body;
            parcel.createdAt = new Date();
            const result = await parcelCollection.insertOne(parcel);
            res.send(result);
        } catch (error) {
            console.error("Insert Parcel Error:", error);
            res.status(500).send({ error: "Failed to insert parcel" });
        }
    });

    app.delete('/parcels/:id', async (req, res) => {
        try {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: "Invalid Parcel ID format" });
            }
            const query = { _id: new ObjectId(id) };
            const result = await parcelCollection.deleteOne(query);
            res.send(result);
        } catch (error) {
            console.error("Delete Parcel Error:", error);
            res.status(500).send({ error: "Failed to delete parcel" });
        }
    });

    // ================= PAYMENT CHECKOUT SESSION API =================
    
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
                metadata: {
                    parcelId: paymentInfo.parcelId,
                    parcelName: paymentInfo.parcelName || "Parcel Delivery"
                },
                customer_email: paymentInfo.senderEmail,
                success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
            });

            res.send({ url: session.url });
            
        } catch (error) {
            console.error("Stripe Checkout Error:", error);
            res.status(500).send({ error: error.message });
        }
    });

    // ================= PAYMENT SUCCESS API ROUTE =================
    
app.patch('/payment-success', async (req, res) => {
        try {
            const sessionId = req.query.session_id;
            
            if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
                return res.status(400).send({ error: "Valid Session ID is required" });
            }

            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (session.payment_status === 'paid') {
                const transactionId = session.payment_intent;

                // 1. Check if payment already exists using transactionId
                const paymentExist = await paymentCollection.findOne({ transectionId: transactionId });
                if (paymentExist) {
                    return res.send({ 
                        success: true, 
                        message: 'Payment already exist', 
                        transectionId: transactionId, 
                        trackingId: paymentExist.trackingId 
                    });
                }

                const parcelId = session.metadata?.parcelId;
                
                if (!parcelId || !ObjectId.isValid(parcelId)) {
                    return res.status(400).send({ error: "Invalid or missing parcel ID in session metadata" });
                }

                const parcelQuery = { _id: new ObjectId(parcelId) };
              
                // 2. Check if parcel is already paid
                const existingParcel = await parcelCollection.findOne(parcelQuery);
                if (existingParcel && existingParcel.paymentStatus === 'paid') {
                    return res.send({ 
                        success: true, 
                        message: "Payment already processed",
                        trackingId: existingParcel.trackingId 
                    });
                }

                // Generate new tracking ID only when it's a fresh payment
                const trackingId = generateTrackingId();

                const update = {
                    $set: {
                        paymentStatus: 'paid',
                        trackingId: trackingId
                    }
                };
                
                // 3. Update parcel with parcelQuery 
                const result = await parcelCollection.updateOne(parcelQuery, update);
                
                const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    customerEmail: session.customer_email,
                    parcelId: parcelId,
                    parcelName: session.metadata?.parcelName,
                    transectionId: transactionId,
                    paymentStatus: session.payment_status,
                    paidAt: new Date(),
                    trackingId: trackingId
                };

                const resultPayment = await paymentCollection.insertOne(payment);
                
                return res.send({ 
                    success: true, 
                    modifyParcel: result, 
                    paymentInfo: resultPayment,
                    trackingId: trackingId,
                    transectionId: transactionId
                });
            }
            
            res.send({ success: false, message: "Payment not completed" });
        } catch (error) {
            console.error("Payment Success Error:", error);
            res.status(500).send({ error: error.message });
        }
    });

    app.get('/payments',verifyFBToken, async(req,res)=>{
        const email = req.query.email;
        console.log(req.headers)
        const query ={}
        if(email){
            query.customerEmail = email
            if(email !== req.decoded_email){
                return res.status(403).send({message:'forbidden access'})
            }
        }
        const cursor = paymentCollection.find(query).sort({paidAt:-1})
        const result = await cursor.toArray()
        res.send(result);
    })
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