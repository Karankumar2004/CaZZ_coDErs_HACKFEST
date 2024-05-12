const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const passportLocalMongoose = require('passport-local-mongoose');
const Query = require('./queryschema.js');

const ImageSchema = new Schema({
    url: String,
    filename: String,
});

// Virtual for generating thumbnail URLs
ImageSchema.virtual('thumbnail').get(function () {
    return this.url.replace('/upload', '/upload/w_270,h_270');
});
const opts = { toJSON: { virtuals: true } };

const userschema = new Schema({
    fullname: String,
    username: String,
    email: String,
    phone: Number,
    post: String,
    address: String,
    city: String,
    country: String,
    organizationType: String, // New field for organization type
    organizationName: { type: String, default: '' }, // New field for organization name
    referralCode: { type: String, default: '' }, // New field for referral code
    rating: {
        average: { type: Number, default: 0 },
        count: { type: Number, default: 0 }
    },
    isAvailable: {
        type: Boolean,
        default: true,
    },
    availability: {
        day: String,
        start: String,
        end: String
    },
    taskCount: { type: Number, default: 0 },
    queries: [{
        type: Schema.Types.ObjectId,
        ref: 'Query'
    }],
    image: [ImageSchema]
}, opts);

// Apply the Passport-Local Mongoose plugin
userschema.plugin(passportLocalMongoose);

module.exports = mongoose.model('User', userschema);
