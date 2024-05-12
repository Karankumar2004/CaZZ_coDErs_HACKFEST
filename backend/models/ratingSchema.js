const mongoose = require('mongoose');
const ratingSchema = new mongoose.Schema({
    rating: Number,
    forUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
const Rating = mongoose.model('Rating', ratingSchema);
module.exports = Rating;
