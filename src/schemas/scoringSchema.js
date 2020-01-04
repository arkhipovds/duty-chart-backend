const mongoose = require("mongoose");

//Determine structure for scoring
const scoringSchema = new mongoose.Schema({
  //Id оцениваемого сотрудника
  employeeId: String,
  //Момент внутри месяца, за который посталвена оценка
  TS: String,
  //События, подтвержденные вовремя
  ackInTimeEventsCount: Number,
  //События, подтвержденные невовремя
  ackNotInTimeEventsCount: Number,
  //Неподтвержденные события
  noAckEventsCount: Number,
  //Слишком короткие события
  tooShortEventsCount: Number,
  //Всего событий
  normalEventsCount: Number,
  //Суммарная длительность, когда события оставались без подтверждения
  freeDurationSum: Number
});

module.exports = scoringSchema;
