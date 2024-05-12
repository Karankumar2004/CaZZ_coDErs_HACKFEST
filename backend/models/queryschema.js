const mongoose = require('mongoose');

const querySchema = mongoose.Schema({
    title: String,
    body: String,
    date: String,  // You might still consider changing this to a Date type for more flexibility
    author: String,
    status: String,
    assignedto: String,
    resolution: String,
    rated: {
        type: Boolean,
        default: false
    },
    org: String,
    rat: String,
    startTime: Date,  // Added start time for when the task is expected to begin
    endTime: Date     // Added end time for when the task is expected to be completed
});

module.exports = mongoose.model('Query',querySchema);