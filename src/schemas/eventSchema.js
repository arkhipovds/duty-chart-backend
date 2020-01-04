const mongoose = require("mongoose");

//Determine structure for events
const eventSchema = new mongoose.Schema({
  //Timestamp of event's start
  tsStart: Number,
  //Timestamp of event's ack
  tsAck: Number,
  //Timestamp of event's end
  tsEnd: Number,
  //User login in Active Directory
  ADLogin: String,
  //Event's text
  text: String,
  //Event's host
  host: String,
  //Event's severity
  severity: Number,
  //Duration without check
  freeDuration: Number,
  //Is user forgiven ))
  isForgiven: Boolean
});

module.exports = eventSchema;
