//Include external modules
const { ApolloServer, gql } = require("apollo-server");
const mongoose = require("mongoose");

//server's parameters
const parameters = new Object({
  DBHost: "10.76.70.51",
  DBPort: "27017",
  DBName: "test"
});

//Макс. время реакции (мс)
var maxAckTime = 1000 * 60 * 10;

parameters.host = process.argv[2] ? process.argv[2] : "localhost";
parameters.port = process.argv[3] ? process.argv[3] : "4000";

//Determine structure for employees
const employeeSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  ADLogin: String,
  isRegular: Boolean,
  visibleColor: String,
  isActive: {
    type: Boolean,
    default: true
  }
});
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

//Compile model with schema "employeeSchema" and collection name "Employees"
const modelEmployee = mongoose.model("Employees", employeeSchema);
//Compile model with schema "shiftSchema" and collection name "Shifts"
const modelShift = mongoose.model("Shifts", shiftSchema);
//Compile model with schema "eventSchema" and collection name "Events"
const modelEvent = mongoose.model("Events", eventSchema);
//Compile model with schema "schemaScoring" and collection name "Scoring"
const modelScoring = mongoose.model("Scoring", scoringSchema);

//connect to mongodb-server
mongoose
  .connect(
    "mongodb://" +
      parameters.DBHost +
      ":" +
      parameters.DBPort +
      "/" +
      parameters.DBName +
      "?retryWrites=true&w=majority",
    {
      useNewUrlParser: true,
      useFindAndModify: false
    }
  )
  .then(() => console.log('Connected to DB "' + parameters.DBName + '"'))
  .catch(err => console.error(err));

//Declare types and queries for graphql-queries
const typeDefs = gql`
  type Employee {
    id: String
    fullName: String
    ADLogin: String
    isRegular: Boolean
    visibleColor: String
    isActive: Boolean
  }
  type Shift {
    id: String
    start: String
    end: String
    employeeId: String
    ackInTimeEventsCount: String
    ackNotInTimeEventsCount: String
    noAckEventsCount: String
    tooShortEventsCount: String
    normalEventsCount: String
    freeDurationSum: String
  }
  type Scoring {
    id: String
    TS: String
    ackInTimeEventsCount: String
    ackNotInTimeEventsCount: String
    noAckEventsCount: String
    tooShortEventsCount: String
    normalEventsCount: String
    freeDurationSum: String
    employeeId: String
  }
  type Event {
    id: String
    tsStart: String
    tsAck: String
    tsEnd: String
    ADLogin: String
    text: String
    host: String
    severity: String
    freeDuration: String
    isForgiven: Boolean
  }
  type Query {
    Employees: [Employee]
    activeEmployees: [Employee]

    scorings(TS: String): [Scoring]

    Shifts(TS: String): [Shift]

    events(TS: String, employeeId: String): [Event]
    maxEventTime: String
  }
  type Mutation {
    addShift(start: String, end: String, employeeId: String): Shift!
    updateShift(
      id: String
      start: String
      end: String
      employeeId: String
    ): Shift!
    deleteShift(id: String): Boolean!

    addEmployee(
      fullName: String
      ADLogin: String
      isRegular: Boolean
      visibleColor: String
    ): Employee!
    updateEmployee(
      id: String
      fullName: String
      ADLogin: String
      isRegular: Boolean
      visibleColor: String
    ): Employee!
    deleteEmployee(id: String): Boolean!

    calculateScorings(TS: String): String!
  }
`;

