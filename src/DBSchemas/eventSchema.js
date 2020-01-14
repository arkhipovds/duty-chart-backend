const mongoose = require("mongoose");

//Determine structure for events
const eventSchema = new mongoose.Schema({
  //Timestamp of event's start
  tsStart: Number,
  //Timestamp of event's ack
  tsAck: Number,
  //Timestamp of event's end                        can be updated
  tsEnd: Number,
  //User login in Active Directory
  ADLogin: String,
  //Event's text
  text: String,
  //Trigger id in zabbix's DB
  triggerId: Number,
  //Event's host
  host: String,
  //Event's host's id
  hostId: String,
  //Event's severity
  severity: Number,
  //Duration without check                          can be updated
  freeDuration: Number,
  //Acknowledgement type                            can be updated
  ackType: String, //tooShort, none, late, inTime, maintenance, forgiven, unknown
  //
  isForgiven: Boolean,
  //
  isFinished: Boolean
});

module.exports = eventSchema;
