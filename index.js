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

app.use((req, res, next)=>{
    res.locals.currentUser= req.user;  //this will deserialize the information stored in session
    next();
});

app.get('/', (req, res)=>{
    res.redirect('/login');
})

app.get('/login', (req, res) => {
    res.render('templates/login.ejs');
});

app.get('/profile', isLoggedIn, (req, res)=>{
    const user= req.user;
    res.render('templates/profile.ejs', {user});
})

app.post('/login', passport.authenticate('local', {failureRedirect: '/login'}), (req, res)=>{
    res.redirect('/profile');
});

app.get('/logout', isLoggedIn, (req, res)=>{
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        res.redirect('/login');
    });
})

app.get('/dashboard', isLoggedIn, isAdmin, async(req, res)=>{
    const user= req.user;
    const queries= await Query.find({});
    const r= await Query.find({status:'Resolved'});
    const resolved= r.length;
    res.render('templates/dashboard.ejs', {user, queries, resolved});
})

app.get('/member/queries',isLoggedIn, isLegal, async(req, res)=>{
    const user= req.user;
    const queries= await Query.find({assignedto: user._id});
    res.render('templates/allquery.ejs', {queries, user});
})

app.get('/:username/queries', isLoggedIn, async(req, res)=>{
    const {username}= req.params;
    const user= req.user;
    const u= await User.find({username});
    const queries= await Query.find({author: u[0].username});
    res.render('templates/allquery.ejs', {queries, user});
})

app.get('/query/:id',isLoggedIn, async(req, res)=>{
    const user= req.user;
    const id= req.params.id;
    const q= await Query.findById(id);
    const author= q.author;
    const auth= await User.find({username: author})
    const users= await User.find({post: 'Legal Team Member'})

    res.render('templates/admin_viewquery.ejs', {user, q, users, auth});
})

app.post('/assign/:uid/:qid', isLoggedIn, isAdmin, async(req, res)=>{
    const assignId= req.params.uid;
    const queryId= req.params.qid;

    const q= await Query.findById(queryId);
    q.assignedto= assignId;
    q.status= 'Assigned';
    q.save();
    res.redirect('/dashboard');
})

app.get('/raiseticket', isLoggedIn, (req, res)=>{
    const user= req.user;
    res.render('templates/raiseticket.ejs', {user})
})

app.post('/raiseticket', isLoggedIn, async(req, res)=>{
    var today = new Date();

    var monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'
    ];
    var day = today.getDate();
    var monthIndex = today.getMonth();
    var year = today.getFullYear();
    var formattedDate = day + '-' + monthNames[monthIndex] + '-' + year;

    const user= req.user;
    const q= req.body;
    q.date= formattedDate;
    q.author= user.username;
    q.status= "Pending";

    const query= new Query(q);
    await query.save();

    user.queries.push(query);
    await user.save();

    res.redirect(`/${user.username}/queries`);
})

app.get('/viewresolution/:id', isLoggedIn, async(req, res)=>{
    const user= req.user;
    const {id}= req.params;

    const q= await Query.findById(id);
    const author= q.author;
    const rb= q.assignedto;

    const resolvedby= await User.findById(rb);

    const auth= await User.find({username: author})

    res.render('templates/viewquery.ejs', {user, q, auth, resolvedby});
})

app.get('/resolve/:qid', isLoggedIn, async(req, res)=>{
    const user= req.user;
    const queryId= req.params.qid;

    const q= await Query.findById(queryId);
    const a= q.author;
    const author= await User.find({username: a});
    res.render('templates/resolutionform.ejs', {user, q, author})
})

app.post('/resolve/:id', isLoggedIn, async(req, res)=>{
    const {id}= req.params;

    const q= await Query.findById(id);
    q.resolution= req.body.body;
    q.status= 'Resolved';
    q.save();
    res.redirect('/member/queries');
})

app.get('/register', (req, res)=>{
    res.render('templates/register.ejs');
})

app.post('/register', upload.array('image'), async(req, res)=>{
    try{
        const {fullname, username, email, phone, post, address, city, country, password}= req.body;
        const u = new User({fullname, username, email, phone, post, address, city, country});
        u.image =req.files.map(f=>({url:f.path, filename: f.filename}));
        const newUser= await User.register(u, password);
        req.login(newUser, (err)=>
        {
            if(err) return next(err);
            res.redirect('/profile');
        });
    }catch(error){
        console.log('ERROR', error)
        res.redirect('/register');
    }
})

app.listen(8090, () => {
    console.log('Server started successfully on port 8090');
});