//resolvers for graphql
const resolvers = {
  Query: {
    Employees: async (_, args, { Employee }) => {
      const employees = await modelEmployee.find();
      return employees;
    },
    activeEmployees: async (_, args, { Employee }) => {
      const employees = await modelEmployee.find({ isActive: true });
      return employees;
    },
    scorings: async (_, { TS }, { Shift }) => {
      const month = getMonthsBorders(TS);
      const scorings = await modelScoring.find({
        TS: { $gte: month.start, $lt: month.end }
      });
      return scorings;
    },
    Shifts: async (_, { TS }, { Shift }) => {
      //Задаем отклонение от указанного времени 40 суток
      const delta = 1000 * 60 * 60 * 24 * 40;
      const days = await modelShift.find({
        start: { $gte: TS - delta, $lt: TS + delta }
      });
      return days;
    },
    events: async (_, { TS, employeeId }, { Event }) => {
      const month = getMonthsBorders(TS);
      const shifts = await modelShift.find({
        start: { $gte: month.start, $lt: month.end },
        employeeId: employeeId
      });
      var events = [];
      for (i in shifts) {
        events = events.concat(
          await modelEvent.find({
            tsStart: { $gte: shifts[i].start, $lt: shifts[i].end }
          })
        );
      }
      return events;
    },
    maxEventTime: async (_, args, { Event }) => {
      const maxTS = await modelEvent
        .find()
        .sort("-tsStart")
        .limit(1);
      return maxTS[0].tsStart;
    }
  },
  Mutation: {
    //TODO запретить смены длиннее 48 часов и отрицательные смены
    addShift: async (_, { start, end, employeeId }, { Shift }) => {
      const newShift = await new modelShift({
        start,
        end,
        employeeId
      }).save();
      await calculateScoringForShift(newShift._id);
      return newShift;
    },
    //TODO запретить смены длиннее 48 часов и отрицательные смены
    updateShift: async (_, { id, start, end, employeeId }, { Shift }) => {
      let shift = await modelShift.findOneAndUpdate(
        { _id: id },
        {
          start: start,
          end: end,
          employeeId: employeeId
        },
        { new: true }
      );
      await calculateScoringForShift(shift._id);
      return shift;
    },
    deleteShift: async (_, { id }, { Shift }) => {
      shift = await modelShift.findOneAndRemove({ _id: id });
      return shift ? true : false;
    },
    addEmployee: async (
      _,
      { fullName, ADLogin, isRegular, visibleColor },
      { Employee }
    ) => {
      const newEmployee = await new modelEmployee({
        fullName,
        ADLogin,
        isRegular,
        visibleColor
      }).save();
      return newEmployee;
    },
    updateEmployee: async (
      _,
      { id, fullName, ADLogin, isRegular, visibleColor },
      { Employee }
    ) => {
      let employee = await modelEmployee.findOneAndUpdate(
        { _id: id },
        {
          fullName: fullName,
          ADLogin: ADLogin,
          isRegular: isRegular,
          visibleColor: visibleColor
        },
        { new: true }
      );
      return employee;
    },
    deleteEmployee: async (_, { id }, { Employee }) => {
      let employee = await modelEmployee.findOneAndUpdate(
        { _id: id },
        {
          isActive: false
        },
        { new: true }
      );
      return employee ? true : false;
    },
    calculateScorings: async (_, { TS }, { Employee }) => {
      //Ищем края месяца
      const month = getMonthsBorders(TS);
      //Для всех смен в месяце считаем показатели
      await calculateScoringsForShiftsForMonth(TS);
      //Собираем список сотрудников
      var ids = await thisMonthEmployeesId(TS);
      //Перебираем сотрудников
      for (var k in ids) {
        const shifts = await modelShift.find({
          start: { $gte: month.start, $lt: month.end },
          employeeId: ids[k]
        });
        var ackInTimeEventsCount = 0;
        var ackNotInTimeEventsCount = 0;
        var noAckEventsCount = 0;
        var tooShortEventsCount = 0;
        var normalEventsCount = 0;
        var freeDurationSum = 0;
        for (i in shifts) {
          if (shifts[i].normalEventsCount || shifts[i].tooShortEventsCount) {
            ackInTimeEventsCount += shifts[i].ackInTimeEventsCount;
            ackNotInTimeEventsCount += shifts[i].ackNotInTimeEventsCount;
            noAckEventsCount += shifts[i].noAckEventsCount;
            tooShortEventsCount += shifts[i].tooShortEventsCount;
            normalEventsCount += shifts[i].normalEventsCount;
            freeDurationSum += shifts[i].freeDurationSum;
          }
        }
        //Ищем оценку по этому сотруднику за этот месяц
        var scoring = await modelScoring.find({
          TS: { $gte: month.start, $lt: month.end },
          employeeId: ids[k]
        });
        if (scoring.length > 0) {
          scoring = await modelScoring.findOneAndUpdate(
            { _id: scoring[0]._id },
            {
              employeeId: ids[k],
              TS: month.start,
              ackInTimeEventsCount: ackInTimeEventsCount,
              ackNotInTimeEventsCount: ackNotInTimeEventsCount,
              noAckEventsCount: noAckEventsCount,
              tooShortEventsCount: tooShortEventsCount,
              normalEventsCount: normalEventsCount,
              freeDurationSum: freeDurationSum
            },
            { new: true }
          );
        } else {
          await new modelScoring({
            employeeId: ids[k],
            TS: month.start,
            ackInTimeEventsCount: ackInTimeEventsCount,
            ackNotInTimeEventsCount: ackNotInTimeEventsCount,
            noAckEventsCount: noAckEventsCount,
            tooShortEventsCount: tooShortEventsCount,
            normalEventsCount: normalEventsCount,
            freeDurationSum: freeDurationSum
          }).save();
        }
      }
      k++;
      return k.toString();
    }
  }
};
//create new Apollo server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: { modelEmployee }
});
//start it
server
  .listen({ host: parameters.host, port: parameters.port })
  .then(({ url }) => {
    console.log(`Ready for GraphQL-queries on ${url}`);
  });
