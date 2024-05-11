const mongoose = require('mongoose');

const querySchema= mongoose.Schema({
    title: String,
    body: String,
    date: String,
    author: String,
    status: String,
    assignedto: String,
    resolution: String
})

module.exports= mongoose.model('Query', querySchema);