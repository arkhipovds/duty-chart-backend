const mongoose = require("mongoose");

//Determine structure for shifts
const shiftSchema = new mongoose.Schema({
  start: Number,
  end: Number,
  employeeId: String,
  //События, подтвержденные вовремя
  ackInTimeEventsCount: Number,
  //События, подтвержденные невовремя
  ackNotInTimeEventsCount: Number,
  //Неподтвержденные события
  noAckEventsCount: Number,
  //Слишком короткие события
  tooShortEventsCount: Number,
  //Всего событий за смену
  normalEventsCount: Number,
  //Суммарная длительность, когда события оставались без подтверждения
  freeDurationSum: Number
});

module.exports = shiftSchema;
