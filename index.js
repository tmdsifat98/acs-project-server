const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const serviceAccount = require("./firebase-sdk-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@alpha10.qadkib3.mongodb.net/?retryWrites=true&w=majority&appName=Alpha10`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("acs");
    const userCollection = db.collection("users");
    const teacherCollection = db.collection("teachers");

    // set user on database with role
    app.post("/users", async (req, res) => {
      const { email, name } = req.body;
      const updatedUser = {
        email,
        name,
        role: "user",
        createdAt: new Date().toISOString(),
        lastLogIn: new Date().toISOString(),
      };
      const isExist = await userCollection.findOne({ email: email });
      if (!!isExist) {
        const result = await userCollection.updateOne(
          { email: email },
          { $set: { lastLogIn: new Date().toISOString() } }
        );
        res.send(result);
        return;
      }
      const result = await userCollection.insertOne(updatedUser);
      res.send(result);
    });

    //get user by email
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      if (!user) {
        return res.status(404).json({ role: "unknown" });
      }
      res.send({ role: user.role || "user" });
    });

    // teacher request post
    app.post("/teachers", async (req, res) => {
      const teacher = req.body;
      const result = await teacherCollection.insertOne(teacher);
      res.send(result);
    });

    //get pending teachers
    app.get("/teachers", async (req, res) => {
      const status = req.query.status;
      const pendingTeachers = await teacherCollection
        .find({ status: status })
        .toArray();
      res.send(pendingTeachers);
    });

    app.patch("/teachers/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      const result = await teacherCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });
    // PATCH /users/role/:email
    app.patch("/users/role/:email", async (req, res) => {
      const { email } = req.params;
      const { role } = req.body;
      const result = await userCollection.updateOne(
        { email },
        { $set: { role } }
      );
      res.send(result);
    });
    // DELETE /teachers/:id
    app.delete("/teachers/:id", async (req, res) => {
      const { id } = req.params;
      const result = await teacherCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const role = req.query.role;
      const result = await userCollection.find({ role: role }).toArray();
      res.send(result);
    });

    // DELETE /users/:id
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.delete("/users/firebase/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        await admin.auth().deleteUser(userRecord.uid);
        res.send({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to delete from Firebase" });
      }
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Profast community");
});

app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
