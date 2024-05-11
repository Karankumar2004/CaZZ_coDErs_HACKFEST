const mongoose= require('mongoose');
const Schema= mongoose.Schema;
const passportLocalMongoose= require('passport-local-mongoose');
const Query= require('./queryschema.js');

const ImageSchema= new Schema({
    url: String,
    filename: String,
});

ImageSchema.virtual('thumbnail').get(function (){
    return this.url.replace('/upload', '/upload/w_270,h_270');
});
const opts= {toJSON: {virtuals: true}};

const userschema= new Schema({
    fullname: String,
    username: String,
    email: String,
    phone: Number,
    post: String,
    address: String,
    city: String,
    country: String,
    queries: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Query'
        }
    ],
    image: [ImageSchema]
}, opts);

userschema.plugin(passportLocalMongoose);

module.exports=mongoose.model('User',userschema);