//Include external modules
const { ApolloServer } = require("apollo-server");
const mongoose = require("mongoose");
const fs = require("fs");

const typeDefs = require("./graphQL/declarations.js");
const employeeSchema = require("./DBSchemas/employeeSchema.js");
const shiftSchema = require("./DBSchemas/shiftSchema.js");
const scoringSchema = require("./DBSchemas/scoringSchema.js");
const eventSchema = require("./DBSchemas/eventSchema.js");

//Конфигурация
const configuration = {
  mongodb: {
    DBHost: "10.76.70.51",
    DBPort: "27017",
    DBName: "test"
  },
  server: {
    host: process.argv[2] ? process.argv[2] : "localhost",
    port: process.argv[3] ? process.argv[3] : "4000"
  },
  maxAckTime: 60 * 10, //Макс. время реакции дежурного (с)
  shiftsOffset: 60 * 60 * 24 * 40 //отклонение от таймстемпа при запросе списка смен (с)
};

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
      configuration.mongodb.DBHost +
      ":" +
      configuration.mongodb.DBPort +
      "/" +
      configuration.mongodb.DBName +
      "?retryWrites=true&w=majority",
    {
      useNewUrlParser: true,
      useFindAndModify: false
    }
  )
  .then(() =>
    console.log('Connected to DB "' + configuration.mongodb.DBName + '"')
  )
  .catch(err => console.error(err));

//resolvers for graphql
const resolvers = {
  Query: {
    employees: async (_, args, { Employee }) => {
      const employees = await modelEmployee.find();
      return employees;
    },
    activeEmployees: async (_, args, { Employee }) => {
      const employees = await modelEmployee.find({ isActive: true });
      return employees;
    },
    shifts: async (_, { TS }, { Shift }) => {
      const days = await modelShift.find({
        start: {
          $gte: TS - configuration.shiftsOffset * 1000,
          $lt: TS + configuration.shiftsOffset * 1000
        }
      });
      return days;
    },
    events: async (_, { TS, employeeId, ackType }, { Event }) => {
      const month = getMonthsBorders(TS);
      const shifts = await modelShift.find({
        start: { $gte: month.start, $lt: month.end },
        employeeId: employeeId
      });
      var events = [];
      for (i in shifts) {
        events = events.concat(
          await modelEvent.find({
            tsStart: { $gte: shifts[i].start, $lt: shifts[i].end },
            ackType: ackType
          })
        );
      }
      return events;
    },
    scorings: async (_, { TS }, { Shift }) => {
      const month = getMonthsBorders(TS);
      const scorings = await modelScoring.find({
        TS: { $gte: month.start, $lt: month.end }
      });
      return scorings;
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
      await updateScoringForShift(newShift._id);
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
      await updateScoringForShift(shift._id);
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
    updateScorings: async (_, { TS }, { Employee }) => {
      //Ищем края месяца
      const month = getMonthsBorders(TS);
      //Для всех смен в месяце считаем показатели
      await updateScoringsForShiftsForMonth(TS);
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
        //Удаляем старую оценку сотрудника
        await modelScoring.remove({
          TS: { $gte: month.start, $lt: month.end },
          employeeId: ids[k]
        });
        //Добавляем новую оценку
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
      k++;
      console.log("Recalculation completed" + new Date());
      return k.toString();
    }
  }
};
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
async function updateScoringForShift(shiftId) {
  //Ищем смену по идентификатору  //TODO написать обработчики пустого ответа
  let oneShiftArray = await modelShift.find({ _id: shiftId }).limit(1);
  let shift = oneShiftArray[0];
  //Ищем сотрудника по идентификатору
  let oneEmployeeArray = await modelEmployee
    .find({ _id: shift.employeeId })
    .limit(1);
  let employee = oneEmployeeArray[0];
  //Выбираем события за смену
  let events = await modelEvent
    .find({
      tsStart: {
        $gte: Number.parseInt(shift.start),
        $lt: Number.parseInt(shift.end)
      }
    })
    .sort("tsStart");
  let ackInTimeEventsCount = 0;
  let ackNotInTimeEventsCount = 0;
  let tooShortEventsCount = 0;
  let noAckEventsCount = 0;
  let freeDurationSum = 0;
  for (i in events) {
    if (events[i].ackType === "inTime") {
      freeDurationSum += events[i].freeDuration;
      ackInTimeEventsCount++;
    } else if (events[i].ackType === "late") {
      freeDurationSum += events[i].freeDuration;
      ackNotInTimeEventsCount++;
    } else if (events[i].ackType === "none") {
      noAckEventsCount++;
    } else if (events[i].ackType === "tooShort") {
      tooShortEventsCount++;
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
}
//Расчитать показатели для всех смен за месяц
async function updateScoringsForShiftsForMonth(TS) {
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
    await updateScoringForShift(shifts[i]._id);
  }
}
//Возвращает таймстемпы начала и конца месяца
function getMonthsBorders(TS) {
  var theDate = new Date(Number.parseInt(TS));
  var theStart = new Date(theDate.getFullYear(), theDate.getMonth());
  var theEnd = new Date(theStart.getFullYear(), theStart.getMonth() + 1);
  return { start: theStart.getTime(), end: theEnd.getTime() };
}

//create new Apollo server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: { modelEmployee }
});

try {
  var fileContent = fs.readFileSync("./config.txt", "utf8");
} catch (err) {
  console.error(err);
}

//start server
server
  .listen({ host: configuration.server.host, port: configuration.server.port })
  .then(({ url }) => {
    console.log(`Ready for GraphQL-queries on ${url}`);
  });
