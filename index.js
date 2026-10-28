const express= require('express')
const app = express()
const cors = require('cors')


// middlewire
app.use(express.json());
app.use(cors());
require('dotenv').config();

const port =process.env.PORT ||5000

app.get('/',(req,res)=>{
    res.send('hellow world')
});

app.listen(port,()=>{
    console.log(`example app listening on port ${port}`)
})