import express from 'express';
import cors from 'cors';
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import joi from "joi";
import dayjs from "dayjs";
dotenv.config()

const app = express();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

const promise = mongoClient.connect()
promise.then(() => {
    db = mongoClient.db()
})
promise.catch((err) => console.log(err.message))

const participantSchema = joi.object({
    name: joi.string().required()
})

app.post("/participants", async(req, res) => {
    const user = req.body;

    const validation = participantSchema.validate(user);

    if(validation.error){
        return res.sendStatus(422)
    }
    console.log(user)

    try {

        const userFound = await db.collection("participants").findOne({name: user.name})
        
        if(userFound){
            return res.sendStatus(409)
        }

        await db.collection("participants").insertOne({name:user.name, lastStatus: Date.now()})

        await db.collection("messages").insertOne({         
            from: user.name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs().format('HH:mm:ss')
        
        })

        return res.sendStatus(201)
    } catch (err) {
        return console.log(err)
    }
})

app.get("/participants", async(req, res) => {
    try {
        const participants = await db.collection("participants").find().toArray();
        return res.send(participants);

    } catch (err) {
        return console.log(err)
    }
})

const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().required()
})

app.post("/messages", async(req, res) => {
    const message = req.body;
    const name = req.headers.user;
    const validation = messageSchema.validate(message);
    const {to, text, type} = req.body;
    
    if(validation.error){
        return res.sendStatus(422)
    }
    try {
        const userExists = await db.collection("participants").findOne({name: name})

        if(!userExists){
            return res.sendStatus(422);
        }
        
        const messageHasType = (type == "message" || type == "private_message"? true : false)

        if(messageHasType == false){
            return res.sendStatus(422);
        }

        await db.collection("messages").insertOne({
            from: name, 
            to: to, 
            text: text, 
            type: type, 
            time: dayjs().format('HH:mm:ss')
        })
        
        return res.sendStatus(201);
    } catch (err) {
        return console.log(err);
    }

})

app.get("/messages", async(req, res) => {
    const user = req.headers.user;
    const { limit } = req.query;
    const messageLimit = limit;
    
    try {
        const messages = await db.collection("messages").find({ $or: [ { to: user }, { to: "Todos" }, {from: user} ] }).toArray();
        
        if(!messageLimit){
            return res.send(messages);
        } 
        
        if(!Number.isInteger(messageLimit) || messageLimit < 0){
            return res.sendStatus(422);
        } 
        
        const limitedMessages = messages.slice(-messageLimit);
        return res.send(limitedMessages);
    

    } catch(err) {
        return console.log(err)
    } 
})

app.post("/status", async(req, res) => {
    const user = req.headers.user;
    
    try {
        if(!user) {
            return res.sendStatus(404);
        }
        
        const userExists = await db.collection("participants").findOne({name: user})

        if(!userExists) {
            return res.sendStatus(404);
        }
        
        await db.collection("participants").updateOne({name: user}, {$set:{lastStatus: Date.now()}})
        
        return res.sendStatus(200);

    } catch(err) {
        return console.log(err);
    }
})

setInterval(async() => {
    const inactiveTime = Date.now() - 10000;

    try {
        const participants = await db.collection("participants").find().toArray();

        for(let i = 0; i < participants.length; i++) {
            if(participants[i].lastStatus < inactiveTime){
                await db.collection("participants").deleteOne({_id: new ObjectId(participants[i]._id)})
                
                await db.collection("messages").insertOne({
                                                    from: participants[i].name, 
                                                    to: 'Todos', 
                                                    text: 'Sai da sala...', 
                                                    type: 'status', 
                                                    time: dayjs().format('HH:mm:ss')
                                                }
                )
            }
        }
        } catch (err) {
            console.log(err)
    }
}, 15000)

app.listen(5000, () => console.log("Running server on port 5000"));