//Для указанного месяца выдает список id сотрудников, которые дежурили
async function thisMonthEmployeesId(TS) {
  const month = getMonthsBorders(TS);
  const shifts = await modelShift.find({
    start: { $gte: month.start, $lt: month.end }
  });
  var ids = [];
  for (i in shifts) {
    //Если такого id еще нет в массиве
    if (ids.indexOf(shifts[i].employeeId) == -1) {
      //То добавляем его
      ids.push(shifts[i].employeeId);
    }
  }
  return ids;
}
//Расчитать показатели для смены
async function calculateScoringForShift(shiftId) {
  //Ищем смену по идентификатору  //TODO написать обработчики пустого ответа
  var oneShiftArray = await modelShift.find({ _id: shiftId }).limit(1);
  var shift = oneShiftArray[0];
  var oneEmployeeArray = await modelEmployee
    .find({ _id: shift.employeeId })
    .limit(1);
  var employee = oneEmployeeArray[0];

  var events = await modelEvent
    .find({
      tsStart: {
        $gte: Number.parseInt(shift.start),
        $lt: Number.parseInt(shift.end)
      }
    })
    .sort("tsStart");
  /*
    console.log(
    "Start " +
      msToDateString(shift.start) +
      ", end " +
      msToDateString(shift.end) +
      ", length " +
      events.length
  );*/
  var ackInTimeEventsCount = 0;
  var ackNotInTimeEventsCount = 0;
  var tooShortEventsCount = 0;
  var noAckEventsCount = 0;
  var freeDurationSum = 0;
  for (i in events) { 
    //Если событие подтверждено
    if (events[i].tsAck > 0) {
      //Если успели подтвердить вовремя
      if (events[i].freeDuration <= maxAckTime) {
        freeDurationSum += events[i].freeDuration;
        ackInTimeEventsCount++;
      }
      //Если подтвердили, но не вовремя
      else {
        //Если подтвердил тот, чья была смена
        if (events[i].ADLogin === employee.ADLogin) {
          freeDurationSum += events[i].freeDuration;
          ackNotInTimeEventsCount++;
        }
        //Если подтвердил не тот, чья была смена
        else {
          noAckEventsCount++;
        }
      }
    }
    //Если событие не подтверждено
    else {
      if (events[i].freeDuration <= maxAckTime) {
        tooShortEventsCount++;
      } else {
        noAckEventsCount++;
      }
    }
  }
  await modelShift.findOneAndUpdate(
    { _id: shiftId },
    {
      ackInTimeEventsCount: ackInTimeEventsCount,
      ackNotInTimeEventsCount: ackNotInTimeEventsCount,
      noAckEventsCount: noAckEventsCount,
      tooShortEventsCount: tooShortEventsCount,
      normalEventsCount: events.length - tooShortEventsCount,
      freeDurationSum: freeDurationSum
    }
  );
  //console.log(freeDurationSum);
}
//Расчитать показатели для всех смен за месяц
async function calculateScoringsForShiftsForMonth(TS) {
  //Ищем края месяца
  const month = getMonthsBorders(TS);
  //Собираем список смен за месяц
  const shifts = await modelShift
    .find({
      start: { $gte: month.start, $lt: month.end }
    })
    .sort("start");
  //Перебираем смены
  for (i in shifts) {
    //Для каждой смены считаем показатели
    await calculateScoringForShift(shifts[i]._id);
  }
}
function getMonthsBorders(TS) {
  var theDate = new Date(Number.parseInt(TS));
  //Расчитываем начало месяца
  var theStart = new Date(theDate.getFullYear(), theDate.getMonth());
  //Расчитываем конец месяца
  var theEnd = new Date(theStart.getFullYear(), theStart.getMonth() + 1);
  return { start: theStart.getTime(), end: theEnd.getTime() };
}
//Преобразовывает UNIX-time (в мс) в строку в формате "YYYY-MM-DD HH:MM"
function msToDateString(ms) {
  if (ms > 0) {
    const tempDate = new Date(Number.parseInt(ms));
    const tempString =
      tempDate.toISOString().slice(0, 10) +
      " " +
      tempDate.toISOString().slice(11, 16);
    return tempString;
  } else return "-";
}
