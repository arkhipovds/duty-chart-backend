const mongoose = require("mongoose");

//Determine structure for scoring
const scoringSchema = new mongoose.Schema({
  //Момент внутри месяца, за который посталвена оценка
  TS: String,
  //Id оцениваемого сотрудника
  employeeId: String,
  //Полное имя оцениваемого сотрудника
  employeeFullName: String,

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
  freeDurationSum: Number,
  //Среднее время подтверждения
  avgAckTime: Number,
  //% подтвержденных вовремя
  percentAckInTime: Number,
  //% подтвержденных с опозданием
  percentAckNotInTime: Number,
  //% неподтвержденных
  percentNoAck: Number,

  //"Медали"
  theQuickest: {
    type: Boolean,
    default: false
  },
  theBest: {
    type: Boolean,
    default: false
  },
  doneNorm: {
    type: Boolean,
    default: false
  }
});

module.exports = scoringSchema;
