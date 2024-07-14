require("dotenv").config();
const { nanoid } = require("nanoid");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const express = require("express");
const nunjucks = require("nunjucks");
const crypto = require("crypto");
const path = require("path");
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;


const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(cookieParser());

app.use(bodyParser.urlencoded({ extended: false }));

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

const clientPromise = MongoClient.connect(process.env.DB_URI, {
  useUnifiedTopology: true,
  minPoolSize: 10,
});

let DB
app.use(async (req, res, next) => {
  try {
    const client = await clientPromise;
    const db = client.db("skillNotes");
    req.db = db;
    DB = db
    next();
  } catch (error) {
    next(error);
  }
});


passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  const user = await DB.collection("users").findOne({ _id: new ObjectId(id) });
  done(null, user);
});




nunjucks.configure("views", {
  autoescape: true,
  express: app,
});

app.set("view engine", "njk");


const auth = () => async (req, res, next) => {
  if (!req.cookies.sessionId) {
    return next();
  }

  const user = await findUserBySessionId(req.db, req.cookies.sessionId);
  if (!user) {
    return next();
  }
  req.user = user;
  req.sessionId = req.cookies.sessionId;
  next();
};

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CLIENT_URL
},
  async function (accessToken, refreshToken, profile, cb) {
    const user = await DB.collection("users").findOne({ username: profile.emails[0].value });
    if (user) {
      return cb(null, user);
    }
    const newUser = {
      username: profile.emails[0].value,
      isNew: true
    };
    await DB.collection("users").insertOne(newUser);
    return cb(null, newUser);


  }

));







app.use('', auth(), require('./note'));

const findUserByUsername = async (db, username) => {
  const user = await db.collection("users").findOne({ username });
  return user;
};

const findUserBySessionId = async (db, sessionId) => {
  const session = await db.collection("sessions").findOne(
    { sessionId },
    {
      projection: { userID: 1 },
    }
  );
  if (!session) {
    return null;
  }

  return db.collection("users").findOne({ _id: new ObjectId(session.userID) });
};

const createSession = async (db, userID) => {
  const sessionId = nanoid();

  await db.collection("sessions").insertOne({ userID, sessionId });

  return sessionId;
};

const deleteSession = async (db, sessionId) => {
  await db.collection("sessions").deleteOne({ sessionId });
};

function hashPassword(password) {
  const hash = crypto.createHash("sha256");

  hash.update(password);
  const hashedPassword = hash.digest("hex");

  return hashedPassword;
}


app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));


app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  async function (req, res) {
    console.log('успех');
    const sessionId = await createSession(DB, req.user._id);
    console.log(req.user, 'req.user');
    res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/dashboard");
  });



app.post("/login", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;

  const user = await findUserByUsername(req.db, username);
  if (!user) {
    return res.redirect("/?authError=Неправильное имя пользователя или пароль");
  } else if (user.password !== hashPassword(password)) {
    return res.redirect("/?authError=Неправильное имя пользователя или пароль");
  }
  const sessionId = await createSession(req.db, user._id);
  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/dashboard");
});

app.post('/signup', bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;

  const user = await findUserByUsername(req.db, username);
  if (user) {
    return res.redirect("/?authError=Такое имя пользователя уже существует");
  } else {
    req.db.collection("users").insertOne({ username, password: hashPassword(password), isNew: true });
    res.status(201).redirect("/");
  }
});


app.get("/logout", auth(), async (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }
  await deleteSession(req.db, req.sessionId);
  res.clearCookie("sessionId").clearCookie("connect.sid").redirect("/");
});



app.get("/", auth(), (req, res) => {
  if (req.user) {
    return res.redirect("/dashboard");
  }
  res.render("index", { authError: req.query.authError });
});



const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server started on port http://localhost:${port}`);
})


module.exports = app;

