if(process.env.NODE_ENV !== 'production'){
    require('dotenv').config();
}

const express = require('express');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const multer= require('multer');
const {storage} = require('./cloudinary/cloudinary.js');
const upload= multer({storage});
const session= require('express-session')
const passport= require('passport');
const LocalStrategy= require('passport-local');
const ejsMate = require('ejs-mate');
const User= require('./models/userschema.js');
const Query= require('./models/queryschema.js')
//const dbUrl= 'mongodb://localhost:27017/helpdesk';
// const dbUrl= 'mongodb://localhost:27017/helpdesk';
const dbUrl= process.env.DB_URL;
const MongoDBStore= require("connect-mongo");
const secret='thisshouldbeabettersecret';
const {isLoggedIn, isAdmin, isLegal}= require('./middleware.js')

mongoose.connect(dbUrl);

const db= mongoose.connection;
db.on("error", console.error.bind(console, "connection error: "));
db.once("open", ()=>{
    console.log("Database Connected");
});

app.engine('ejs', ejsMate);
app.use(express.urlencoded({ extended: true }));

app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' directory
app.set('view engine', 'ejs');

const store = new MongoDBStore({
    mongoUrl: dbUrl,
    secret,
    touchAfter: 24*60*60 //time is in seconds
});

store.on('error', function(err){
    console.log("Error!", err);
})

const sessionConfig= {
    store, //using mongo to save our session
    name: 'helpdesk',
    httpOnly: true, //this will protect our cookie to be accessed using JS code.. it can only be accessed through http//
    // secure: true, //our cookie can be changed only over https(s stands for secure)
    secret,
    resave: false,           //just for removing deprecation warnings
    saveUninitialized: true, //just for removing deprecation warnings
    cookie: {
        expires: Date.now() + (1000*60*60*24*7), //date is in milliseconds, we have set expire date as 7 days from the current date
        maxAge: (1000*60*60*24*7)
    }
}
app.use(session(sessionConfig));

app.use(passport.initialize()); //this is used to initialize a passport
app.use(passport.session()); // used for persistent login sessions, if not used, user have to login at every page

passport.serializeUser(User.serializeUser()); //storing user data
passport.deserializeUser(User.deserializeUser()); //unStoring user data

passport.use(new LocalStrategy(User.authenticate())); //using the local password strategy to authentical User (our model)
