if(process.env.NODE_ENV !== 'production'){
    require('dotenv').config();
}

const express = require('express');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const { storage } = require('./cloudinary/cloudinary.js');
const upload = multer({ storage });
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const ejsMate = require('ejs-mate');
const User = require('./models/userschema.js');
const Query = require('./models/queryschema.js');
const Rating = require('./models/ratingSchema.js');
const dbUrl = process.env.DB_URL;
const MongoDBStore = require("connect-mongo");
const secret = 'thisshouldbeabettersecret';
const { isLoggedIn, isAdmin, isLegal } = require('./middleware.js');

mongoose.connect(dbUrl);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error: "));
db.once("open", () => {
    console.log("Database Connected");
});

app.engine('ejs', ejsMate);
app.use(express.urlencoded({ extended: true }));

app.set('views', path.join(__dirname, '../frontend/views'));
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.set('view engine', 'ejs');

const store = new MongoDBStore({
    mongoUrl: dbUrl,
    secret,
    touchAfter: 24 * 60 * 60
});

store.on('error', function(err){
    console.log("Error!", err);
});

const sessionConfig = {
    store,
    name: 'helpdesk',
    httpOnly: true,
    secret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + (1000 * 60 * 60 * 24 * 7),
        maxAge: (1000 * 60 * 60 * 24 * 7)
    }
};
app.use(session(sessionConfig));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

passport.use(new LocalStrategy(User.authenticate()));

app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    next();
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('templates/login.ejs');
});

app.get('/profile', isLoggedIn, (req, res) => {
    const user = req.user;
    res.render('templates/profile.ejs', { user });
});

app.post('/login', passport.authenticate('local', { failureRedirect: '/login' }), (req, res) => {
    res.redirect('/profile');
});

app.get('/logout', isLoggedIn, (req, res) => {
    req.logout(function (err) {
        if (err) { return next(err); }
        res.redirect('/login');
    });
});

app.get('/dashboard/:id', isLoggedIn, isAdmin, async(req, res) => {
    const { id } = req.params;
    const ad = await User.findById(id);
    const user = req.user;
    const queries = await Query.find({ org: ad.organizationName });
    const resolvedQueries = await Query.find({ status: 'Resolved', org: ad.organizationName });
    const resolved = resolvedQueries.length;
    res.render('templates/dashboard.ejs', { user, queries, resolved });
});

app.get('/member/queries', isLoggedIn, isLegal, async(req, res) => {
    const user = req.user;
    const queries = await Query.find({ assignedto: user._id });
    res.render('templates/allquery.ejs', { queries, user });
});

app.get('/:username/queries', isLoggedIn, async(req, res) => {
    const { username } = req.params;
    const user = req.user;
    const u = await User.find({ username });
    const queries = await Query.find({ author: u[0].username });
    res.render('templates/allquery.ejs', { queries, user });
});

app.get('/viewresolution/:id', isLoggedIn, async(req, res) => {
    const user = req.user;
    const { id } = req.params;

    const q = await Query.findById(id);
    const author = q.author;
    const rb = q.assignedto;

    const resolvedby = await User.findById(rb);

    const auth = await User.find({ username: author })

    res.render('templates/viewquery.ejs', { user, q, auth, resolvedby });
});

app.get('/autoassign/:queryId', isLoggedIn, isAdmin, async (req, res) => {
    const { queryId } = req.params;
    const query = await Query.findById(queryId);
    if (!query) return res.status(404).send('Query not found.');

    const now = new Date();
    const dayOfWeek = now.toLocaleString('en-US', { weekday: 'long' });
    const currentTime = `${now.getHours()}:${now.getMinutes()}`;

    const legalMembers = await User.find({
        post: 'Legal Team Member',
        organizationName: query.org,
        // availability: {
        //     $elemMatch: {
        //         day: dayOfWeek,
        //         start: { $lte: currentTime },
        //         end: { $gte: currentTime }
        //     }
        // }
    }).sort({ taskCount: 1, 'rating.average': -1 });

    if (legalMembers.length === 0) {
        res.status(404).send('No available legal team members found.');
        return;
    }

    const selectedMember = legalMembers[0];
    query.assignedto = selectedMember._id;
    query.status = 'Assigned';
    selectedMember.taskCount += 1;
    await query.save();
    await selectedMember.save();

    res.redirect(`/dashboard/${req.user._id}`);
});

app.post('/complete/:queryId', isLoggedIn, isAdmin, async (req, res) => {
    const { queryId } = req.params;
    const query = await Query.findById(queryId);
    if (!query) {
        return res.status(404).send('Query not found.');
    }

    const user = await User.findById(query.assignedto);
    if (user) {
        user.taskCount = Math.max(0, user.taskCount - 1);
        await user.save();
    }

    query.status = 'Completed';
    await query.save();

    res.redirect('/dashboard');
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

    const user = await User.findById(query.assignedto);
    if (user) {
        user.rating.count += 1;
        user.rating.average = ((user.rating.average * (user.rating.count - 1)) + parseInt(rating)) / user.rating.count;
        await user.save();
    }

    query.rat = rating;
    query.rated = true;
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
    newQuery.org = req.user.organizationName;
    await newQuery.save();

    const legalMembers = await User.find({ post: 'Legal Team Member', organizationName: newQuery.org })
                                   .sort({ 'rating.average': -1, 'rating.count': -1 });
    const availableMember = legalMembers.find(member => member.isAvailable);
    console.log(availableMember)

    if (availableMember) {
        availableMember.isAvailable= false;
        availableMember.save();

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

app.get('/resolve/:qid', isLoggedIn, async(req, res) => {
    const user = req.user;
    const queryId = req.params.qid;


    const q = await Query.findById(queryId);
    const rId= q.assignedto;

    const resolver= await User.findById(rId);
    resolver.isAvailable= true;
    await resolver.save();

    const a = q.author;
    const author = await User.find({ username: a });
    res.render('templates/resolutionform.ejs', { user, q, author });
});

app.post('/resolve/:id', isLoggedIn, async(req, res) => {
    const { id } = req.params;

    const q = await Query.findById(id);
    q.resolution = req.body.body;
    q.status = 'Resolved';
    q.save();
    res.redirect('/member/queries');
});

app.get('/register', (req, res) => {
    res.render('templates/register.ejs');
});

app.post('/register', upload.array('image'), async(req, res) => {
    try {
        var { fullname, username, email, phone, post, address, city, country, password, organizationType, organizationName, referralCode,availabilityStartTime,availabilityEndTime } = req.body;
        let newReferralCode = '';

        if (post !== 'Admin') organizationType = 'Join Existing';

        if (organizationType === 'Create New') {
            newReferralCode = Date.now().toString();
        } else if (organizationType === 'Join Existing') {
            const existingOrg = await User.findOne({ referralCode });
            if (existingOrg) organizationName = existingOrg.organizationName;
            if (!existingOrg) {
                throw new Error('Invalid referral code');
            }
        }

        if(!availabilityStartTime){
            availabilityStartTime=''
            availabilityEndTime=''
        }

        const newUser = new User({
            fullname, username, email, phone, post, address, city, country,
            organizationType, organizationName,
            referralCode: organizationType === 'Create New' ? newReferralCode : referralCode,
            availability:{
                start: availabilityStartTime,
                end: availabilityEndTime,
            }
        });

        newUser.image = req.files.map(f => ({ url: f.path, filename: f.filename }));

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

app.listen(8080, () => {
    console.log('Server started successfully on port 8000');
});
