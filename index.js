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
    const routineCollection = db.collection("routines");
    const classCollection = db.collection("classes");
    const liveClassCollection = db.collection("liveClasses");

    //verify token
    const verifyFirebaseToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      const token = authHeader.split("Bearer ")[1];

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        console.error("Firebase token verification error:", error);
        res.status(401).send({ message: "Unauthorized access" });
      }
    };

    //verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email: email });
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };
    //verify teacher
    const verifyTeacher = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email: email });
      if (user?.role !== "teacher") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

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

    //make admin finder
    app.get(
      "/users/search",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.query.email;
        const query = {};
        query.email = { $regex: email, $options: "i" };
        const result = await userCollection.find(query).toArray();
        res.send(result);
      }
    );

    //make admin
    app.patch(
      "/users/admin/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "admin" } }
        );
        res.send(result);
      }
    );

    //Remove admin
    app.patch(
      "/users/admin/:id/remove",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "user" } }
        );
        res.send(result);
      }
    );

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
    app.get("/teachers", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const status = req.query.status;
      const pendingTeachers = await teacherCollection
        .find({ status: status })
        .toArray();
      res.send(pendingTeachers);
    });

    app.patch(
      "/teachers/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        const result = await teacherCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send(result);
      }
    );
    // PATCH /users/role/:email
    app.patch(
      "/users/role/:email",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const { email } = req.params;
        const { role } = req.body;
        const result = await userCollection.updateOne(
          { email },
          { $set: { role } }
        );
        res.send(result);
      }
    );
    // DELETE /teachers/:id
    app.delete(
      "/teachers/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const result = await teacherCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );

    app.get("/users", async (req, res) => {
      const role = req.query.role;
      const result = await userCollection.find({ role: role }).toArray();
      res.send(result);
    });

    // DELETE /users/:id
    app.delete(
      "/users/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const result = await userCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );
    app.delete(
      "/users/firebase/:email",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          await admin.auth().deleteUser(userRecord.uid);
          res.send({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).send({ error: "Failed to delete from Firebase" });
        }
      }
    );

    //make routine
    app.post("/routines", async (req, res) => {
      const routine = req.body;
      const result = await routineCollection.insertOne(routine);
      res.send(result);
    });

    //get routine by email
    app.get("/routines/:email", async (req, res) => {
      const email = req.params.email;
      const routine = await routineCollection.findOne({ email });
      res.send(routine);
    });

    //update routine collection
    app.put("/routines/:id", async (req, res) => {
      const id = req.params.id;
      const updatedRoutine = req.body;

      const result = await routineCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedRoutine }
      );

      res.send(result);
    });

    //add class
    app.post("/classes", async (req, res) => {
      const classData = req.body;
      const result = await classCollection.insertOne(classData);
      res.send(result);
    });

    //get all classes
    app.get("/classes", async (req, res) => {
      const sub = req.query.sub.toLowerCase();
      let result;
      if (sub === "all") {
        result = await classCollection.find().toArray();
      } else {
        result = await classCollection.find({ subjectName: sub }).toArray();
      }
      res.send(result);
    });
    //get teachers classes
    app.get(
      "/my-classes",
      verifyFirebaseToken,
      verifyTeacher,
      async (req, res) => {
        const email = req.query.email;
        try {
          const classes = await classCollection
            .find({ teacherEmail: email })
            .sort({ createdAt: -1 })
            .toArray();
          res.json(classes);
        } catch (err) {
          res.status(500).json({ message: "Server Error" });
        }
      }
    );
    //edit class content
    app.patch(
      "/classes/:id",
      verifyFirebaseToken,
      verifyTeacher,
      async (req, res) => {
        const { id } = req.params;
        const { className, youtubeLink, email } = req.body;
        console.log(className, email, id);

        try {
          const result = await classCollection.updateOne(
            {
              _id: new ObjectId(id),
              teacherEmail: email,
            },
            {
              $set: {
                className,
                youtubeLink,
              },
            }
          );

          res.send(result);
        } catch (err) {
          res.status(500).json({ message: "Server Error" });
        }
      }
    );
    //delete classes
    app.delete(
      "/classes/:id",
      verifyFirebaseToken,
      verifyTeacher,
      async (req, res) => {
        const id = req.params.id;

        try {
          const result = await classCollection.deleteOne({
            _id: new ObjectId(id),
          });

          res.send(result);
        } catch (err) {
          res.status(500).json({ message: "Server Error" });
        }
      }
    );

    //live classes post
    app.post("/live-classes", async (req, res) => {
      const classData = req.body;
      classData.createdAt = new Date();
      const result = await liveClassCollection.insertOne(classData);
      res.send(result);
    });

    //get live classes
    app.get("/live-classes", async (req, res) => {
      const result = await liveClassCollection
        .find()
        .sort({ dateTime: 1 })
        .toArray();
      res.send(result);
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
