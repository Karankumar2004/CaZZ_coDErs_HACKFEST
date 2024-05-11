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
const Query= require('./models/queryschema.js');
const Rating = require('./models/ratingSchema.js');
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

app.get('/dashboard/:id', isLoggedIn, isAdmin, async(req, res)=>{
    const {id}= req.params;
    const ad= await User.findById(id);
    const user= req.user;
    const queries= await Query.find({org: ad.organizationName});
    const r= await Query.find({status:'Resolved', org: ad.organizationName});
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

// app.get('/query/:id',isLoggedIn, async(req, res)=>{
//     const user= req.user;
//     const id= req.params.id;
//     const q= await Query.findById(id);
//     const author= q.author;
//     const auth= await User.find({username: author})
//     const users= await User.find({post: 'Legal Team Member'})

//     res.render('templates/admin_viewquery.ejs', {user, q, users, auth});
// })

// app.post('/assign/:uid/:qid', isLoggedIn, isAdmin, async(req, res)=>{
//     const assignId= req.params.uid;
//     const queryId= req.params.qid;

//     const q= await Query.findById(queryId);
//     q.assignedto= assignId;
//     q.status= 'Assigned';
//     q.save();
//     res.redirect('/dashboard');
// })

app.get('/viewresolution/:id', isLoggedIn, async(req, res)=>{
    const user= req.user;
    const {id}= req.params;

    const q= await Query.findById(id);
    const author= q.author;
    const rb= q.assignedto;

    const resolvedby= await User.findById(rb);

    const auth= await User.find({username: author})
    // console.log(resolvedby.rating.average)

    res.render('templates/viewquery.ejs', {user, q, auth, resolvedby});
})

app.get('/autoassign/:queryId', isLoggedIn, isAdmin, async (req, res) => {
    const { queryId } = req.params;
    const q= await Query.findById(queryId);
    if(!q) return res.status(404).send('Query not found.');
    const u= await User.findOne({username: q.author});
    // return res.send(u)
    // u --> contains the author of query

    const org= u.organizationName;
    const legalMembers = await User.find({ post: 'Legal Team Member', organizationName: org}).sort({ 'rating.average': -1, 'rating.count': -1 });

    // return res.send(legalMembers)


    // const query = await Query.findById(queryId);
    // if (!query) {
    //     return res.status(404).send('Query not found.');
    // }

    let assigned = false;
    for (let member of legalMembers) {
        if(member.isAvailable) {
            q.assignedto = member._id;
            q.status = 'Assigned';
            await q.save();
            assigned = true;
            break;
        }
    }

    if (!assigned) {
        res.status(404).send('No available legal team members found.');
    } else {
        res.redirect('/dashboard');
    }
});

app.post('/submitrating/:queryId', isLoggedIn, async (req, res) => {
    const { rating } = req.body;
    const { queryId } = req.params;

    const query = await Query.findById(queryId).populate('assignedto');
    if (!query) {
        return res.status(404).send('Query not found');
    }

    const newRating = new Rating({
        rating,
        forUser: query.assignedto,
        byUser: req.user._id
    });
    await newRating.save();

    // Update legal member rating
    const user = await User.findById(query.assignedto);
    if (user) {
        user.rating.count += 1;
        user.rating.average = ((user.rating.average * (user.rating.count - 1)) + parseInt(rating)) / user.rating.count;
        await user.save();
    }

    query.rat=rating;
    query.rated=true;
    await query.save();

    res.redirect(`/viewresolution/${query._id}`);
});

app.get('/raiseticket', isLoggedIn, (req, res) => {
    res.render('templates/raiseticket.ejs', { user: req.user });
});

app.post('/raiseticket', isLoggedIn, async (req, res) => {
    const today = new Date();
    const formattedDate = `${today.getDate()}-${today.toLocaleString('default', { month: 'long' })}-${today.getFullYear()}`;

    const newQueryData = {
        date: formattedDate,
        author: req.user.username,
        status: "Pending",
        ...req.body
    };

    const newQuery = new Query(newQueryData);
    newQuery.org= req.user.organizationName;
    await newQuery.save();

    const legalMembers = await User.find({ post: 'Legal Team Member' })
                                   .sort({ 'rating.average': -1, 'rating.count': -1 });
    const availableMember = legalMembers.find(member => member.isAvailable);

    if (availableMember) {
        newQuery.assignedto = availableMember._id;
        newQuery.status = 'Assigned';
        await newQuery.save();
        req.user.queries.push(newQuery);
        await req.user.save();
        res.redirect(`/${req.user.username}/queries`);
    } else {
        console.log('No available legal team members found. Query is pending assignment.');
        res.redirect(`/${req.user.username}/queries`);
    }
});

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

app.post('/register', upload.array('image'), async(req, res) => {
    try {
        var { fullname, username, email, phone, post, address, city, country, password, organizationType, organizationName, referralCode } = req.body;
        let newReferralCode = '';

        if(post!=='Admin')organizationType= 'Join Existing';

        if (organizationType === 'Create New') {
            // Generate a new referral code based on the current timestamp
            newReferralCode = Date.now().toString();
        } else if (organizationType === 'Join Existing') {

            // Check if the referral code exists
            const existingOrg = await User.findOne({ referralCode });
            // return res.send(existingOrg)

            if(existingOrg) organizationName= existingOrg.organizationName;

            // return res.send(existingOrg);

            if (!existingOrg) {
                throw new Error('Invalid referral code');
            }
        }

        // Create a new user instance with the received data including organization details
        const newUser = new User({
            fullname, username, email, phone, post, address, city, country,
            organizationType, organizationName,
            referralCode: organizationType === 'Create New' ? newReferralCode : referralCode
        });

        // Map uploaded images to user's image field
        newUser.image = req.files.map(f => ({ url: f.path, filename: f.filename }));

        // Register and log in the new user
        await User.register(newUser, password);
        req.login(newUser, (err) => {
            if (err) return next(err);
            res.redirect('/profile');
        });
    } catch (error) {
        console.log('ERROR', error);
        res.redirect('/register');
    }
});


app.listen(8000, () => {
    console.log('Server started successfully on port 8000');
});
